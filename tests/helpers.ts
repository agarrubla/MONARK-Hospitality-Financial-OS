import pg from 'pg';
import { expect } from 'vitest';
import { TEST_DATABASE_URL } from './global-setup.js';

export const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });

let seq = 0;
export function uniq(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${seq++}`;
}

export interface OrgFixture {
  org: string;
  restaurant: string;
  loc1: string;
  loc2: string;
  users: { owner: string; cfo: string; controller: string; gm: string; clerk: string; viewer: string };
  memberships: Record<string, string>; // user key -> user_org_roles.id
  roleIds: Record<string, string>; // role key -> roles.id
  vendor: string;
  catFood: string;
  catFees: string;
  account: string;
}

/**
 * A full tenant fixture. gm is scoped to loc1 only ("listed"); everyone else
 * has all-location scope. Created as the superuser (system actor) — the
 * triggers treat a missing app.user_id as a service context.
 */
export async function createOrg(): Promise<OrgFixture> {
  const c = await pool.connect();
  try {
    const org = (
      await c.query(
        `INSERT INTO organizations (name, slug, base_currency) VALUES ($1, $2, 'USD') RETURNING id`,
        ['Vela Hospitality Group', uniq('vela')],
      )
    ).rows[0].id;
    const restaurant = (
      await c.query(
        `INSERT INTO restaurants (organization_id, name, concept_type, status)
         VALUES ($1, 'Bar Vela', 'bar', 'active') RETURNING id`,
        [org],
      )
    ).rows[0].id;
    const loc1 = (
      await c.query(
        `INSERT INTO locations (organization_id, restaurant_id, name, code, timezone, status)
         VALUES ($1, $2, 'Vela SoHo', $3, 'America/New_York', 'active') RETURNING id`,
        [org, restaurant, uniq('VELA-SOHO')],
      )
    ).rows[0].id;
    const loc2 = (
      await c.query(
        `INSERT INTO locations (organization_id, restaurant_id, name, code, timezone, status)
         VALUES ($1, $2, 'Vela Midtown', $3, 'America/New_York', 'active') RETURNING id`,
        [org, restaurant, uniq('VELA-MID')],
      )
    ).rows[0].id;

    const roleRows = await c.query(
      `SELECT id, key FROM roles WHERE organization_id IS NULL AND is_system`,
    );
    const roleIds: Record<string, string> = {};
    for (const r of roleRows.rows) roleIds[r.key] = r.id;

    const users: OrgFixture['users'] = {} as OrgFixture['users'];
    const memberships: Record<string, string> = {};
    for (const [key, roleKey] of [
      ['owner', 'owner'],
      ['cfo', 'cfo'],
      ['controller', 'controller'],
      ['gm', 'gm'],
      ['clerk', 'ap_clerk'],
      ['viewer', 'viewer'],
    ] as const) {
      const userId = (
        await c.query(
          `INSERT INTO users (email, full_name, auth_provider, status)
           VALUES ($1, $2, 'password', 'active') RETURNING id`,
          [`${uniq(key)}@example.com`, `${key} user`],
        )
      ).rows[0].id;
      users[key] = userId;
      const scope = key === 'gm' ? 'listed' : 'all';
      const membershipId = (
        await c.query(
          `INSERT INTO user_org_roles (user_id, organization_id, role_id, location_scope, status)
           VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
          [userId, org, roleIds[roleKey], scope],
        )
      ).rows[0].id;
      memberships[key] = membershipId;
      if (key === 'gm') {
        await c.query(
          `INSERT INTO user_location_access (user_org_role_id, location_id) VALUES ($1, $2)`,
          [membershipId, loc1],
        );
      }
    }

    const catFood = (
      await c.query(
        `INSERT INTO expense_categories (organization_id, name, code, statement_group)
         VALUES ($1, 'Food', $2, 'cogs') RETURNING id`,
        [org, uniq('5010')],
      )
    ).rows[0].id;
    const catFees = (
      await c.query(
        `INSERT INTO expense_categories (organization_id, name, code, statement_group)
         VALUES ($1, 'Bank Fees', $2, 'gna') RETURNING id`,
        [org, uniq('8010')],
      )
    ).rows[0].id;
    const vendor = (
      await c.query(
        `INSERT INTO vendors (organization_id, name, normalized_name, payment_terms_days, status)
         VALUES ($1, $2, '', 30, 'active') RETURNING id`,
        [org, `Hudson Valley Produce ${uniq('v')}`],
      )
    ).rows[0].id;
    const account = (
      await c.query(
        `INSERT INTO bank_accounts (organization_id, institution_name, account_name, account_mask, account_type, currency, status)
         VALUES ($1, 'Chase', 'Operating', '4321', 'checking', 'USD', 'active') RETURNING id`,
        [org],
      )
    ).rows[0].id;

    return { org, restaurant, loc1, loc2, users, memberships, roleIds, vendor, catFood, catFees, account };
  } finally {
    c.release();
  }
}

/**
 * Run fn inside one transaction as the RLS-constrained app (or AI) role with
 * the given org/user context — exactly what the API does per request.
 */
