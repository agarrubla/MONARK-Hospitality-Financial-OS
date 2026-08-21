/**
 * Scheduled POS sync. Runs on boot and every SYNC_INTERVAL_HOURS (default 6).
 *
 * Only CLOSED business days are imported (yesterday and back, in the
 * merchant's timezone): pos_sales rows are frozen on first insert, so a
 * partial day must never be written.
 *
 * POS_AUTOCONNECT (env JSON) attaches a merchant to an owner's org the first
 * time that owner exists, so a token configured before the account is created
 * connects itself:
 *   [{ "ownerEmail": "a@b.com", "provider": "clover", "merchantId": "M123",
 *      "credentialsRef": "clover-casa-d", "locationCode": "CASA-D" }]
 */
import pg from 'pg';
import { dayCutoffHour } from './integrations/pos.js';
import { resolveCredentialsFor, syncBankIntegration, syncPosIntegration } from './integrations/sync.js';

const POS_PROVIDERS = new Set(['clover', 'toast', 'square', 'lightspeed']);
const BACKFILL_DAYS = Number(process.env.SYNC_BACKFILL_DAYS ?? 30);
// Recent days are re-fetched even if already imported: providers post late
// settles and corrections, and the upsert only rewrites when numbers changed.
const REFRESH_DAYS = Number(process.env.SYNC_REFRESH_DAYS ?? 3);

const dayInTz = (tz: string, daysAgo: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() - daysAgo * 86_400_000));

interface AutoConnect {
  ownerEmail: string;
  provider: string;
  merchantId: string;
  credentialsRef: string;
  locationCode?: string;
}

async function attachConfigured(pool: pg.Pool): Promise<void> {
  const raw = process.env.POS_AUTOCONNECT;
  if (!raw) return;
  let entries: AutoConnect[];
  try {
    entries = JSON.parse(raw) as AutoConnect[];
  } catch {
    console.error('POS_AUTOCONNECT is not valid JSON — ignoring');
    return;
  }
  for (const e of entries) {
    if (!POS_PROVIDERS.has(e.provider)) continue;
    const org = (
      await pool.query(
        `SELECT uor.organization_id AS id
           FROM users u JOIN user_org_roles uor ON uor.user_id = u.id
          WHERE u.email = $1 ORDER BY uor.created_at LIMIT 1`,
        [e.ownerEmail],
      )
    ).rows[0];
    if (!org) continue; // owner has not registered yet — retry next cycle
    const loc = (
      await pool.query(
        `SELECT id FROM locations
          WHERE organization_id = $1 AND ($2::text IS NULL OR code = $2)
          ORDER BY created_at LIMIT 1`,
        [org.id, e.locationCode ?? null],
      )
    ).rows[0];
    if (!loc) continue; // no location yet — retry next cycle
    const ins = await pool.query(
      `INSERT INTO integrations (organization_id, provider, external_ref, location_id,
                                 credentials_ref, scopes, status)
       VALUES ($1, $2::integration_provider, $3, $4, $5, $6::jsonb, 'connected')
       ON CONFLICT (organization_id, provider, external_ref) DO NOTHING
       RETURNING id`,
      [org.id, e.provider, e.merchantId, loc.id, e.credentialsRef, JSON.stringify(['payments.read'])],
    );
    if (ins.rowCount) console.log(`autoconnect: ${e.provider} ${e.merchantId} attached to org ${org.id}`);
  }
}

/** Import every closed-but-missing day in the backfill window for one integration. */
export async function syncPosWindow(pool: pg.Pool, integrationId: string): Promise<number> {
  const row = (
    await pool.query(
      `SELECT id, provider, location_id, credentials_ref FROM integrations WHERE id = $1`,
      [integrationId],
    )
  ).rows[0];
  if (!row || !row.location_id) return 0;
  const creds = await resolveCredentialsFor(pool, row.credentials_ref);
  const tz = creds.timezone ?? 'UTC';
  const have = new Set(
    (
      await pool.query(
        `SELECT business_date::text AS d FROM pos_sales
          WHERE location_id = $1 AND source = $2::pos_source`,
        [row.location_id, row.provider],
      )
    ).rows.map((r) => r.d as string),
  );
  // Business day D runs until D+1 at the cutoff hour: before the cutoff,
  // "yesterday" is still an open service night — never import an open day.
  const hourNow = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()),
  );
  const firstClosed = hourNow < dayCutoffHour(creds) ? 2 : 1;
  let imported = 0;
  for (let ago = firstClosed; ago <= BACKFILL_DAYS; ago++) {
    const day = dayInTz(tz, ago);
    if (ago > REFRESH_DAYS && have.has(day)) continue;
    try {
      const res = await syncPosIntegration(pool, row.id, day);
      if (res.imported) imported++;
      // Be gentle with provider rate limits during backfills.
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`sync ${row.provider} ${row.id} ${day}: ${(err as Error).message}`);
      break; // credentials/network problem — no point hammering the rest of the window
    }
  }
  if (imported) console.log(`sync ${row.provider}: imported ${imported} day(s)`);
  return imported;
}

