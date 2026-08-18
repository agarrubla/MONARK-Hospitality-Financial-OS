/**
 * §4 · Permissions — T-301..T-310 (database layer).
 * T-311 (step-up MFA) and T-312 (revoked sessions) live in api.test.ts:
 * they exercise the session/authorization layer above the database.
 */
import { describe, expect, it } from 'vitest';
import {
  auditRows,
  createInvoice,
  createOrg,
  createPayment,
  expectReject,
  pool,
  uniq,
  withCtx,
} from './helpers.js';

describe('permissions & isolation', () => {
  it('T-301 · creator cannot approve their own invoice; the attempt is audited', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 3000, approve: false, createdBy: f.users.gm });
    // Hard block at chain creation: the creator can never be their own approver.
    await expectReject(
      pool.query(
        `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
         VALUES ($1, 'invoice', $2, 1, $3, '{}'::jsonb)`,
        [f.org, invoice, f.users.gm],
      ),
      /separation of duties/,
    );
    // Blocked decisions are audited, not lost to a rollback: a valid chain
    // decided by the wrong person returns blocked + writes an audit row.
    await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
       VALUES ($1, 'invoice', $2, 1, $3, '{}'::jsonb)`,
      [f.org, invoice, f.users.cfo],
    );
    const approvalId = (
      await pool.query(`SELECT id FROM approvals WHERE subject_id = $1`, [invoice])
    ).rows[0].id;
    const result = await withCtx({ org: f.org, user: f.users.gm }, async (c) => {
      const r = await c.query(`SELECT decide_approval($1, 'approved') AS outcome`, [approvalId]);
      return r.rows[0].outcome;
    });
    expect(result).toMatch(/^blocked: only the assigned approver/);
    const blocked = await auditRows(f.org, 'approval.blocked');
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('T-302 · same user cannot initiate and approve one payment (DB trigger)', async () => {
    const f = await createOrg();
    const payment = await createPayment({
      fixture: f, amount: 400, date: '2026-09-01',
      createdBy: f.users.cfo, approvers: [f.users.owner], settle: false,
    });
    await expectReject(
      pool.query(
        `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
         VALUES ($1, 'payment', $2, 2, $3, '{}'::jsonb)`,
        [f.org, payment, f.users.cfo],
      ),
      /separation of duties/,
    );
  });

  it('T-303 · GM cannot approve an invoice outside their location grant', async () => {
    const f = await createOrg();
    // gm is scoped to loc1; the invoice lives at loc2.
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 800, location: f.loc2, approve: false });
    await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
       VALUES ($1, 'invoice', $2, 1, $3, '{}'::jsonb)`,
      [f.org, invoice, f.users.gm],
    );
    const approvalId = (await pool.query(`SELECT id FROM approvals WHERE subject_id = $1`, [invoice])).rows[0].id;
    const outcome = await withCtx({ org: f.org, user: f.users.gm }, async (c) => {
      return (await c.query(`SELECT decide_approval($1, 'approved') AS o`, [approvalId])).rows[0].o;
    });
    expect(outcome).toMatch(/blocked: .*location.*re-checked at decision time/);
    expect((await pool.query(`SELECT decision FROM approvals WHERE id = $1`, [approvalId])).rows[0].decision).toBe('pending');
  });

  it('T-304 · role revoked mid-chain: stale eligibility rejected at decision time (F-02)', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 800, approve: false });
    await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
       VALUES ($1, 'invoice', $2, 1, $3, '{}'::jsonb)`,
      [f.org, invoice, f.users.controller],
    );
    const approvalId = (await pool.query(`SELECT id FROM approvals WHERE subject_id = $1`, [invoice])).rows[0].id;
    await pool.query(`UPDATE user_org_roles SET status = 'revoked' WHERE id = $1`, [f.memberships.controller]);
    const outcome = await withCtx({ org: f.org, user: f.users.controller }, async (c) => {
      return (await c.query(`SELECT decide_approval($1, 'approved') AS o`, [approvalId])).rows[0].o;
    });
    expect(outcome).toMatch(/blocked: approver has no active role/);
  });

  it('T-305 · cross-org fetch by guessed UUID returns an empty set via RLS', async () => {
    const a = await createOrg();
    const b = await createOrg();
    const secret = await createInvoice({ fixture: b, invoiceDate: '2026-08-10', subtotal: 9999 });
    const rows = await withCtx({ org: a.org, user: a.users.owner }, async (c) => {
      return (await c.query(`SELECT * FROM invoices WHERE id = $1`, [secret])).rows;
    });
    expect(rows).toHaveLength(0); // empty, not an error revealing existence (F-05)
  });

  it('T-306 · consolidated P&L for a single-location GM equals their location only', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 1000, location: f.loc1 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-06', subtotal: 2000, location: f.loc2 });
    const gmTotal = await withCtx({ org: f.org, user: f.users.gm }, async (c) => {
      return Number((await c.query(
        `SELECT coalesce(sum(expense_amount), 0) AS t FROM v_pl_by_month WHERE expense_month = '2026-08-01'`,
      )).rows[0].t);
    });
    const ownerTotal = await withCtx({ org: f.org, user: f.users.owner }, async (c) => {
      return Number((await c.query(
        `SELECT coalesce(sum(expense_amount), 0) AS t FROM v_pl_by_month WHERE expense_month = '2026-08-01'`,
      )).rows[0].t);
    });
    expect(gmTotal).toBe(1000); // their location only — never masked aggregates of others
    expect(ownerTotal).toBe(3000);
  });

  it('T-307 · remittance is masked for AP clerks; decrypt needs vendor.read_remittance and is audited', async () => {
    const f = await createOrg();
    await pool.query(`UPDATE vendors SET remittance = '{"ach_token": "tok_9f2c"}'::jsonb WHERE id = $1`, [f.vendor]);
    // Column-level: monark_app has no SELECT grant on vendors.remittance.
    await expectReject(
      withCtx({ org: f.org, user: f.users.clerk }, (c) =>
        c.query(`SELECT remittance FROM vendors WHERE id = $1`, [f.vendor])),
      /permission denied/,
    );
    // Clerk lacks the sensitive permission on the audited path too.
    await expectReject(
      withCtx({ org: f.org, user: f.users.clerk }, (c) =>
        c.query(`SELECT read_vendor_remittance($1)`, [f.vendor])),
      /vendor.read_remittance/,
    );
    // Controller holds it: value returned, read audited.
    const value = await withCtx({ org: f.org, user: f.users.controller }, async (c) => {
      return (await c.query(`SELECT read_vendor_remittance($1) AS v`, [f.vendor])).rows[0].v;
    });
    expect(value).toEqual({ ach_token: 'tok_9f2c' });
    expect((await auditRows(f.org, 'vendor.remittance_read')).length).toBe(1);
  });

  it('T-308 · viewer attempting payment.initiate is denied by default', async () => {
    const f = await createOrg();
    await expectReject(
      withCtx({ org: f.org, user: f.users.viewer }, (c) =>
        c.query(
          `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency,
                                 payment_date, initiated_at, status, idempotency_key, created_by)
           VALUES ($1, $2, 'ach', 100, 'USD', '2026-09-01', now(), 'scheduled', $3, $4)`,
          [f.org, f.account, uniq('idem'), f.users.viewer],
        )),
      /payment.initiate/,
    );
  });

  it('T-309 · owner-tier approval is not delegable below the owner role', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 15000 });
    // Chain satisfied by CFO only — above $10K that is not enough.
    const payment = await createPayment({
      fixture: f, amount: 15000, date: '2026-09-01',
      approvers: [f.users.cfo],
      allocations: [{ invoice, amount: 15000 }], settle: false,
    });
    await expectReject(
      pool.query(`UPDATE payments SET status = 'processing' WHERE id = $1`, [payment]),
      /owner.*approval/,
    );
    // A step that REQUIRES the owner role cannot be decided by a controller.
    await pool.query(
      `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, required_role_id, policy_snapshot)
       VALUES ($1, 'payment', $2, 2, $3, $4, '{}'::jsonb)`,
      [f.org, payment, f.users.controller, f.roleIds.owner],
    );
    const stepId = (await pool.query(
      `SELECT id FROM approvals WHERE subject_id = $1 AND step = 2`, [payment],
    )).rows[0].id;
    const outcome = await withCtx({ org: f.org, user: f.users.controller }, async (c) => {
      return (await c.query(`SELECT decide_approval($1, 'approved') AS o`, [stepId])).rows[0].o;
    });
    expect(outcome).toMatch(/blocked: approver does not hold the role/);
    // With a real owner approval the gate opens.
    await pool.query(`UPDATE approvals SET approver_id = $1, required_role_id = NULL WHERE id = $2`, [f.users.owner, stepId]);
    await pool.query(`UPDATE approvals SET decision = 'approved' WHERE id = $1`, [stepId]);
    await pool.query(`UPDATE payments SET status = 'processing' WHERE id = $1`, [payment]);
    expect((await pool.query(`SELECT status FROM payments WHERE id = $1`, [payment])).rows[0].status).toBe('processing');
  });

  it('T-310 · the AI role reads only within the caller\'s RLS scope and cannot write', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 1000, location: f.loc1 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-06', subtotal: 2000, location: f.loc2 });
    // The assistant executes with the asking GM's grants: loc1 only.
    const rows = await withCtx({ org: f.org, user: f.users.gm, role: 'monark_ai' }, async (c) => {
      return (await c.query(`SELECT location_id FROM invoices`)).rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].location_id).toBe(f.loc1);
    // And the AI can never write financial records — structurally.
    await expectReject(
      withCtx({ org: f.org, user: f.users.owner, role: 'monark_ai' }, (c) =>
        c.query(`UPDATE invoices SET status = 'void' WHERE location_id = $1`, [f.loc1])),
      /permission denied/,
    );
  });
});
