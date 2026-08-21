/**
 * Integration layer — bank & POS sync through the Phase-1 guards.
 * Sandbox adapters, real PostgreSQL: replays must be no-ops, auto-matching
 * must settle single candidates and never touch ambiguity, POS days must
 * enter once with valid tender and create deposit expectations.
 */
import { describe, expect, it } from 'vitest';
import { makeSandboxBankAdapter } from '../api/src/integrations/banks.js';
import { makeSandboxPosAdapter } from '../api/src/integrations/pos.js';
import { autoMatchPayments, syncBankIntegration, syncPosIntegration } from '../api/src/integrations/sync.js';
import type { NormalizedBankTxn } from '../api/src/integrations/types.js';
import { cashByMonth, createInvoice, createOrg, createPayment, getPayment, plByMonth, pool, uniq } from './helpers.js';

async function createIntegration(org: string, provider: string, locationId: string | null = null) {
  return (
    await pool.query(
      `INSERT INTO integrations (organization_id, provider, external_ref, location_id, credentials_ref, scopes, status)
       VALUES ($1, $2, $3, $4, $5, '["read"]'::jsonb, 'connected') RETURNING id`,
      [org, provider, uniq('ext'), locationId, uniq('vault')],
    )
  ).rows[0].id as string;
}

const acct = (id: string) => ({
  externalAccountId: id,
  institutionName: 'Bancolombia',
  accountName: 'Cuenta corriente',
  mask: '4821',
  accountType: 'checking' as const,
  currency: 'USD',
  currentBalance: 10000,
});

describe('bank feed sync', () => {
  it('imports accounts and transactions once — replaying the sync is a no-op', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'plaid');
    const txns: NormalizedBankTxn[] = [
      { externalTxnId: 'ext-1', postedAt: '2026-08-14', amount: -320.55, descriptionRaw: 'SYSCO FOOD SVC' },
      { externalTxnId: 'ext-2', postedAt: '2026-08-15', amount: 6214.0, descriptionRaw: 'CLOVER DEPOSIT 0814' },
    ];
    const adapter = makeSandboxBankAdapter({ accounts: [acct('ba-1')], transactions: new Map([['ba-1', txns]]) });

    const first = await syncBankIntegration(pool, integration, { adapter, credentials: {} });
    expect(first.txnsInserted).toBe(2);
    expect(first.txnsSkipped).toBe(0);

    const replay = await syncBankIntegration(pool, integration, { adapter, credentials: {} });
    expect(replay.txnsInserted).toBe(0);
    expect(replay.txnsSkipped).toBe(2);

    const count = await pool.query(
      `SELECT count(*) FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE ba.organization_id = $1`,
      [f.org],
    );
    expect(count.rows[0].count).toBe('2');
    const cursor = await pool.query(`SELECT sync_cursor, last_sync_at FROM integrations WHERE id = $1`, [integration]);
    expect(cursor.rows[0].sync_cursor).toBe('sandbox');
    expect(cursor.rows[0].last_sync_at).not.toBeNull();
  });

  it('auto-matches the single exact candidate and settles the payment (cash month = debit month)', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'plaid');
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 5000 });
    const payment = await createPayment({
      fixture: f, amount: 5000, date: '2026-09-03',
      allocations: [{ invoice, amount: 5000 }], settle: false,
    });
    const adapter = makeSandboxBankAdapter({
      accounts: [acct('ba-2')],
      transactions: new Map([[
        'ba-2',
        [{ externalTxnId: 'debit-1', postedAt: '2026-09-04', amount: -5000, descriptionRaw: 'ACH HUDSON VALLEY PRODUCE' }],
      ]]),
    });

    const stats = await syncBankIntegration(pool, integration, { adapter, credentials: {} });
    expect(stats.autoMatched).toBe(1);

    const p = await getPayment(payment);
    expect(p.status).toBe('settled');
    expect(p.payment_date.toISOString().slice(0, 10)).toBe('2026-09-04');

    // The invariant holds end to end: AUG expense, SEP cash, never twice.
    expect((await plByMonth(f.org)).get('2026-08-01')).toBe(5000);
    expect((await cashByMonth(f.org)).get('2026-09-01')).toBe(5000);
    expect((await cashByMonth(f.org)).get('2026-08-01') ?? 0).toBe(0);
  });

  it('leaves ambiguous candidates (two same-amount payments) for a human', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'belvo');
    const invA = await createInvoice({ fixture: f, invoiceDate: '2026-08-14', subtotal: 460 });
    const invB = await createInvoice({ fixture: f, invoiceDate: '2026-08-15', subtotal: 460 });
    await createPayment({ fixture: f, amount: 460, date: '2026-09-02', allocations: [{ invoice: invA, amount: 460 }], settle: false });
    await createPayment({ fixture: f, amount: 460, date: '2026-09-03', allocations: [{ invoice: invB, amount: 460 }], settle: false });
    const adapter = makeSandboxBankAdapter({
      accounts: [acct('ba-3')],
      transactions: new Map([[
        'ba-3',
        [{ externalTxnId: 'debit-amb', postedAt: '2026-09-03', amount: -460, descriptionRaw: 'ACH LINEN' }],
      ]]),
    });
    const stats = await syncBankIntegration(pool, integration, { adapter, credentials: {} });
    expect(stats.autoMatched).toBe(0); // held for human review
  });
});

