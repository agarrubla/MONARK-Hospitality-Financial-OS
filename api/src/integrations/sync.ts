/**
 * Sync engine — pulls provider data through the database's integrity guards.
 *
 * Nothing here books an expense: bank transactions are evidence, POS days
 * are the revenue accrual, and every insert flows through the Phase-1
 * constraints (external-id and dedupe-hash uniqueness, POS one-day-one-row,
 * tender check), so replaying a sync is always a no-op.
 */
import type pg from 'pg';
import type { BankFeedAdapter, PosAdapter } from './types.js';
import { bankAdapters } from './banks.js';
import { posAdapters } from './pos.js';
import { loadSecret } from '../secrets.js';

export interface SyncStats {
  accountsUpserted: number;
  txnsInserted: number;
  txnsSkipped: number;
  autoMatched: number;
}

/**
 * Credentials come from the vault by `integrations.credentials_ref`.
 * v1 vault: a JSON env var (MONARK_VAULT) mapping ref → credentials, so raw
 * tokens never live in the database. Tests inject credentials directly.
 */
export function resolveCredentials(ref: string): Record<string, string> {
  const vault = JSON.parse(process.env.MONARK_VAULT ?? '{}') as Record<string, Record<string, string>>;
  const creds = vault[ref];
  if (!creds) throw new Error(`vault: no credentials for ref "${ref}"`);
  return creds;
}

/** Env vault first, then the encrypted integration_secrets table. */
export async function resolveCredentialsFor(pool: pg.Pool, ref: string): Promise<Record<string, string>> {
  try {
    return resolveCredentials(ref);
  } catch {
    const stored = await loadSecret(pool, ref);
    if (!stored) throw new Error(`no credentials for ref "${ref}" (vault or database)`);
    return stored;
  }
}

