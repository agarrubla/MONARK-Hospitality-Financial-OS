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
import { resolveCredentialsFor, syncPosIntegration } from './integrations/sync.js';

const POS_PROVIDERS = new Set(['clover', 'toast', 'square', 'lightspeed']);
const BACKFILL_DAYS = Number(process.env.SYNC_BACKFILL_DAYS ?? 30);

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
  let imported = 0;
  for (let ago = 1; ago <= BACKFILL_DAYS; ago++) {
    const day = dayInTz(tz, ago);
    if (have.has(day)) continue;
    try {
      const res = await syncPosIntegration(pool, row.id, day);
      if (res.imported) imported++;
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

export function startScheduler(pool: pg.Pool): void {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);
  const tick = async () => {
    try {
      await attachConfigured(pool);
      await syncPosAll(pool);
    } catch (err) {
      console.error('scheduler tick failed:', err);
    }
  };
  void tick();
  setInterval(tick, hours * 3600_000).unref();
  console.log(`scheduler: POS sync every ${hours}h (backfill ${BACKFILL_DAYS} days)`);
}