export async function withCtx<T>(
  ctx: { org: string; user?: string; role?: 'monark_app' | 'monark_ai' },
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${ctx.role ?? 'monark_app'}`);
    await c.query(`SELECT set_config('app.org_id', $1, true)`, [ctx.org]);
    if (ctx.user) {
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [ctx.user]);
    }
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

export interface InvoiceSpec {
  fixture: OrgFixture;
  number?: string;
  vendor?: string;
  location?: string;
  invoiceDate: string;
  serviceDate?: string;
  expenseDate?: string;
  subtotal: number;
  tax?: number;
  lines?: Array<{ amount: number; category?: string; location?: string }>;
  approve?: boolean;
  createdBy?: string;
  reversalOf?: string;
}

export async function createInvoice(spec: InvoiceSpec): Promise<string> {
  const f = spec.fixture;
  const lines = spec.lines ?? [{ amount: spec.subtotal }];
  const id = (
    await pool.query(
      `INSERT INTO invoices (organization_id, location_id, vendor_id, invoice_number,
                             invoice_date, service_date, expense_date, currency,
                             subtotal, tax, total, status, source, created_by, reversal_of_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, 'draft', 'manual', $11, $12)
       RETURNING id`,
      [
        f.org,
        spec.location ?? f.loc1,
        spec.vendor ?? f.vendor,
        spec.number ?? uniq('INV'),
        spec.invoiceDate,
        spec.serviceDate ?? null,
        spec.expenseDate ?? null,
        spec.subtotal,
        spec.tax ?? 0,
        spec.subtotal + (spec.tax ?? 0),
        spec.createdBy ?? f.users.clerk,
        spec.reversalOf ?? null,
      ],
    )
  ).rows[0].id;
  let lineNo = 1;
  for (const line of lines) {
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, line_no, description, amount, expense_category_id, location_id)
       VALUES ($1, $2, 'line', $3, $4, $5)`,
      [id, lineNo++, line.amount, line.category ?? f.catFood, line.location ?? null],
    );
  }
  if (spec.approve !== false) {
    await pool.query(`UPDATE invoices SET status = 'approved' WHERE id = $1`, [id]);
  }
  return id;
}

export interface PaymentSpec {
  fixture: OrgFixture;
  amount: number;
  date: string;
  method?: string;
  createdBy?: string;
  approvers?: string[]; // decided in order; defaults to [cfo]
  allocations?: Array<{ invoice: string | null; amount: number }>;
  settle?: boolean;
  account?: string;
}

/** Creates a payment with a satisfied approval chain, allocations, and (by default) settles it. */
export async function createPayment(spec: PaymentSpec): Promise<string> {
  const f = spec.fixture;
  const id = (
    await pool.query(
      `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency,
                             payment_date, initiated_at, status, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, 'USD', $5, now(), 'scheduled', $6, $7)
       RETURNING id`,
      [
        f.org,
        spec.account ?? f.account,
        spec.method ?? 'ach',
        spec.amount,
        spec.date,
        uniq('idem'),
        spec.createdBy ?? f.users.clerk,
      ],
    )
  ).rows[0].id;

  const approvers = spec.approvers ?? [f.users.cfo];
  let step = 1;
  for (const approver of approvers) {
    await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
       VALUES ($1, 'payment', $2, $3, $4, '{}'::jsonb)`,
      [f.org, id, step++, approver],
    );
  }
  await pool.query(
    `UPDATE approvals SET decision = 'approved' WHERE subject_type = 'payment' AND subject_id = $1`,
    [id],
  );

  for (const alloc of spec.allocations ?? []) {
    await pool.query(
      `INSERT INTO payment_matches (payment_id, invoice_id, amount_applied, matched_by, matched_at)
       VALUES ($1, $2, $3, 'user', now())`,
      [id, alloc.invoice, alloc.amount],
    );
  }
  if (spec.settle !== false) {
    await pool.query(`UPDATE payments SET status = 'settled' WHERE id = $1`, [id]);
  }
  return id;
}

export async function insertBankTxn(spec: {
  account: string;
  posted: string;
  amount: number;
  description: string;
  externalId?: string;
  category?: string;
}): Promise<string> {
  return (
    await pool.query(
      `INSERT INTO bank_transactions (bank_account_id, external_txn_id, posted_at, amount, description_raw, category_id, dedupe_hash)
       VALUES ($1, $2, $3, $4, $5, $6, '') RETURNING id`,
      [spec.account, spec.externalId ?? null, spec.posted, spec.amount, spec.description, spec.category ?? null],
    )
  ).rows[0].id;
}

/** P&L rows by expense_month for an org (superuser read; RLS tests use withCtx). */
export async function plByMonth(org: string): Promise<Map<string, number>> {
  const r = await pool.query(
    `SELECT expense_month::text AS month, sum(expense_amount)::numeric AS amount
       FROM v_pl_by_month WHERE organization_id = $1 GROUP BY 1`,
    [org],
  );
  return new Map(r.rows.map((row) => [row.month, Number(row.amount)]));
}

export async function cashByMonth(org: string, direction: 'in' | 'out' = 'out'): Promise<Map<string, number>> {
  const r = await pool.query(
    `SELECT cash_month::text AS month, sum(amount)::numeric AS amount
       FROM v_cash_flow_by_month WHERE organization_id = $1 AND direction = $2 GROUP BY 1`,
    [org, direction],
  );
  return new Map(r.rows.map((row) => [row.month, Number(row.amount)]));
}

export async function auditRows(org: string, action?: string) {
  const r = await pool.query(
    `SELECT * FROM audit_logs WHERE organization_id = $1 AND ($2::text IS NULL OR action = $2) ORDER BY id`,
    [org, action ?? null],
  );
  return r.rows;
}

export async function expectReject(promise: Promise<unknown>, pattern: RegExp | string): Promise<void> {
  await expect(promise).rejects.toThrow(pattern);
}

export async function getInvoice(id: string) {
  return (await pool.query(`SELECT * FROM invoices WHERE id = $1`, [id])).rows[0];
}

export async function getPayment(id: string) {
  return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [id])).rows[0];
}

export async function getBankTxn(id: string) {
  return (await pool.query(`SELECT * FROM bank_transactions WHERE id = $1`, [id])).rows[0];
}
