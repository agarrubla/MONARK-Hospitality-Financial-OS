/**
 * §6 · Accrual, cash & multi-location assertions (4 × 4 checks).
 */
import { describe, expect, it } from 'vitest';
import {
  auditRows,
  cashByMonth,
  createInvoice,
  createOrg,
  createPayment,
  expectReject,
  getInvoice,
  insertBankTxn,
  plByMonth,
  pool,
  uniq,
  withCtx,
} from './helpers.js';

describe('accrual accounting', () => {
  it('sums the P&L strictly by expense_month', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-07-20', subtotal: 100 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 200 });
    const inv = await createInvoice({ fixture: f, invoiceDate: '2026-08-28', subtotal: 300 });
    await createPayment({ fixture: f, amount: 300, date: '2026-10-15', allocations: [{ invoice: inv, amount: 300 }] });
    const pl = await plByMonth(f.org);
    expect(pl.get('2026-07-01')).toBe(100);
    expect(pl.get('2026-08-01')).toBe(500);
    expect(pl.get('2026-10-01') ?? 0).toBe(0); // payment month never books expense
  });

  it('shows unpaid approved invoices in accrual, never in cash', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 2400 });
    expect((await plByMonth(f.org)).get('2026-08-01')).toBe(2400);
    expect((await cashByMonth(f.org)).size).toBe(0);
  });

  it('rejects direct writes to the generated month columns', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 100 });
    await expectReject(
      pool.query(`UPDATE invoices SET expense_month = '2026-09-01' WHERE id = $1`, [invoice]),
      /can only be updated to DEFAULT|generated/i,
    );
    await expectReject(
      pool.query(
        `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency, payment_date,
                               payment_month, initiated_at, status, idempotency_key, created_by)
         VALUES ($1, $2, 'ach', 10, 'USD', '2026-09-01', '2026-09-01', now(), 'scheduled', $3, $4)`,
        [f.org, f.account, uniq('idem'), f.users.clerk],
      ),
      /cannot insert a non-DEFAULT value|generated/i,
    );
  });

  it('regenerates months atomically when classification dates change', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 100 });
    await pool.query(`UPDATE invoices SET expense_date = '2026-09-09' WHERE id = $1`, [invoice]);
    const inv = await getInvoice(invoice);
    expect(inv.expense_date.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(inv.expense_month.toISOString().slice(0, 10)).toBe('2026-09-01'); // same row version
    const pl = await plByMonth(f.org);
    expect(pl.get('2026-08-01') ?? 0).toBe(0);
    expect(pl.get('2026-09-01')).toBe(100);
  });
});

describe('cash accounting', () => {
  it('sums cash flow strictly by payment_month', async () => {
    const f = await createOrg();
    const inv = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 1000 });
    await createPayment({ fixture: f, amount: 1000, date: '2026-09-30', allocations: [{ invoice: inv, amount: 1000 }] });
    const cash = await cashByMonth(f.org);
    expect(cash.get('2026-09-01')).toBe(1000);
    expect(cash.get('2026-08-01') ?? 0).toBe(0);
  });

  it('produces zero cash rows for failed payments', async () => {
    const f = await createOrg();
    const inv = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 640 });
    const p = await createPayment({ fixture: f, amount: 640, date: '2026-09-02', allocations: [{ invoice: inv, amount: 640 }], settle: false });
    await pool.query(`UPDATE payments SET status = 'processing' WHERE id = $1`, [p]);
    await pool.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [p]);
    expect((await cashByMonth(f.org)).size).toBe(0);
  });

  it('produces exactly N cash events for N partial payments', async () => {
    const f = await createOrg();
    const inv = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 900 });
    await createPayment({ fixture: f, amount: 400, date: '2026-08-20', allocations: [{ invoice: inv, amount: 400 }] });
    await createPayment({ fixture: f, amount: 500, date: '2026-09-04', allocations: [{ invoice: inv, amount: 500 }] });
    const events = await pool.query(
      `SELECT count(*) FROM v_cash_flow_by_month WHERE organization_id = $1 AND direction = 'out'`, [f.org],
    );
    expect(events.rows[0].count).toBe('2');
  });

  it('books a bank-only direct expense in both P&L and cash, once, on the same date', async () => {
    const f = await createOrg();
    await insertBankTxn({
      account: f.account, posted: '2026-08-09', amount: -85,
      description: 'MONTHLY SERVICE FEE', externalId: 'plaid-fee-1', category: f.catFees,
    });
    const pl = await plByMonth(f.org);
    const cash = await cashByMonth(f.org);
    expect(pl.get('2026-08-01')).toBe(85);
    expect(cash.get('2026-08-01')).toBe(85);
    expect([...pl.values()].reduce((a, b) => a + b, 0)).toBe(85); // once
    expect([...cash.values()].reduce((a, b) => a + b, 0)).toBe(85); // once
  });
});

