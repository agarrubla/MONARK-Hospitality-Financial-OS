/**
 * WhatsApp daily digest via CallMeBot (personal-notification API).
 * Vault ref `whatsapp` = { phone: "+1...", apikey: "..." }. Best-effort:
 * a failed send never touches financial state, and the digest only reads.
 */
import type pg from 'pg';
import { resolveCredentials } from '../integrations/sync.js';

export async function sendWhatsApp(text: string): Promise<boolean> {
  let creds: Record<string, string>;
  try {
    creds = resolveCredentials('whatsapp');
  } catch {
    return false; // not configured yet
  }
  try {
    const url =
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(creds.phone ?? '')}` +
      `&apikey=${encodeURIComponent(creds.apikey ?? '')}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok || /error/i.test(body)) {
      console.error(`whatsapp send failed ${res.status}: ${body.slice(0, 120)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('whatsapp send failed:', (err as Error).message);
    return false;
  }
}

const money = (n: number): string =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compact morning digest for one organization, built from the database. */
export async function buildDailyDigest(pool: pg.Pool, orgId: string): Promise<string> {
  const [org, lastDay, week, month, pending, alerts, missing] = await Promise.all([
    pool.query(`SELECT name FROM organizations WHERE id = $1`, [orgId]),
    pool.query(
      `SELECT business_date::text AS date,
              sum(gross_sales - discounts - comps - refunds)::float8 AS net,
              sum(tips)::float8 AS tips
         FROM pos_sales WHERE organization_id = $1
        GROUP BY business_date ORDER BY business_date DESC LIMIT 1`, [orgId]),
    pool.query(
      `SELECT sum(gross_sales - discounts - comps - refunds)::float8 AS net
         FROM pos_sales WHERE organization_id = $1 AND business_date >= CURRENT_DATE - 7`, [orgId]),
    pool.query(
      `SELECT sum(gross_sales - discounts - comps - refunds)::float8 AS net
         FROM pos_sales WHERE organization_id = $1
          AND date_trunc('month', business_date) = date_trunc('month', CURRENT_DATE)`, [orgId]),
    pool.query(
      `SELECT count(*)::int AS n, coalesce(sum(total), 0)::float8 AS total
         FROM invoices WHERE organization_id = $1 AND status = 'pending_approval'`, [orgId]),
    pool.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE severity = 'critical')::int AS critical
         FROM ai_insights WHERE organization_id = $1 AND status IN ('new', 'acknowledged')`, [orgId]),
    pool.query(
      `SELECT count(*)::int AS n FROM pos_deposits
        WHERE organization_id = $1 AND status = 'missing'`, [orgId]),
  ]);
  const d = lastDay.rows[0];
  const lines = [
    `🍽 MONARK · ${org.rows[0]?.name ?? ''}`,
    d
      ? `Última noche (${d.date}): ${money(Number(d.net))} netos · propinas+serv ${money(Number(d.tips))}`
      : 'Sin ventas registradas aún.',
    `Últimos 7 días: ${money(Number(week.rows[0]?.net ?? 0))} · Mes: ${money(Number(month.rows[0]?.net ?? 0))}`,
  ];
  const p = pending.rows[0];
  if (p && p.n > 0) lines.push(`📋 Por aprobar: ${p.n} factura(s) por ${money(Number(p.total))}`);
  const a = alerts.rows[0];
  if (a && a.n > 0) lines.push(`⚠ Alertas abiertas: ${a.n}${a.critical > 0 ? ` (${a.critical} crítica[s])` : ''}`);
  if (Number(missing.rows[0]?.n ?? 0) > 0) lines.push(`🚨 Depósitos sin llegar al banco: ${missing.rows[0].n}`);
  lines.push('Detalle en app.monarkhospitality.com');
  return lines.join('\n');
}