describe('POS sync (Clover-style normalized feed)', () => {
  it('imports a business day once, with valid tender, and creates deposit expectations', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'clover', f.loc1);
    const adapter = makeSandboxPosAdapter({
      '2026-08-16': {
        businessDate: '2026-08-16',
        grossSales: 11840, discounts: 0, comps: 0, taxCollected: 1001, tips: 2148,
        tender: { cash: 1218, card: 13771, gift_card: 0, other: 0 }, // = gross + tax + tips
        checkCount: 289, externalBatchId: 'clover-m1-2026-08-16',
      },
    });

    const first = await syncPosIntegration(pool, integration, '2026-08-16', { adapter, credentials: {} });
    expect(first.imported).toBe(true);
    expect(first.depositsExpected).toBe(2); // card batch + cash deposit

    const replay = await syncPosIntegration(pool, integration, '2026-08-16', { adapter, credentials: {} });
    expect(replay.imported).toBe(false);
    expect(replay.skipped).toBe(true);

    const rows = await pool.query(
      `SELECT source, net_sales, external_batch_id FROM pos_sales WHERE organization_id = $1`,
      [f.org],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].source).toBe('clover');
    expect(Number(rows.rows[0].net_sales)).toBe(11840);

    const deposits = await pool.query(
      `SELECT deposit_type, expected_amount::numeric, expected_on FROM pos_deposits
        WHERE organization_id = $1 ORDER BY deposit_type`,
      [f.org],
    );
    expect(deposits.rowCount).toBe(2);
    expect(Number(deposits.rows[0].expected_amount)).toBe(13771); // card T+2
    expect(Number(deposits.rows[1].expected_amount)).toBe(1218); // cash T+3
  });

  it('a day with no sales imports nothing', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'clover', f.loc1);
    const adapter = makeSandboxPosAdapter({});
    const res = await syncPosIntegration(pool, integration, '2026-08-17', { adapter, credentials: {} });
    expect(res.imported).toBe(false);
    expect(res.skipped).toBe(false);
  });

  it('a provider correction updates the same row — never a second one', async () => {
    const f = await createOrg();
    const integration = await createIntegration(f.org, 'clover', f.loc1);
    const day = (gross: number, discounts: number) => ({
      businessDate: '2026-08-18',
      grossSales: gross, discounts, comps: 0, taxCollected: 100, tips: 200,
      tender: { cash: 0, card: gross - discounts + 300, gift_card: 0, other: discounts },
      checkCount: 10, externalBatchId: 'clover-m1-2026-08-18',
    });

    // First import knew nothing about discounts…
    await syncPosIntegration(pool, integration, '2026-08-18', {
      adapter: makeSandboxPosAdapter({ '2026-08-18': day(1000, 0) }), credentials: {},
    });
    // …the provider later itemizes $50 of discounts (pre-discount gross rises).
    const corrected = await syncPosIntegration(pool, integration, '2026-08-18', {
      adapter: makeSandboxPosAdapter({ '2026-08-18': day(1050, 50) }), credentials: {},
    });
    expect(corrected.imported).toBe(true);

    const rows = await pool.query(
      `SELECT gross_sales::float8 AS g, discounts::float8 AS d, net_sales::float8 AS n
         FROM pos_sales WHERE organization_id = $1 AND business_date = '2026-08-18'`,
      [f.org],
    );
    expect(rows.rowCount).toBe(1); // one day, one row — corrected in place
    expect(rows.rows[0]).toEqual({ g: 1050, d: 50, n: 1000 });
  });
});

describe('adapter guardrails', () => {
  it('real adapters refuse to run without credentials — no fake data, ever', async () => {
    const f = await createOrg();
    const plaid = await createIntegration(f.org, 'plaid');
    await expect(
      syncBankIntegration(pool, plaid, { credentials: {} }),
    ).rejects.toThrow(/missing credential/);
    const clover = await createIntegration(f.org, 'clover', f.loc1);
    await expect(
      syncPosIntegration(pool, clover, '2026-08-16', { credentials: {} }),
    ).rejects.toThrow(/missing credential/);
  });
});