describe('multi-location', () => {
  it('consolidated P&L equals the sum of location P&Ls to the penny', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-04', subtotal: 1234.56, location: f.loc1 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 789.01, location: f.loc2 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-06', subtotal: 0.03, location: f.loc2 });
    const byLoc = await pool.query(
      `SELECT location_id, sum(expense_amount)::numeric AS amount
         FROM v_pl_by_month WHERE organization_id = $1 GROUP BY 1`, [f.org],
    );
    const consolidated = await pool.query(
      `SELECT sum(expense_amount)::numeric AS amount FROM v_pl_by_month WHERE organization_id = $1`, [f.org],
    );
    const sumOfLocations = byLoc.rows.reduce((a, r) => a + Number(r.amount), 0);
    expect(Number(consolidated.rows[0].amount)).toBeCloseTo(sumOfLocations, 10);
    expect(Number(consolidated.rows[0].amount)).toBeCloseTo(2023.6, 10);
  });

  it('allocates split-location invoice lines without residue', async () => {
    const f = await createOrg();
    await createInvoice({
      fixture: f, invoiceDate: '2026-08-04', subtotal: 500,
      lines: [
        { amount: 300, location: f.loc1 },
        { amount: 200, location: f.loc2 },
      ],
    });
    const rows = await pool.query(
      `SELECT location_id, sum(expense_amount)::numeric AS amount
         FROM v_pl_by_month WHERE organization_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [f.org],
    );
    expect(rows.rows).toHaveLength(2);
    expect(Number(rows.rows[0].amount)).toBe(300);
    expect(Number(rows.rows[1].amount)).toBe(200);
    expect(Number(rows.rows[0].amount) + Number(rows.rows[1].amount)).toBe(500); // no residue
  });

  it('moves expense between location P&Ls on line reassignment, group total unchanged', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({
      fixture: f, invoiceDate: '2026-08-04', subtotal: 500,
      lines: [{ amount: 300, location: f.loc1 }, { amount: 200, location: f.loc1 }],
    });
    const line = (await pool.query(
      `SELECT id FROM invoice_line_items WHERE invoice_id = $1 AND amount = 200`, [invoice],
    )).rows[0].id;
    await pool.query(`UPDATE invoice_line_items SET location_id = $1 WHERE id = $2`, [f.loc2, line]);
    const rows = await pool.query(
      `SELECT location_id, sum(expense_amount)::numeric AS amount
         FROM v_pl_by_month WHERE organization_id = $1 GROUP BY 1`, [f.org],
    );
    const byLoc = new Map(rows.rows.map((r) => [r.location_id, Number(r.amount)]));
    expect(byLoc.get(f.loc1)).toBe(300);
    expect(byLoc.get(f.loc2)).toBe(200);
    const total = await pool.query(
      `SELECT sum(expense_amount)::numeric AS t FROM v_pl_by_month WHERE organization_id = $1`, [f.org],
    );
    expect(Number(total.rows[0].t)).toBe(500); // group total unchanged
  });

  it('excludes non-granted locations from org rollups per caller', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-04', subtotal: 111, location: f.loc1 });
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 999, location: f.loc2 });
    const gmRollup = await withCtx({ org: f.org, user: f.users.gm }, async (c) =>
      Number((await c.query(`SELECT coalesce(sum(expense_amount), 0) AS t FROM v_pl_by_month`)).rows[0].t));
    expect(gmRollup).toBe(111);
  });
});

describe('audit logs', () => {
  it('writes ≥1 audit row in-transaction for every financial mutation', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 150 });
    await createPayment({ fixture: f, amount: 150, date: '2026-08-20', allocations: [{ invoice, amount: 150 }] });
    const actions = new Set((await auditRows(f.org)).map((r) => r.action));
    for (const expected of [
      'invoices.insert', 'invoice_line_items.insert', 'invoices.update',
      'payments.insert', 'payments.update', 'approvals.insert', 'approvals.update',
      'payment_matches.insert',
    ]) {
      expect(actions, `missing audit action ${expected}`).toContain(expected);
    }
  });

  it('detects a tampered row by re-walking the hash chain', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 300 });
    const intact = await pool.query(`SELECT * FROM verify_audit_chain($1)`, [f.org]);
    expect(intact.rowCount).toBe(0);

    // Simulated tamper: even the append-only guard must be disabled by a
    // superuser first — and the chain still catches the edit.
    const victim = (await auditRows(f.org))[0];
    await pool.query(`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable`);
    await pool.query(`UPDATE audit_logs SET after = '{"forged": true}'::jsonb WHERE id = $1`, [victim.id]);
    await pool.query(`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable`);

    const broken = await pool.query(`SELECT * FROM verify_audit_chain($1)`, [f.org]);
    expect(broken.rowCount).toBeGreaterThan(0);
    expect(broken.rows.map((r) => Number(r.broken_id))).toContain(Number(victim.id));
  });

  it('is append-only: UPDATE and DELETE are blocked for everyone', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 300 });
    const row = (await auditRows(f.org))[0];
    await expectReject(
      pool.query(`UPDATE audit_logs SET action = 'x' WHERE id = $1`, [row.id]),
      /append-only/,
    );
    await expectReject(
      pool.query(`DELETE FROM audit_logs WHERE id = $1`, [row.id]),
      /append-only/,
    );
  });

  it('captures exact decimals in before/after and redacts sensitive fields', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 100.1, approve: false });
    await pool.query(
      `UPDATE invoices SET subtotal = 100.15, total = 100.15 WHERE id = $1`, [invoice],
    );
    const edit = (await auditRows(f.org, 'invoices.update')).find((r) => r.subject_id === invoice);
    expect(edit!.before.subtotal).toBe(100.1);
    expect(edit!.after.subtotal).toBe(100.15); // exact decimals, not floats-of-floats

    await pool.query(`UPDATE vendors SET remittance = '{"routing": "021000021"}'::jsonb WHERE id = $1`, [f.vendor]);
    const vendorEdit = (await auditRows(f.org, 'vendors.update')).find((r) => r.subject_id === f.vendor);
    expect(vendorEdit!.after.remittance.redacted).toBe(true);
    expect(vendorEdit!.after.remittance.sha256).toMatch(/^[0-9a-f]{64}$/); // hash only, never plaintext
    expect(JSON.stringify(vendorEdit!.after)).not.toContain('021000021');
  });
});