export async function syncBankIntegration(
  pool: pg.Pool,
  integrationId: string,
  opts: { adapter?: BankFeedAdapter; credentials?: Record<string, string> } = {},
): Promise<SyncStats> {
  const intRow = (
    await pool.query(`SELECT * FROM integrations WHERE id = $1`, [integrationId])
  ).rows[0];
  if (!intRow) throw new Error(`integration ${integrationId} not found`);

  const adapter = opts.adapter ?? bankAdapters[intRow.provider];
  if (!adapter) throw new Error(`no bank adapter for provider "${intRow.provider}"`);
  const creds = opts.credentials ?? (await resolveCredentialsFor(pool, intRow.credentials_ref));

  const result = await adapter.sync(creds, intRow.sync_cursor);
  const stats: SyncStats = { accountsUpserted: 0, txnsInserted: 0, txnsSkipped: 0, autoMatched: 0 };

  for (const acc of result.accounts) {
    const upsert = await pool.query(
      `INSERT INTO bank_accounts (organization_id, location_id, integration_id, external_account_id,
                                  institution_name, account_name, account_mask, account_type, currency,
                                  current_balance, balance_as_of, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), 'active')
       ON CONFLICT (integration_id, external_account_id) WHERE integration_id IS NOT NULL
       DO UPDATE SET current_balance = EXCLUDED.current_balance, balance_as_of = now(), status = 'active'
       RETURNING id`,
      [
        intRow.organization_id, intRow.location_id, integrationId, acc.externalAccountId,
        acc.institutionName, acc.accountName, acc.mask, acc.accountType, acc.currency, acc.currentBalance,
      ],
    );
    stats.accountsUpserted++;
    const accountId = upsert.rows[0].id;

    for (const t of result.transactions.get(acc.externalAccountId) ?? []) {
      // The DB guards make replays no-ops: UNIQUE (account, external_txn_id).
      const ins = await pool.query(
        `INSERT INTO bank_transactions (bank_account_id, external_txn_id, posted_at, amount,
                                        description_raw, counterparty, is_pending, dedupe_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '')
         ON CONFLICT (bank_account_id, external_txn_id) WHERE external_txn_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [accountId, t.externalTxnId, t.postedAt, t.amount, t.descriptionRaw, t.counterparty ?? null, t.pending ?? false],
      );
      if (ins.rowCount) stats.txnsInserted++;
      else stats.txnsSkipped++;
    }
  }

  await pool.query(
    `UPDATE integrations SET sync_cursor = $2, last_sync_at = now(), status = 'connected' WHERE id = $1`,
    [integrationId, result.nextCursor],
  );

  stats.autoMatched = await autoMatchPayments(pool, intRow.organization_id);
  return stats;
}

/**
 * Conservative auto-matching: link a bank debit to a payment only when it is
 * the SINGLE candidate (exact amount, ≤2-day window). Ambiguity is always
 * left for a human — exactly like the reconciliation spec. Linking also
 * settles the payment when its approval chain allows it; if the DB gate
 * refuses, the evidence link still stands and the payment stays pending.
 */
export async function autoMatchPayments(pool: pg.Pool, orgId: string): Promise<number> {
  const candidates = await pool.query(
    `SELECT bank_transaction_id, payment_id, posted_at
       FROM v_payment_match_candidates
      WHERE organization_id = $1 AND candidate_count = 1 AND date_distance_days <= 2`,
    [orgId],
  );
  let matched = 0;
  for (const c of candidates.rows) {
    const link = await pool.query(
      `UPDATE payment_matches SET bank_transaction_id = $1
        WHERE id = (SELECT id FROM payment_matches
                     WHERE payment_id = $2 AND bank_transaction_id IS NULL LIMIT 1)
        RETURNING id`,
      [c.bank_transaction_id, c.payment_id],
    );
    if (!link.rowCount) continue;
    matched++;
    try {
      await pool.query(
        `UPDATE payments SET payment_date = $2, status = 'settled' WHERE id = $1 AND status IN ('scheduled', 'processing')`,
        [c.payment_id, c.posted_at],
      );
    } catch {
      // Approval gate or period lock said no — evidence stays linked,
      // settlement stays a human decision.
    }
  }
  return matched;
}

const POS_SOURCE: Record<string, string> = { clover: 'clover', toast: 'toast', square: 'square', lightspeed: 'lightspeed' };

export async function syncPosIntegration(
  pool: pg.Pool,
  integrationId: string,
  businessDate: string,
  opts: { adapter?: PosAdapter; credentials?: Record<string, string> } = {},
): Promise<{ imported: boolean; skipped: boolean; depositsExpected: number }> {
  const intRow = (
    await pool.query(`SELECT * FROM integrations WHERE id = $1`, [integrationId])
  ).rows[0];
  if (!intRow) throw new Error(`integration ${integrationId} not found`);
  if (!intRow.location_id) throw new Error('POS integrations must be assigned to a location');

  const adapter = opts.adapter ?? posAdapters[intRow.provider];
  if (!adapter) throw new Error(`no POS adapter for provider "${intRow.provider}"`);
  const creds = opts.credentials ?? (await resolveCredentialsFor(pool, intRow.credentials_ref));

  const day = await adapter.fetchDay(creds, intRow.external_ref, businessDate);
  if (!day) {
    // A re-check that now finds no sales must also remove a previously
    // imported row (e.g. after a business-day-window change, spillover sales
    // moved to the night they belong to — leaving the old row would count
    // that revenue twice).
    await pool.query(
      `DELETE FROM pos_sales
        WHERE location_id = $1 AND business_date = $2 AND source = $3::pos_source`,
      [intRow.location_id, businessDate, POS_SOURCE[intRow.provider] ?? 'manual'],
    );
    return { imported: false, skipped: false, depositsExpected: 0 };
  }

  const source = POS_SOURCE[intRow.provider] ?? 'manual';
  const refunds = day.refunds ?? 0;
  const net = day.grossSales - day.discounts - day.comps - refunds;
  // One POS day per location per source. A replay with identical numbers is a
  // no-op; a replay with DIFFERENT numbers is a provider-side correction
  // (late settles, itemized discounts) and updates the same row — never a
  // second row, so the one-day-one-row invariant holds.
  const ins = await pool.query(
    `INSERT INTO pos_sales (organization_id, location_id, business_date, source, gross_sales,
                            discounts, comps, refunds, net_sales, tax_collected, tips, tender_breakdown,
                            check_count, external_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (location_id, business_date, source) DO UPDATE
       SET gross_sales = EXCLUDED.gross_sales, discounts = EXCLUDED.discounts,
           comps = EXCLUDED.comps, refunds = EXCLUDED.refunds, net_sales = EXCLUDED.net_sales,
           tax_collected = EXCLUDED.tax_collected, tips = EXCLUDED.tips,
           tender_breakdown = EXCLUDED.tender_breakdown, check_count = EXCLUDED.check_count
     WHERE (pos_sales.gross_sales, pos_sales.discounts, pos_sales.comps, pos_sales.refunds,
            pos_sales.net_sales, pos_sales.tax_collected, pos_sales.tips, pos_sales.tender_breakdown,
            pos_sales.check_count)
           IS DISTINCT FROM
           (EXCLUDED.gross_sales, EXCLUDED.discounts, EXCLUDED.comps, EXCLUDED.refunds,
            EXCLUDED.net_sales, EXCLUDED.tax_collected, EXCLUDED.tips, EXCLUDED.tender_breakdown,
            EXCLUDED.check_count)
     RETURNING id`,
    [
      intRow.organization_id, intRow.location_id, day.businessDate, source, day.grossSales,
      day.discounts, day.comps, refunds, net, day.taxCollected, day.tips, JSON.stringify(day.tender),
      day.checkCount, day.externalBatchId ?? null,
    ],
  );
  if (!ins.rowCount) return { imported: false, skipped: true, depositsExpected: 0 };

  await pool.query(`UPDATE integrations SET last_sync_at = now(), status = 'connected' WHERE id = $1`, [integrationId]);

  // Expected deposits from tender (card T+2, cash by T+3) so reconciliation
  // can chase the money. Idempotent per window/type.
  let depositsExpected = 0;
  const expectations: Array<['card_batch' | 'cash_deposit', number, number]> = [
    ['card_batch', day.tender.card, 2],
    ['cash_deposit', day.tender.cash, 3],
  ];
  for (const [type, amount, lagDays] of expectations) {
    if (amount <= 0) continue;
    const created = await pool.query(
      `INSERT INTO pos_deposits (organization_id, location_id, deposit_type, covers_from, covers_to,
                                 expected_amount, expected_on, status)
       SELECT $1, $2, $3, $4::date, $4::date, $5, $4::date + $6::int, 'expected'
        WHERE NOT EXISTS (
          SELECT 1 FROM pos_deposits
           WHERE location_id = $2 AND deposit_type = $3 AND covers_from = $4::date AND covers_to = $4::date)
       RETURNING id`,
      [intRow.organization_id, intRow.location_id, type, day.businessDate, amount, lagDays],
    );
    if (created.rowCount) depositsExpected++;
  }
  return { imported: true, skipped: false, depositsExpected };
}