async function syncPosAll(pool: pg.Pool): Promise<void> {
  const rows = (
    await pool.query(
      `SELECT id FROM integrations
        WHERE provider::text = ANY($1) AND status IN ('connected', 'error') AND location_id IS NOT NULL`,
      [[...POS_PROVIDERS]],
    )
  ).rows;
  for (const row of rows) {
    try {
      await syncPosWindow(pool, row.id);
    } catch (err) {
      console.error(`sync ${row.id}: ${(err as Error).message}`);
    }
  }
}

async function runDetectors(pool: pg.Pool): Promise<void> {
  const orgs = (
    await pool.query(`SELECT DISTINCT organization_id AS id FROM invoices
                      UNION SELECT DISTINCT organization_id FROM bank_accounts`)
  ).rows;
  for (const o of orgs) {
    try {
      const dup = (await pool.query(`SELECT detect_near_duplicate_invoices($1) AS n`, [o.id])).rows[0];
      const cross = (await pool.query(`SELECT detect_cross_account_duplicates($1) AS n`, [o.id])).rows[0];
      // Processor fee debits (monthly "discount" from the card acquirer) are a
      // real expense nobody types in — surface them so they get booked.
      const fees = await pool.query(
        `INSERT INTO ai_insights (organization_id, kind, subject_type, subject_id, title, body,
                                  confidence, severity, evidence, model_version)
         SELECT ba.organization_id, 'recommendation', 'bank_transactions', bt.id,
                'Comisión del procesador de tarjetas',
                format('Débito de $%s el %s (“%s”). Parece la comisión mensual del procesador — regístrala como gasto en Fees & processing para que el P&L quede completo.',
                       abs(bt.amount), bt.posted_at, left(bt.description_raw, 60)),
                0.85, 'info',
                jsonb_build_object('bank_transaction_id', bt.id, 'amount', bt.amount, 'posted_at', bt.posted_at),
                'detector-v1'
           FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
          WHERE ba.organization_id = $1 AND bt.amount < 0 AND bt.match_status = 'unmatched'
            AND bt.description_raw ~* '(priority|merch(ant)? (serv|svcs|bnkcd)|bankcard|bkcd|mtot disc|des:discount|fdms|card proc|pmt sys)'
            AND NOT EXISTS (SELECT 1 FROM ai_insights i
                             WHERE i.kind = 'recommendation' AND i.subject_id = bt.id)
         RETURNING id`,
        [o.id],
      );
      const n = Number(dup.n) + Number(cross.n) + (fees.rowCount ?? 0);
      if (n) console.log(`detectors org ${o.id}: ${n} new insight(s)`);
    } catch (err) {
      console.error(`detectors ${o.id}: ${(err as Error).message}`);
    }
  }
}

async function syncBankAll(pool: pg.Pool): Promise<void> {
  const rows = (
    await pool.query(
      `SELECT id, provider FROM integrations
        WHERE provider::text IN ('plaid', 'belvo') AND status IN ('connected', 'error')`,
    )
  ).rows;
  for (const row of rows) {
    try {
      const stats = await syncBankIntegration(pool, row.id);
      if (stats.txnsInserted || stats.autoMatched) {
        console.log(`sync ${row.provider}: ${stats.txnsInserted} txns, ${stats.autoMatched} auto-matched`);
      }
    } catch (err) {
      console.error(`sync ${row.provider} ${row.id}: ${(err as Error).message}`);
    }
  }
}

export function startScheduler(pool: pg.Pool): void {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);
  const tick = async () => {
    try {
      await attachConfigured(pool);
      await syncPosAll(pool);
      await syncBankAll(pool);
      await runDetectors(pool);
    } catch (err) {
      console.error('scheduler tick failed:', err);
    }
  };
  void tick();
  setInterval(tick, hours * 3600_000).unref();
  console.log(`scheduler: POS sync every ${hours}h (backfill ${BACKFILL_DAYS} days)`);
}
