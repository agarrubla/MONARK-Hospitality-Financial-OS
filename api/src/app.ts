/**
 * Product API — what the mobile app talks to.
 *
 * Every data request runs as the RLS-constrained `monark_app` role with the
 * session's org/user context (SET LOCAL), so tenancy is enforced by the
 * database, not by WHERE clauses. Registration and payment execution run in
 * service context because they orchestrate across the privilege boundary.
 *
 * v1 single-user policy: each organization gets a dedicated system approver
 * ("MONARK · Aprobación automática") holding the owner role. Payments are
 * approved by it automatically — separation of duties holds at the database
 * (approver ≠ creator) and the policy is recorded in every approval's
 * policy_snapshot. Multi-user orgs replace this with real chains later.
 */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { resolveCredentials } from './integrations/sync.js';
import { saveSecret } from './secrets.js';
import { extractInvoice } from './ai/invoiceExtract.js';
import { sendEmail } from './email/resend.js';
import { askFinancialAssistant } from './ai/financialAssistant.js';

/* ── Passwords (scrypt, per-user salt) ───────────────────────────────────── */

const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password: string, stored: string | null): boolean => {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/* ── Org bootstrap fixtures ──────────────────────────────────────────────── */

const CATEGORY_SEED: Array<[string, string, string]> = [
  ['COGS · Food', 'FOOD', 'cogs'],
  ['COGS · Beverage', 'BEV', 'cogs'],
  ['Labor', 'LABOR', 'labor'],
  ['Rent & occupancy', 'RENT', 'occupancy'],
  ['Utilities', 'UTIL', 'opex'],
  ['Supplies', 'SUPPLIES', 'opex'],
  ['Services & maintenance', 'SERVICES', 'opex'],
  ['Fees & processing', 'FEES', 'gna'],
  ['Other', 'OTHER', 'gna'],
];

/* ── Status mapping (schema enum ↔ app vocabulary) ───────────────────────── */

const toAppStatus = (s: string): string =>
  s === 'draft' ? 'on_hold'
  : s === 'void' ? 'rejected'
  : s === 'scheduled' || s === 'partially_paid' ? 'approved'
  : s; // pending_approval | approved | paid

interface SessionCtx { userId: string; orgId: string }

export interface PosVerifyResult {
  ok: boolean;
  name?: string;
  error?: string;
}

/** Read-only token check against the provider before anything is stored. */
async function defaultVerifyPos(
  provider: string,
  merchantId: string,
  creds: Record<string, string>,
): Promise<PosVerifyResult> {
  if (provider === 'clover') {
    const base = creds.env === 'sandbox' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com';
    let res: Response;
    try {
      res = await fetch(`${base}/v3/merchants/${merchantId}`, {
        headers: { authorization: `Bearer ${creds.api_token}` },
      });
    } catch {
      return { ok: false, error: 'No se pudo contactar a Clover — intenta de nuevo.' };
    }
    if (res.status === 401) return { ok: false, error: 'Clover rechazó el token. Revisa que lo copiaste completo.' };
    if (res.status === 404) return { ok: false, error: 'Clover no encontró ese Merchant ID con este token.' };
    if (!res.ok) return { ok: false, error: `Clover respondió con error ${res.status}.` };
    const j = (await res.json()) as { name?: string };
    return { ok: true, name: j.name };
  }
  return { ok: false, error: 'Por ahora solo Clover está disponible; Toast, Square y Lightspeed vienen en camino.' };
}

export interface ProductAppOptions {
  verifyPos?: typeof defaultVerifyPos;
  /** Kick a backfill right after a POS connects (off in tests). */
  syncAfterConnect?: (integrationId: string) => void;
  /** Kick a first bank sync right after a bank connects (off in tests). */
  syncBankAfterConnect?: (integrationId: string) => void;
}

/* ── Plaid platform keys (MONARK's own, from the env vault) ──────────────── */

const plaidPlatform = (): Record<string, string> | null => {
  try {
    return resolveCredentials('plaid-platform');
  } catch {
    return null;
  }
};
const plaidBase = (env?: string): string => `https://${env ?? 'sandbox'}.plaid.com`;

export function buildProductApp(pool: pg.Pool, opts: ProductAppOptions = {}): FastifyInstance {
  const app = Fastify({ bodyLimit: 15 * 1024 * 1024 });
  void app.register(cors, { origin: true });
  const verifyPos = opts.verifyPos ?? defaultVerifyPos;

  /** Run fn as monark_app under the caller's RLS context. */
  const asUser = async <T>(ctx: SessionCtx, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE monark_app');
      await c.query(`SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.orgId, ctx.userId]);
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  };

  const authenticate = async (req: FastifyRequest, reply: FastifyReply): Promise<SessionCtx | null> => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!token) {
      void reply.code(401).send({ error: 'no_session' });
      return null;
    }
    const row = (
      await pool.query(
        `SELECT user_id, organization_id FROM sessions
          WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [sha256(token)],
      )
    ).rows[0];
    if (!row) {
      void reply.code(401).send({ error: 'invalid_session' });
      return null;
    }
    return { userId: row.user_id, orgId: row.organization_id };
  };

  const issueSession = async (userId: string, orgId: string): Promise<string> => {
    const token = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (token_hash, user_id, organization_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 days')`,
      [sha256(token), userId, orgId],
    );
    return token;
  };

  /* ── Auth ──────────────────────────────────────────────────────────────── */

  app.post('/auth/register', async (req, reply) => {
    const { email, password, orgName } = req.body as { email: string; password: string; orgName: string };
    if (!email?.includes('@') || !password || password.length < 8 || !orgName?.trim()) {
      return reply.code(400).send({ error: 'Datos incompletos: correo válido, contraseña de 8+ caracteres y nombre del negocio.' });
    }
    const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (existing.rowCount) return reply.code(409).send({ error: 'Ese correo ya tiene una cuenta.' });

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + randomBytes(3).toString('hex');
      const orgId = (
        await c.query(`INSERT INTO organizations (name, slug, base_currency) VALUES ($1, $2, 'USD') RETURNING id`, [orgName.trim(), slug])
      ).rows[0].id;
      const userId = (
        await c.query(
          `INSERT INTO users (email, full_name, auth_provider, password_hash, status)
           VALUES ($1, $2, 'password', $3, 'active') RETURNING id`,
          [email, email.split('@')[0], hashPassword(password)],
        )
      ).rows[0].id;
      const ownerRole = (await c.query(`SELECT id FROM roles WHERE key = 'owner' AND organization_id IS NULL`)).rows[0].id;
      await c.query(
        `INSERT INTO user_org_roles (user_id, organization_id, role_id, location_scope, status) VALUES ($1, $2, $3, 'all', 'active')`,
        [userId, orgId, ownerRole],
      );
      // v1 auto-approval: a distinct system user satisfies separation of duties.
      const approverId = (
        await c.query(
          `INSERT INTO users (email, full_name, auth_provider, status)
           VALUES ($1, 'MONARK · Aprobación automática', 'password', 'active') RETURNING id`,
          [`auto-approver@${slug}.monark.internal`],
        )
      ).rows[0].id;
      await c.query(
        `INSERT INTO user_org_roles (user_id, organization_id, role_id, location_scope, status) VALUES ($1, $2, $3, 'all', 'active')`,
        [approverId, orgId, ownerRole],
      );
      await c.query(`UPDATE organizations SET settings = jsonb_build_object('system_approver_id', $2::text, 'approval_policy', 'auto-v1-single-user') WHERE id = $1`, [orgId, approverId]);
      await c.query(
        `INSERT INTO restaurants (organization_id, name, concept_type, status) VALUES ($1, $2, 'restaurant', 'active')`,
        [orgId, orgName.trim()],
      );
      for (const [name, code, group] of CATEGORY_SEED) {
        await c.query(
          `INSERT INTO expense_categories (organization_id, name, code, statement_group) VALUES ($1, $2, $3, $4)`,
          [orgId, name, code, group],
        );
      }
      await c.query(
        `INSERT INTO bank_accounts (organization_id, institution_name, account_name, account_mask, account_type, currency, status)
         VALUES ($1, 'Manual', 'Cuenta principal', '0000', 'checking', 'USD', 'active')`,
        [orgId],
      );
      await c.query('COMMIT');
      const token = await issueSession(userId, orgId);
      return { token, orgName: orgName.trim() };
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = (
      await pool.query(`SELECT id, password_hash FROM users WHERE email = $1 AND status = 'active'`, [email ?? ''])
    ).rows[0];
    // Uniform response: never reveal whether the email exists.
    if (!user || !verifyPassword(password ?? '', user.password_hash)) {
      return reply.code(401).send({ error: 'Correo o contraseña incorrectos.' });
    }
    const membership = (
      await pool.query(
        `SELECT organization_id FROM user_org_roles WHERE user_id = $1 AND status = 'active' LIMIT 1`,
        [user.id],
      )
    ).rows[0];
    if (!membership) return reply.code(401).send({ error: 'La cuenta no pertenece a ninguna organización.' });
    await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    const token = await issueSession(user.id, membership.organization_id);
    return { token };
  });

  /* ── State (everything the app renders) ────────────────────────────────── */

  /* ── Vinculación de dispositivos (código de un solo uso) ───────────────── */
  // Sin login propio, la sesión es por dispositivo. Un código efímero mueve
  // las credenciales de dispositivo a otro navegador para compartir la MISMA
  // organización. Un solo uso, 10 minutos, verificado contra el usuario dueño
  // de la sesión que lo genera.
  const linkCodes = new Map<string, { email: string; password: string; expiresAt: number }>();

  app.post('/auth/link-code', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { email?: string; password?: string };
    if (!b.email || !b.password) return reply.code(400).send({ error: 'Faltan las credenciales del dispositivo.' });
    const user = (
      await pool.query(`SELECT id, email, password_hash FROM users WHERE id = $1`, [ctx.userId])
    ).rows[0];
    if (!user || user.email !== b.email || !verifyPassword(b.password, user.password_hash)) {
      return reply.code(401).send({ error: 'Las credenciales no corresponden a esta sesión.' });
    }
    const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'X').toUpperCase().slice(0, 8);
    linkCodes.set(code, { email: b.email, password: b.password, expiresAt: Date.now() + 10 * 60_000 });
    setTimeout(() => linkCodes.delete(code), 10 * 60_000).unref();
    return { code, expiresInMinutes: 10 };
  });

  app.post('/auth/link-redeem', async (req, reply) => {
    const { code } = req.body as { code?: string };
    const entry = code ? linkCodes.get(code.trim().toUpperCase()) : undefined;
    if (!entry || entry.expiresAt < Date.now()) {
      return reply.code(404).send({ error: 'Código inválido o vencido — genera uno nuevo en el otro dispositivo.' });
    }
    linkCodes.delete(code!.trim().toUpperCase());
    return { email: entry.email, password: entry.password };
  });

  app.get('/state', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    return asUser(ctx, async (c) => {
      const org = (await c.query(`SELECT name FROM organizations WHERE id = $1`, [ctx.orgId])).rows[0];
      const locations = (
        await c.query(`SELECT id, name, code FROM locations WHERE status = 'active' ORDER BY created_at`)
      ).rows;
      const vendors = (await c.query(`SELECT id, name, payment_terms_days FROM vendors ORDER BY name`)).rows;
      const categories = (
        await c.query(`SELECT id, name, statement_group AS "group" FROM expense_categories WHERE is_active ORDER BY code`)
      ).rows;
      const invoices = (
        await c.query(
          `SELECT i.id, i.vendor_id AS "vendorId", i.location_id AS "locationId", i.invoice_number AS number,
                  i.invoice_date::text AS "invoiceDate", i.expense_date::text AS "expenseDate", i.due_date::text AS "dueDate",
                  i.subtotal::float8 AS subtotal, i.tax::float8 AS tax, i.status, i.created_at::text AS "createdAt",
                  i.source::text AS source, i.source_email AS "sourceEmail",
                  li.expense_category_id AS "categoryId", li.description,
                  p.payment_date::text AS "paymentDate", p.method AS "paymentMethod", p.external_ref AS "paymentRef"
             FROM invoices i
             LEFT JOIN LATERAL (SELECT * FROM invoice_line_items WHERE invoice_id = i.id ORDER BY line_no LIMIT 1) li ON true
             LEFT JOIN LATERAL (
               SELECT p.* FROM payment_matches pm JOIN payments p ON p.id = pm.payment_id
                WHERE pm.invoice_id = i.id AND p.status = 'settled' ORDER BY p.payment_date DESC LIMIT 1) p ON true
            ORDER BY i.created_at DESC`,
        )
      ).rows.map((r) => ({ ...r, status: toAppStatus(r.status) }));
      const posDays = (
        await c.query(
          `SELECT id, location_id AS "locationId", business_date::text AS date, source::text AS source,
                  gross_sales::float8 AS gross, discounts::float8 AS discounts,
                  comps::float8 AS comps, refunds::float8 AS refunds,
                  tax_collected::float8 AS tax, tips::float8 AS tips
             FROM pos_sales ORDER BY business_date DESC`,
        )
      ).rows;
      const payments = (
        await c.query(
          `SELECT p.id, pm.invoice_id AS "invoiceId", p.payment_date::text AS date, p.method,
                  p.amount::float8 AS amount, p.external_ref AS ref
             FROM payments p JOIN payment_matches pm ON pm.payment_id = p.id
            WHERE p.status = 'settled' ORDER BY p.payment_date DESC`,
        )
      ).rows;
      const bankAccounts = (
        await c.query(
          `SELECT id, institution_name AS institution, account_name AS name, account_mask AS mask,
                  account_type::text AS type, current_balance::float8 AS balance,
                  balance_as_of::text AS "balanceAsOf"
             FROM bank_accounts WHERE status = 'active' AND integration_id IS NOT NULL
            ORDER BY created_at`,
        )
      ).rows;
      const bankTxns = (
        await c.query(
          `SELECT bt.id, bt.bank_account_id AS "accountId", bt.posted_at::text AS date,
                  bt.amount::float8 AS amount, bt.description_raw AS description,
                  bt.counterparty, bt.is_pending AS pending,
                  (EXISTS (SELECT 1 FROM payment_matches pm WHERE pm.bank_transaction_id = bt.id)) AS matched
             FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
            WHERE ba.integration_id IS NOT NULL
            ORDER BY bt.posted_at DESC, bt.id DESC LIMIT 200`,
        )
      ).rows;
      const periods = (
        await c.query(
          `SELECT period_month::text AS month, status::text AS status
             FROM financial_periods ORDER BY period_month DESC LIMIT 24`,
        )
      ).rows;
      const insights = (
        await c.query(
          `SELECT id, kind::text AS kind, title, body, severity::text AS severity,
                  confidence::float8 AS confidence, status::text AS status,
                  subject_type AS "subjectType", subject_id AS "subjectId",
                  created_at::text AS "createdAt"
             FROM ai_insights WHERE status IN ('new', 'acknowledged')
            ORDER BY created_at DESC LIMIT 60`,
        )
      ).rows;
      const bankIntegrations = (
        await c.query(
          `SELECT id, provider::text AS provider, status::text AS status, last_sync_at::text AS "lastSyncAt"
             FROM integrations WHERE provider::text IN ('plaid', 'belvo') ORDER BY created_at`,
        )
      ).rows;
      return {
        orgName: org?.name ?? '', locations, vendors, categories, invoices, posDays, payments,
        bankAccounts, bankTxns, bankIntegrations, insights, periods,
      };
    }).then(async (state) => {
      // Reconciliation data (service context with explicit org filters — the
      // detector view has no app-role grants).
      const deposits = (
        await pool.query(
          `SELECT d.id, d.location_id AS "locationId", d.deposit_type::text AS type,
                  d.covers_from::text AS "coversFrom", d.expected_amount::float8 AS "expectedAmount",
                  d.expected_on::text AS "expectedOn", d.actual_amount::float8 AS "actualAmount",
                  d.variance_amount::float8 AS variance, d.status::text AS status,
                  d.bank_transaction_id AS "bankTransactionId"
             FROM pos_deposits d WHERE d.organization_id = $1
            ORDER BY d.expected_on DESC, d.deposit_type LIMIT 120`,
          [ctx.orgId],
        )
      ).rows;
      // Deposit suggestions. The processor funds batches at 100% gross, but a
      // batch can cover SEVERAL business days (closeouts skip days) — so we
      // match each unmatched bank credit against consecutive runs of expected
      // deposits of the same type whose sum is exact to the cent.
      const credits = (
        await pool.query(
          `SELECT bt.id, bt.posted_at::text AS "postedAt", bt.amount::float8 AS amount,
                  bt.description_raw AS description
             FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
            WHERE ba.organization_id = $1 AND bt.match_status = 'unmatched' AND bt.amount > 0
            ORDER BY bt.posted_at LIMIT 200`,
          [ctx.orgId],
        )
      ).rows as Array<{ id: string; postedAt: string; amount: number }>;
      const cents = (n: number) => Math.round(n * 100);
      // Processor batches land as SEVERAL same-day credits (one per device
      // batch), and one settlement day can cover several nights — so we match
      // both single credits and same-day clusters of processor-looking
      // credits against consecutive runs of expected days.
      const isProcessor = (desc: string) => /bankcard|mtot|merch|clover|card\s*proc|pmt\s*sys/i.test(desc);
      const creditsFull = credits as Array<{ id: string; postedAt: string; amount: number; description?: string }>;
      const clusters: Array<{ ids: string[]; postedAt: string; amount: number }> = [];
      for (const cr of creditsFull) clusters.push({ ids: [cr.id], postedAt: cr.postedAt, amount: cr.amount });
      const byDay = new Map<string, Array<{ id: string; amount: number }>>();
      for (const cr of creditsFull) {
        if (!isProcessor(cr.description ?? '')) continue;
        const list = byDay.get(cr.postedAt) ?? [];
        list.push({ id: cr.id, amount: cr.amount });
        byDay.set(cr.postedAt, list);
      }
      for (const [day, list] of byDay) {
        if (list.length > 1) {
          clusters.push({ ids: list.map((x) => x.id), postedAt: day, amount: list.reduce((a, x) => a + x.amount, 0) });
        }
      }
      clusters.sort((a, b) => b.ids.length - a.ids.length); // prefer full-day clusters
      const usedDeposit = new Set<string>();
      const usedCredit = new Set<string>();
      const depositSuggestions: Array<{
        bankTransactionIds: string[]; postedAt: string; amount: number;
        depositIds: string[]; type: string; coversFrom: string; coversTo: string;
      }> = [];
      for (const type of ['card_batch', 'cash_deposit']) {
        const exp = deposits
          .filter((d) => d.status === 'expected' && d.type === type)
          .sort((a, b) => String(a.coversFrom).localeCompare(String(b.coversFrom)));
        for (const cl of clusters) {
          if (cl.ids.some((id) => usedCredit.has(id))) continue;
          const target = cents(cl.amount);
          outer:
          for (let i = 0; i < exp.length; i++) {
            if (usedDeposit.has(exp[i]!.id)) continue;
            let sum = 0;
            for (let j = i; j < Math.min(i + 10, exp.length); j++) {
              const d = exp[j]!;
              if (usedDeposit.has(d.id)) break;
              sum += cents(d.expectedAmount);
              if (sum === target) {
                const run = exp.slice(i, j + 1);
                const lastDay = String(run[run.length - 1]!.coversFrom);
                const dayDiff = (Date.parse(cl.postedAt) - Date.parse(lastDay)) / 86_400_000;
                if (dayDiff < 0 || dayDiff > 8) break; // settlement lands shortly after the last covered night
                run.forEach((r) => usedDeposit.add(r.id));
                cl.ids.forEach((id) => usedCredit.add(id));
                depositSuggestions.push({
                  bankTransactionIds: cl.ids, postedAt: cl.postedAt, amount: cl.amount,
                  depositIds: run.map((r) => r.id as string), type,
                  coversFrom: String(run[0]!.coversFrom), coversTo: lastDay,
                });
                break outer;
              }
              if (sum > target) break;
            }
          }
        }
      }
      const matchCandidates = (
        await pool.query(
          `SELECT c.payment_id AS "paymentId", c.bank_transaction_id AS "bankTransactionId",
                  c.debit_amount::float8 AS amount, c.payment_date::text AS "paymentDate",
                  c.posted_at::text AS "postedAt", c.date_distance_days AS "dateDistance",
                  c.candidate_count AS "candidateCount", bt.description_raw AS description,
                  v.name AS "vendorName", i.invoice_number AS "invoiceNumber"
             FROM v_payment_match_candidates c
             JOIN bank_transactions bt ON bt.id = c.bank_transaction_id
             LEFT JOIN payment_matches pm ON pm.payment_id = c.payment_id AND pm.bank_transaction_id IS NULL
             LEFT JOIN invoices i ON i.id = pm.invoice_id
             LEFT JOIN vendors v ON v.id = i.vendor_id
            WHERE c.organization_id = $1
            ORDER BY c.posted_at DESC LIMIT 60`,
          [ctx.orgId],
        )
      ).rows;
      return {
        ...state,
        deposits: deposits.map((d) => ({ ...d, suggestion: null })),
        depositSuggestions,
        matchCandidates,
      };
    });
  });

  /* ── Ingesta por correo (Resend inbound webhook) ───────────────────────── */
  // Secret-gated public route. Each attachment is read by the AI and lands as
  // a pending_approval invoice tagged 'email_capture' with the sender saved —
  // the human still approves; on approval the sender gets notified.

  app.post('/email/inbound', async (req, reply) => {
    const secret = (req.query as { secret?: string }).secret;
    if (!process.env.EMAIL_INBOUND_SECRET || secret !== process.env.EMAIL_INBOUND_SECRET) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const evt = req.body as {
      type?: string;
      data?: {
        from?: string | { email?: string; name?: string };
        subject?: string;
        attachments?: Array<{ content?: string; filename?: string; content_type?: string }>;
      };
    };
    const data = evt.data ?? (evt as never);
    const fromRaw = (data as { from?: string | { email?: string } }).from;
    const fromEmail = typeof fromRaw === 'string'
      ? (fromRaw.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? null)
      : fromRaw?.email ?? null;
    const attachments = (data as { attachments?: Array<{ content?: string; filename?: string; content_type?: string }> }).attachments ?? [];

    // Which organization receives emailed invoices (v1: single configured org,
    // resolved by its POS merchant so no raw ids live in env config).
    const orgRow = (
      await pool.query(
        `SELECT organization_id AS id FROM integrations
          WHERE provider = 'clover' AND external_ref = $1 ORDER BY created_at LIMIT 1`,
        [process.env.INBOUND_ORG_MERCHANT ?? ''],
      )
    ).rows[0];
    if (!orgRow) return { ok: true, created: 0, note: 'no org configured' };
    const orgId = orgRow.id as string;
    const owner = (
      await pool.query(
        `SELECT uor.user_id AS id FROM user_org_roles uor
          JOIN organizations o ON o.id = uor.organization_id
         WHERE uor.organization_id = $1
           AND uor.user_id::text IS DISTINCT FROM (o.settings ->> 'system_approver_id')
         ORDER BY uor.created_at LIMIT 1`,
        [orgId],
      )
    ).rows[0];
    if (!owner) return { ok: true, created: 0, note: 'no owner' };
    const ctx = { orgId, userId: owner.id as string };

    const categories = await asUser(ctx, async (c) =>
      (await c.query(`SELECT id, name FROM expense_categories WHERE is_active`)).rows as Array<{ id: string; name: string }>);
    const location = await asUser(ctx, async (c) =>
      (await c.query(`SELECT id FROM locations ORDER BY created_at LIMIT 1`)).rows[0]);
    if (!location) return { ok: true, created: 0, note: 'no location' };

    let created = 0;
    const skipped: string[] = [];
    for (const att of attachments.slice(0, 5)) {
      const mime = att.content_type ?? '';
      if (!att.content || !(mime === 'application/pdf' || mime.startsWith('image/'))) continue;
      if (att.content.length > 12 * 1024 * 1024) { skipped.push(`${att.filename}: muy grande`); continue; }
      try {
        const p = await extractInvoice(att.content, mime, categories.map((c) => c.name));
        if (!p.legible || p.subtotal == null || p.subtotal <= 0 || !p.vendor_name) {
          skipped.push(`${att.filename}: ilegible o incompleta`);
          continue;
        }
        const subtotal = p.subtotal;
        const number = p.invoice_number ?? `EMAIL-${new Date().toISOString().slice(0, 10)}-${randomBytes(2).toString('hex').toUpperCase()}`;
        const cat = categories.find((c) => c.name === p.category_name) ?? categories.find((c) => c.name === 'Other') ?? categories[0];
        await asUser(ctx, async (c) => {
          let vendorId = (
            await c.query(`SELECT id FROM vendors WHERE lower(name) = lower($1) LIMIT 1`, [p.vendor_name])
          ).rows[0]?.id as string | undefined;
          if (!vendorId) {
            vendorId = (
              await c.query(
                `INSERT INTO vendors (organization_id, name, normalized_name, payment_terms_days, status)
                 VALUES ($1, $2, '', 30, 'active') RETURNING id`,
                [ctx.orgId, p.vendor_name],
              )
            ).rows[0].id;
          }
          const invoiceDate = p.invoice_date ?? new Date().toISOString().slice(0, 10);
          const inv = await c.query(
            `INSERT INTO invoices (organization_id, location_id, vendor_id, invoice_number, invoice_date,
                                   expense_date, due_date, currency, subtotal, tax, total, status, source,
                                   source_email, created_by)
             VALUES ($1, $2, $3, $4, $5, $5, $6, 'USD', $7, $8, $9, 'draft', 'email_capture', $10, $11)
             RETURNING id`,
            [ctx.orgId, location.id, vendorId, number, invoiceDate, p.due_date ?? invoiceDate,
             subtotal, p.tax ?? 0, subtotal + (p.tax ?? 0), fromEmail, ctx.userId],
          );
          await c.query(
            `INSERT INTO invoice_line_items (invoice_id, line_no, description, amount, expense_category_id)
             VALUES ($1, 1, $2, $3, $4)`,
            [inv.rows[0].id,
             `${p.description ?? 'Factura recibida por correo'} · IA confianza ${Math.round(p.confidence * 100)}%${p.notes ? ` · ${p.notes}` : ''}`,
             subtotal, cat?.id],
          );
          await c.query(`UPDATE invoices SET status = 'pending_approval' WHERE id = $1`, [inv.rows[0].id]);
        });
        created++;
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        skipped.push(`${att.filename}: ${msg.includes('duplicate key') ? 'ya existía' : 'error de lectura'}`);
        console.error(`email inbound ${att.filename}:`, msg);
      }
    }
    const subject = (data as { subject?: string }).subject ?? '';
    console.log(`email inbound de ${fromEmail ?? '?'} · asunto: "${subject.slice(0, 120)}" · ${created} creadas${skipped.length ? `, saltadas: ${skipped.join('; ')}` : ''}`);
    return { ok: true, created, skipped };
  });

  /* ── IA: leer factura desde foto/PDF (solo propone) ────────────────────── */

  app.post('/invoices/extract', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { fileBase64?: string; mimeType?: string };
    if (!b.fileBase64 || !b.mimeType) return reply.code(400).send({ error: 'Falta el archivo de la factura.' });
    if (b.fileBase64.length > 12 * 1024 * 1024) {
      return reply.code(400).send({ error: 'El archivo es muy grande — intenta con una foto más liviana (máx ~8MB).' });
    }
    const categories = await asUser(ctx, async (c) =>
      (await c.query(`SELECT name FROM expense_categories WHERE is_active ORDER BY name`)).rows.map((r) => r.name as string));
    try {
      const proposal = await extractInvoice(b.fileBase64, b.mimeType, categories);
      return { proposal };
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes('vault')) return reply.code(400).send({ error: 'La IA aún no está configurada en el servidor.' });
      return reply.code(502).send({ error: `No se pudo leer la factura: ${msg}` });
    }
  });

  /* ── Cierre de mes (candado contable) ──────────────────────────────────── */

  app.post('/periods/close', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { month } = req.body as { month?: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: 'Mes inválido.' });
    const first = `${month}-01`;
    if (first >= new Date().toISOString().slice(0, 7) + '-01') {
      return reply.code(400).send({ error: 'Solo se pueden cerrar meses ya terminados.' });
    }
    return asUser(ctx, async (c) => {
      await c.query(
        `INSERT INTO financial_periods (organization_id, period_month, starts_on, ends_on, status, locked_by, locked_at)
         VALUES ($1, $2::date, $2::date, ($2::date + interval '1 month' - interval '1 day')::date, 'locked', $3, now())
         ON CONFLICT (organization_id, period_month)
         DO UPDATE SET status = 'locked', locked_by = $3, locked_at = now()`,
        [ctx.orgId, first, ctx.userId],
      );
      return { ok: true };
    });
  });

  app.post('/periods/reopen', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { month } = req.body as { month?: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: 'Mes inválido.' });
    // The schema demands an approved period_lock approval to unlock — v1
    // single-user policy: the org's system approver signs it (same pattern as
    // payment approvals), recorded in the audit trail.
    const period = (
      await pool.query(
        `SELECT id FROM financial_periods WHERE organization_id = $1 AND period_month = $2::date AND status = 'locked'`,
        [ctx.orgId, `${month}-01`],
      )
    ).rows[0];
    if (!period) return reply.code(404).send({ error: 'Ese mes no está cerrado.' });
    const org = (
      await pool.query(`SELECT settings FROM organizations WHERE id = $1`, [ctx.orgId])
    ).rows[0];
    const approverId = org?.settings?.system_approver_id;
    if (!approverId) return reply.code(409).send({ error: 'La organización no tiene política de aprobación configurada.' });
    // Approvals are immutable state machines: created pending, decided after.
    const appr = await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, decision, policy_snapshot)
       VALUES ($1, 'period_lock', $2, 1, $3, 'pending', $4::jsonb)
       ON CONFLICT (subject_type, subject_id, step, approver_id) DO NOTHING
       RETURNING id`,
      [ctx.orgId, period.id, approverId, JSON.stringify({ policy: 'auto-v1-single-user', requested_by: ctx.userId })],
    );
    const apprId = appr.rows[0]?.id ?? (
      await pool.query(
        `SELECT id FROM approvals WHERE subject_type = 'period_lock' AND subject_id = $1 AND approver_id = $2`,
        [period.id, approverId],
      )
    ).rows[0]?.id;
    await pool.query(
      `UPDATE approvals SET decision = 'approved', decided_at = now(), note = 'Reapertura solicitada por el propietario'
        WHERE id = $1 AND decision = 'pending'`,
      [apprId],
    );
    return asUser(ctx, async (c) => {
      await c.query(
        `UPDATE financial_periods SET status = 'open', locked_by = NULL, locked_at = NULL WHERE id = $1`,
        [period.id],
      );
      return { ok: true };
    });
  });

  /* ── IA: asistente financiero (solo lee, nunca actúa) ──────────────────── */

  app.post('/ai/ask', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { question?: string; history?: Array<{ q: string; a: string }> };
    if (!b.question?.trim()) return reply.code(400).send({ error: 'Escribe una pregunta.' });
    try {
      const answer = await askFinancialAssistant(pool, ctx.orgId, b.question.trim().slice(0, 2000), b.history ?? []);
      return { answer };
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes('vault')) return reply.code(400).send({ error: 'La IA aún no está configurada en el servidor.' });
      return reply.code(502).send({ error: 'La IA no pudo responder — intenta de nuevo.' });
    }
  });

  app.post('/insights/:id/status', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };
    if (!status || !['acknowledged', 'actioned', 'dismissed'].includes(status)) {
      return reply.code(400).send({ error: 'Estado inválido.' });
    }
    return asUser(ctx, async (c) => {
      await c.query(`UPDATE ai_insights SET status = $2, resolved_by = $3 WHERE id = $1`,
        [id, status, status === 'acknowledged' ? null : ctx.userId]);
      return { ok: true };
    });
  });

  /* ── Conciliación ──────────────────────────────────────────────────────── */

  app.post('/reconcile/deposit', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { depositId?: string; bankTransactionId?: string };
    if (!b.depositId || !b.bankTransactionId) return reply.code(400).send({ error: 'Faltan datos del cruce.' });
    try {
      const upd = await pool.query(
        `UPDATE pos_deposits SET bank_transaction_id = $2
          WHERE id = $1 AND organization_id = $3
          RETURNING status::text AS status, variance_amount::float8 AS variance`,
        [b.depositId, b.bankTransactionId, ctx.orgId],
      );
      if (!upd.rowCount) return reply.code(404).send({ error: 'Depósito no encontrado.' });
      return { ok: true, status: upd.rows[0].status, variance: upd.rows[0].variance };
    } catch (err) {
      return reply.code(409).send({ error: `El cruce fue rechazado: ${String((err as Error).message)}` });
    }
  });

  app.post('/reconcile/deposit-group', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { depositIds?: string[]; bankTransactionIds?: string[]; bankTransactionId?: string };
    const txnIds = b.bankTransactionIds ?? (b.bankTransactionId ? [b.bankTransactionId] : []);
    if (!b.depositIds?.length || !txnIds.length) return reply.code(400).send({ error: 'Faltan datos del cruce.' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const rows = (
        await c.query(
          `SELECT id, deposit_type, location_id, covers_from, covers_to, expected_amount::float8 AS amt
             FROM pos_deposits
            WHERE id = ANY($1) AND organization_id = $2 AND status = 'expected' FOR UPDATE`,
          [b.depositIds, ctx.orgId],
        )
      ).rows;
      if (rows.length !== b.depositIds.length) throw new Error('Alguno de los depósitos ya no está disponible.');
      if (new Set(rows.map((r) => r.deposit_type)).size > 1 || new Set(rows.map((r) => r.location_id)).size > 1) {
        throw new Error('El grupo debe ser del mismo tipo y local.');
      }
      const credits = (
        await c.query(
          `SELECT bt.id, bt.posted_at, bt.amount::float8 AS amount
             FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
            WHERE bt.id = ANY($1) AND ba.organization_id = $2 AND bt.match_status = 'unmatched' AND bt.amount > 0`,
          [txnIds, ctx.orgId],
        )
      ).rows;
      if (credits.length !== txnIds.length) throw new Error('Alguno de los abonos ya no está disponible.');
      const cents = (n: number) => Math.round(n * 100);
      const expectedTotal = rows.reduce((a, r) => a + cents(Number(r.amt)), 0);
      const creditTotal = credits.reduce((a, r) => a + cents(Number(r.amount)), 0);
      if (expectedTotal !== creditTotal) throw new Error('Las sumas no coinciden al centavo.');
      rows.sort((a, b2) => String(a.covers_from).localeCompare(String(b2.covers_from)));
      const keep = rows[0]!;
      const coversFrom = keep.covers_from;
      const coversTo = rows[rows.length - 1]!.covers_to;
      // One deposit row per bank credit (the schema links one credit to one
      // window): the day-level expectations are replaced by credit-level rows
      // covering the same range, each expecting exactly its credit's amount.
      await c.query(`DELETE FROM pos_deposits WHERE id = ANY($1)`, [rows.map((r) => r.id)]);
      let finalStatus = 'matched';
      for (const cr of credits) {
        const ins = await c.query(
          `INSERT INTO pos_deposits (organization_id, location_id, deposit_type, covers_from, covers_to,
                                     expected_amount, expected_on, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'expected') RETURNING id`,
          [ctx.orgId, keep.location_id, keep.deposit_type, coversFrom, coversTo, cr.amount, cr.posted_at],
        );
        const upd = await c.query(
          `UPDATE pos_deposits SET bank_transaction_id = $2 WHERE id = $1 RETURNING status::text AS status`,
          [ins.rows[0].id, cr.id],
        );
        if (upd.rows[0].status !== 'matched') finalStatus = upd.rows[0].status;
      }
      await c.query('COMMIT');
      return { ok: true, status: finalStatus };
    } catch (err) {
      await c.query('ROLLBACK');
      return reply.code(409).send({ error: `El cruce fue rechazado: ${String((err as Error).message)}` });
    } finally {
      c.release();
    }
  });

  app.post('/reconcile/payment', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as { paymentId?: string; bankTransactionId?: string };
    if (!b.paymentId || !b.bankTransactionId) return reply.code(400).send({ error: 'Faltan datos del cruce.' });
    const owned = (
      await pool.query(`SELECT posted_at FROM v_payment_match_candidates
                         WHERE organization_id = $1 AND payment_id = $2 AND bank_transaction_id = $3`,
        [ctx.orgId, b.paymentId, b.bankTransactionId])
    ).rows[0];
    if (!owned) return reply.code(404).send({ error: 'Ese cruce ya no está disponible.' });
    const link = await pool.query(
      `UPDATE payment_matches SET bank_transaction_id = $1
        WHERE id = (SELECT id FROM payment_matches WHERE payment_id = $2 AND bank_transaction_id IS NULL LIMIT 1)
        RETURNING id`,
      [b.bankTransactionId, b.paymentId],
    );
    if (!link.rowCount) return reply.code(409).send({ error: 'El pago ya estaba conciliado.' });
    try {
      await pool.query(
        `UPDATE payments SET payment_date = $2, status = 'settled'
          WHERE id = $1 AND status IN ('scheduled', 'processing')`,
        [b.paymentId, owned.posted_at],
      );
    } catch {
      // gates said no — the evidence link still stands
    }
    return { ok: true };
  });

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  app.post('/locations', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { name, code } = req.body as { name: string; code: string };
    return asUser(ctx, async (c) => {
      const restaurant = (await c.query(`SELECT id FROM restaurants ORDER BY created_at LIMIT 1`)).rows[0];
      const row = await c.query(
        `INSERT INTO locations (organization_id, restaurant_id, name, code, timezone, status)
         VALUES ($1, $2, $3, $4, 'America/New_York', 'active') RETURNING id`,
        [ctx.orgId, restaurant.id, name.trim(), code.trim().toUpperCase()],
      );
      return { id: row.rows[0].id };
    });
  });

  app.post('/invoices', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as {
      vendorId?: string; vendorName?: string; locationId: string; number: string;
      invoiceDate: string; expenseDate: string; dueDate?: string;
      categoryId: string; description?: string; subtotal: number; tax: number;
    };
    try {
      return await asUser(ctx, async (c) => {
        let vendorId = b.vendorId;
        if (!vendorId) {
          vendorId = (
            await c.query(
              `INSERT INTO vendors (organization_id, name, normalized_name, payment_terms_days, status)
               VALUES ($1, $2, '', 30, 'active') RETURNING id`,
              [ctx.orgId, (b.vendorName ?? '').trim()],
            )
          ).rows[0].id;
        }
        const inv = await c.query(
          `INSERT INTO invoices (organization_id, location_id, vendor_id, invoice_number, invoice_date,
                                 expense_date, due_date, currency, subtotal, tax, total, status, source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, 'draft', 'manual', $11) RETURNING id`,
          [ctx.orgId, b.locationId, vendorId, b.number.trim(), b.invoiceDate, b.expenseDate,
           b.dueDate || b.invoiceDate, b.subtotal, b.tax, b.subtotal + b.tax, ctx.userId],
        );
        await c.query(
          `INSERT INTO invoice_line_items (invoice_id, line_no, description, amount, expense_category_id)
           VALUES ($1, 1, $2, $3, $4)`,
          [inv.rows[0].id, b.description?.trim() || 'Factura', b.subtotal, b.categoryId],
        );
        await c.query(`UPDATE invoices SET status = 'pending_approval' WHERE id = $1`, [inv.rows[0].id]);
        return { id: inv.rows[0].id };
      });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes('duplicate key') && msg.includes('invoice_number')) {
        return reply.code(409).send({ error: 'Ese número de factura ya existe para este proveedor — una factura nunca entra dos veces.' });
      }
      throw err;
    }
  });

  app.post('/invoices/:id/decision', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    const { action } = req.body as { action: 'approve' | 'reject' | 'hold' | 'reactivate' };
    const target = { approve: 'approved', reject: 'void', hold: 'draft', reactivate: 'pending_approval' }[action];
    if (!target) return reply.code(400).send({ error: 'Acción inválida.' });
    const out = await asUser(ctx, async (c) => {
      await c.query(`UPDATE invoices SET status = $2 WHERE id = $1`, [id, target]);
      return { ok: true };
    });
    // Emailed-in invoice approved → tell the sender (best-effort, never blocks).
    if (action === 'approve') {
      const inv = (
        await pool.query(
          `SELECT i.invoice_number AS number, i.total::float8 AS total, i.source_email AS email,
                  v.name AS vendor, o.name AS org
             FROM invoices i JOIN vendors v ON v.id = i.vendor_id
             JOIN organizations o ON o.id = i.organization_id
            WHERE i.id = $1 AND i.organization_id = $2 AND i.source_email IS NOT NULL`,
          [id, ctx.orgId],
        )
      ).rows[0];
      if (inv) {
        void sendEmail(
          inv.email,
          `Factura ${inv.number} aprobada — ${inv.org}`,
          `<p>Estimado proveedor (${inv.vendor}):</p>
           <p>Su factura <strong>${inv.number}</strong> por <strong>$${Number(inv.total).toFixed(2)}</strong> fue <strong>aprobada</strong> por ${inv.org} y entró a proceso de pago.</p>
           <p>Este es un mensaje automático del sistema financiero MONARK — no es necesario responder.</p>`,
        );
      }
    }
    return out;
  });

  app.post('/invoices/:id/pay', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    const { date, method, ref } = req.body as { date: string; method: string; ref?: string };

    // Orchestrates across the privilege boundary in service context; every
    // step still passes the database's own gates (approval chain, allocation
    // totals, period locks, SoD — the system approver ≠ the creator).
    const inv = (
      await pool.query(`SELECT * FROM invoices WHERE id = $1 AND organization_id = $2`, [id, ctx.orgId])
    ).rows[0];
    if (!inv) return reply.code(404).send({ error: 'Factura no encontrada.' });
    const org = (await pool.query(`SELECT settings FROM organizations WHERE id = $1`, [ctx.orgId])).rows[0];
    const approverId = org.settings?.system_approver_id;
    const account = (
      await pool.query(`SELECT id FROM bank_accounts WHERE organization_id = $1 ORDER BY created_at LIMIT 1`, [ctx.orgId])
    ).rows[0];
    const amount = Number(inv.subtotal) + Number(inv.tax);

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const pay = await c.query(
        `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency, payment_date,
                               initiated_at, status, idempotency_key, external_ref, created_by)
         VALUES ($1, $2, $3, $4, 'USD', $5, now(), 'scheduled', $6, $7, $8) RETURNING id`,
        [ctx.orgId, account.id, method, amount, date, randomBytes(16).toString('hex'), ref ?? null, ctx.userId],
      );
      await c.query(
        `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
         VALUES ($1, 'payment', $2, 1, $3, '{"policy":"auto-v1-single-user"}'::jsonb)`,
        [ctx.orgId, pay.rows[0].id, approverId],
      );
      await c.query(
        `UPDATE approvals SET decision = 'approved' WHERE subject_type = 'payment' AND subject_id = $1`,
        [pay.rows[0].id],
      );
      await c.query(
        `INSERT INTO payment_matches (payment_id, invoice_id, amount_applied, matched_by, matched_at)
         VALUES ($1, $2, $3, 'user', now())`,
        [pay.rows[0].id, id, amount],
      );
      await c.query(`UPDATE payments SET status = 'settled' WHERE id = $1`, [pay.rows[0].id]);
      await c.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await c.query('ROLLBACK');
      const msg = String((err as Error).message ?? err);
      if (msg.includes('locked')) return reply.code(409).send({ error: 'Ese mes está cerrado — el pago debe ir en un período abierto.' });
      throw err;
    } finally {
      c.release();
    }
  });

  app.post('/pos-days', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as {
      locationId: string; date: string; gross: number; discounts: number; tax: number; tips: number;
    };
    try {
      return await asUser(ctx, async (c) => {
        const tender = { cash: 0, card: 0, gift_card: 0, other: b.gross + b.tax + b.tips };
        await c.query(
          `INSERT INTO pos_sales (organization_id, location_id, business_date, source, gross_sales, discounts,
                                  comps, net_sales, tax_collected, tips, tender_breakdown)
           VALUES ($1, $2, $3, 'manual', $4, $5, 0, $6, $7, $8, $9)`,
          [ctx.orgId, b.locationId, b.date, b.gross, b.discounts, b.gross - b.discounts, b.tax, b.tips, JSON.stringify(tender)],
        );
        return { ok: true };
      });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes('duplicate key')) {
        return reply.code(409).send({ error: 'Ese día ya está registrado para este local — un día de ventas nunca entra dos veces.' });
      }
      throw err;
    }
  });

  /* ── Integraciones POS (ajustes) ───────────────────────────────────────── */

  const POS_SET = new Set(['clover', 'toast', 'square', 'lightspeed']);

  app.get('/integrations', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    return asUser(ctx, async (c) => ({
      integrations: (
        await c.query(
          `SELECT id, provider::text AS provider, external_ref AS "merchantId",
                  location_id AS "locationId", status::text AS status,
                  last_sync_at::text AS "lastSyncAt"
             FROM integrations WHERE provider::text = ANY($1) ORDER BY created_at`,
          [[...POS_SET]],
        )
      ).rows,
    }));
  });

  app.post('/integrations', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const b = req.body as {
      provider: string; merchantId: string; apiToken: string; locationId: string;
      timezone?: string; dayCutoffHour?: number;
    };
    if (!POS_SET.has(b.provider) || !b.merchantId?.trim() || !b.apiToken?.trim() || !b.locationId) {
      return reply.code(400).send({ error: 'Faltan datos: proveedor, Merchant ID, token y local son obligatorios.' });
    }
    // The location must be the caller's (RLS-checked read).
    const loc = await asUser(ctx, async (c) =>
      (await c.query(`SELECT id FROM locations WHERE id = $1`, [b.locationId])).rows[0]);
    if (!loc) return reply.code(400).send({ error: 'Ese local no existe en tu organización.' });

    const creds: Record<string, string> = {
      api_token: b.apiToken.trim(),
      timezone: b.timezone?.trim() || 'America/New_York',
    };
    // Business-day cutoff (5am default = Clover's 5-to-5 reporting day).
    if (Number.isInteger(b.dayCutoffHour) && b.dayCutoffHour! >= 0 && b.dayCutoffHour! <= 12) {
      creds.day_cutoff_hour = String(b.dayCutoffHour);
    }
    const check = await verifyPos(b.provider, b.merchantId.trim(), creds);
    if (!check.ok) return reply.code(400).send({ error: check.error ?? 'El proveedor rechazó las credenciales.' });

    // Service context: encrypted secret + integration row (validated above).
    const ref = `db:${ctx.orgId}:${b.provider}:${b.merchantId.trim()}`;
    await saveSecret(pool, ref, ctx.orgId, creds);
    const row = (
      await pool.query(
        `INSERT INTO integrations (organization_id, provider, external_ref, location_id,
                                   credentials_ref, scopes, status)
         VALUES ($1, $2::integration_provider, $3, $4, $5, $6::jsonb, 'connected')
         ON CONFLICT (organization_id, provider, external_ref)
         DO UPDATE SET credentials_ref = EXCLUDED.credentials_ref, location_id = EXCLUDED.location_id,
                       status = 'connected'
         RETURNING id`,
        [ctx.orgId, b.provider, b.merchantId.trim(), b.locationId, ref, JSON.stringify(['payments.read'])],
      )
    ).rows[0];
    opts.syncAfterConnect?.(row.id);
    return { ok: true, id: row.id, merchantName: check.name ?? null };
  });

  /* ── Banco (Plaid Link) ────────────────────────────────────────────────── */

  app.post('/bank/link-token', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const plat = plaidPlatform();
    if (!plat) return reply.code(400).send({ error: 'La conexión bancaria aún no está configurada en el servidor.' });
    let res: Response;
    try {
      res = await fetch(`${plaidBase(plat.env)}/link/token/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: plat.client_id,
          secret: plat.secret,
          user: { client_user_id: ctx.userId },
          client_name: 'MONARK',
          products: ['transactions'],
          country_codes: ['US'],
          language: 'es',
        }),
      });
    } catch {
      return reply.code(502).send({ error: 'No se pudo contactar a Plaid — intenta de nuevo.' });
    }
    const json = (await res.json()) as { link_token?: string; error_message?: string };
    if (!res.ok || !json.link_token) {
      return reply.code(502).send({ error: `Plaid: ${json.error_message ?? `error ${res.status}`}` });
    }
    return { linkToken: json.link_token };
  });

  app.post('/bank/exchange', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { publicToken } = req.body as { publicToken?: string };
    if (!publicToken) return reply.code(400).send({ error: 'Falta el token de conexión del banco.' });
    const plat = plaidPlatform();
    if (!plat) return reply.code(400).send({ error: 'La conexión bancaria aún no está configurada en el servidor.' });
    let res: Response;
    try {
      res = await fetch(`${plaidBase(plat.env)}/item/public_token/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: plat.client_id, secret: plat.secret, public_token: publicToken }),
      });
    } catch {
      return reply.code(502).send({ error: 'No se pudo contactar a Plaid — intenta de nuevo.' });
    }
    const json = (await res.json()) as { access_token?: string; item_id?: string; error_message?: string };
    if (!res.ok || !json.access_token || !json.item_id) {
      return reply.code(502).send({ error: `Plaid: ${json.error_message ?? `error ${res.status}`}` });
    }
    // The bank access token is per-connection and lives encrypted, like POS tokens.
    const ref = `db:${ctx.orgId}:plaid:${json.item_id}`;
    await saveSecret(pool, ref, ctx.orgId, {
      client_id: plat.client_id!,
      secret: plat.secret!,
      access_token: json.access_token,
      env: plat.env ?? 'sandbox',
    });
    const row = (
      await pool.query(
        `INSERT INTO integrations (organization_id, provider, external_ref, credentials_ref, scopes, status)
         VALUES ($1, 'plaid', $2, $3, $4::jsonb, 'connected')
         ON CONFLICT (organization_id, provider, external_ref)
         DO UPDATE SET credentials_ref = EXCLUDED.credentials_ref, status = 'connected'
         RETURNING id`,
        [ctx.orgId, json.item_id, ref, JSON.stringify(['transactions.read'])],
      )
    ).rows[0];
    opts.syncBankAfterConnect?.(row.id);
    return { ok: true };
  });

  app.post('/integrations/:id/disconnect', async (req, reply) => {
    const ctx = await authenticate(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    // RLS-checked ownership before the service-context secret delete.
    const row = await asUser(ctx, async (c) =>
      (await c.query(`SELECT id, credentials_ref FROM integrations WHERE id = $1`, [id])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'Integración no encontrada.' });
    await pool.query(`UPDATE integrations SET status = 'disconnected' WHERE id = $1`, [id]);
    if ((row.credentials_ref as string).startsWith('db:')) {
      await pool.query(`DELETE FROM integration_secrets WHERE ref = $1 AND organization_id = $2`, [row.credentials_ref, ctx.orgId]);
    }
    return { ok: true };
  });

  return app;
}
