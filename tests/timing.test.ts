/**
 * §2 · Invoice / payment timing — T-101..T-112.
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
  getPayment,
  plByMonth,
  pool,
  uniq,
} from './helpers.js';

describe('invoice/payment timing', () => {
  it('T-101 · same-month: Aug invoice paid Aug → one AUG expense + one AUG cash', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-05', subtotal: 1200 });
    await createPayment({ fixture: f, amount: 1200, date: '2026-08-20', allocations: [{ invoice, amount: 1200 }] });
    expect((await plByMonth(f.org)).get('2026-08-01')).toBe(1200);
    expect((await cashByMonth(f.org)).get('2026-08-01')).toBe(1200);
    expect([...(await plByMonth(f.org)).entries()]).toHaveLength(1);
    expect([...(await cashByMonth(f.org)).entries()]).toHaveLength(1);
  });

  it('T-102 · cross-month: Aug invoice paid Sep → AUG expense, SEP cash', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 5000 });
    await createPayment({ fixture: f, amount: 5000, date: '2026-09-03', allocations: [{ invoice, amount: 5000 }] });
    const pl = await plByMonth(f.org);
    const cash = await cashByMonth(f.org);
    expect(pl.get('2026-08-01')).toBe(5000);
    expect(pl.get('2026-09-01') ?? 0).toBe(0);
    expect(cash.get('2026-08-01') ?? 0).toBe(0);
    expect(cash.get('2026-09-01')).toBe(5000);
  });

  it('T-103 · service-period expense: Jul service billed Aug → JUL expense, AUG cash', async () => {
    const f = await createOrg();
    // expense_date defaults to coalesce(service_date, invoice_date).
    const invoice = await createInvoice({
      fixture: f,
      invoiceDate: '2026-08-02',
      serviceDate: '2026-07-28',
      subtotal: 840,
    });
    const inv = await getInvoice(invoice);
    expect(inv.expense_month.toISOString().slice(0, 10)).toBe('2026-07-01');
    await createPayment({ fixture: f, amount: 840, date: '2026-08-15', allocations: [{ invoice, amount: 840 }] });
    expect((await plByMonth(f.org)).get('2026-07-01')).toBe(840);
    expect((await cashByMonth(f.org)).get('2026-08-01')).toBe(840);
  });

  it('T-104 · partial payments: one AUG expense, two cash events, Σ matches = total', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-03', subtotal: 3700 });
    await createPayment({ fixture: f, amount: 2000, date: '2026-08-25', allocations: [{ invoice, amount: 2000 }] });
    let inv = await getInvoice(invoice);
    expect(inv.status).toBe('partially_paid');
    expect(Number(inv.amount_paid)).toBe(2000);
    expect(inv.payment_date).toBeNull(); // not fully settled yet

    await createPayment({ fixture: f, amount: 1700, date: '2026-09-10', allocations: [{ invoice, amount: 1700 }] });
    inv = await getInvoice(invoice);
    expect(inv.status).toBe('paid');
    expect(Number(inv.amount_paid)).toBe(3700);
    expect(inv.payment_date.toISOString().slice(0, 10)).toBe('2026-09-10');

    const pl = await plByMonth(f.org);
    const cash = await cashByMonth(f.org);
    expect(pl.get('2026-08-01')).toBe(3700);
    expect([...pl.keys()]).toHaveLength(1); // one accrual event
    expect(cash.get('2026-08-01')).toBe(2000);
    expect(cash.get('2026-09-01')).toBe(1700); // exactly two cash events
  });

  it('T-105 · prepayment: deposit paid Aug for Sep invoice → SEP expense, AUG cash', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({
      fixture: f,
      invoiceDate: '2026-08-18',
      serviceDate: '2026-09-12', // the event happens in September
      subtotal: 2500,
    });
    await createPayment({ fixture: f, amount: 2500, date: '2026-08-20', allocations: [{ invoice, amount: 2500 }] });
    const pl = await plByMonth(f.org);
    const cash = await cashByMonth(f.org);
    expect(pl.get('2026-09-01')).toBe(2500);
    expect(pl.get('2026-08-01') ?? 0).toBe(0); // no AUG expense
    expect(cash.get('2026-08-01')).toBe(2500);
  });

  it('T-106 · void after payment scheduled → expense reversed, scheduled payment auto-cancelled', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 900 });
    const payment = await createPayment({
      fixture: f,
      amount: 900,
      date: '2026-09-01',
      allocations: [{ invoice, amount: 900 }],
      settle: false, // stays scheduled in the Treasury queue
    });
    expect((await getInvoice(invoice)).status).toBe('scheduled');

    await pool.query(`UPDATE invoices SET status = 'void' WHERE id = $1`, [invoice]);

    // The T-106 fix: the void cancels the dependent scheduled payment in the
    // same transaction — no path to paying a voided invoice.
    expect((await getPayment(payment)).status).toBe('voided');
    expect((await plByMonth(f.org)).get('2026-08-01') ?? 0).toBe(0); // expense reversed
    expect((await cashByMonth(f.org)).size).toBe(0);

    // Both audit rows written.
    const invoiceAudits = (await auditRows(f.org, 'invoices.update')).filter((r) => r.subject_id === invoice);
    const paymentAudits = (await auditRows(f.org, 'payments.update')).filter((r) => r.subject_id === payment);
    expect(invoiceAudits.some((r) => r.after?.status === 'void')).toBe(true);
    expect(paymentAudits.some((r) => r.after?.status === 'voided')).toBe(true);
  });

  it('T-107 · failed ACH then retry → no cash on failure, single SEP cash on retry', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 5000 });
    const failed = await createPayment({
      fixture: f,
      amount: 5000,
      date: '2026-09-03',
      allocations: [{ invoice, amount: 5000 }],
      settle: false,
    });
    await pool.query(`UPDATE payments SET status = 'processing' WHERE id = $1`, [failed]);
    await pool.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [failed]); // R01
    expect((await cashByMonth(f.org)).size).toBe(0); // no cash event on failure
    expect((await getInvoice(invoice)).status).toBe('approved'); // back to payable

    await createPayment({ fixture: f, amount: 5000, date: '2026-09-08', allocations: [{ invoice, amount: 5000 }] });
    const cash = await cashByMonth(f.org);
    expect(cash.get('2026-09-01')).toBe(5000); // a single September cash event
    expect([...cash.keys()]).toHaveLength(1);
    expect((await getInvoice(invoice)).status).toBe('paid');
  });

  it('T-108 · overpayment attempt: $5,200 against a $5,000 invoice → rejected', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 5000 });
    await expectReject(
      createPayment({ fixture: f, amount: 5200, date: '2026-09-03', allocations: [{ invoice, amount: 5200 }] }),
      /exceed invoice total/,
    );
  });

  it('T-109 · payment backdated into a locked period → rejected by the period-lock trigger', async () => {
    const f = await createOrg();
    await pool.query(
      `INSERT INTO financial_periods (organization_id, period_month, starts_on, ends_on, status)
       VALUES ($1, '2026-07-01', '2026-07-01', '2026-07-31', 'locked')`,
      [f.org],
    );
    await expectReject(
      createPayment({ fixture: f, amount: 300, date: '2026-07-28', settle: false }),
      /period containing 2026-07-28 is locked/,
    );
  });

  it('T-110 · credit memo: reversal row in the open month; original untouched', async () => {
    const f = await createOrg();
    const original = await createInvoice({ fixture: f, invoiceDate: '2026-08-06', subtotal: 460 });
    const memo = await createInvoice({
      fixture: f,
      invoiceDate: '2026-09-02',
      subtotal: -460,
      lines: [{ amount: -460 }],
      reversalOf: original,
    });
    const pl = await plByMonth(f.org);
    expect(pl.get('2026-08-01')).toBe(460); // original untouched
    expect(pl.get('2026-09-01')).toBe(-460); // reversal lands in the open month
    expect((await getInvoice(original)).status).toBe('approved');
    expect((await getInvoice(memo)).reversal_of_id).toBe(original);
  });

  it('T-111 · one payment settles 3 invoices: 3 allocations, one cash event, Σ = payment.amount', async () => {
    const f = await createOrg();
    const inv1 = await createInvoice({ fixture: f, invoiceDate: '2026-08-02', subtotal: 2000 });
    const inv2 = await createInvoice({ fixture: f, invoiceDate: '2026-08-09', subtotal: 1500 });
    const inv3 = await createInvoice({ fixture: f, invoiceDate: '2026-08-16', subtotal: 900 });
    const payment = await createPayment({
      fixture: f,
      amount: 4400,
      date: '2026-09-05',
      allocations: [
        { invoice: inv1, amount: 2000 },
        { invoice: inv2, amount: 1500 },
        { invoice: inv3, amount: 900 },
      ],
    });
    const matches = await pool.query(
      `SELECT sum(amount_applied)::numeric AS total, count(*) FROM payment_matches WHERE payment_id = $1`,
      [payment],
    );
    expect(Number(matches.rows[0].total)).toBe(4400);
    expect(Number(matches.rows[0].count)).toBe(3);
    const cash = await cashByMonth(f.org);
    expect(cash.get('2026-09-01')).toBe(4400);
    for (const id of [inv1, inv2, inv3]) {
      expect((await getInvoice(id)).status).toBe('paid');
    }
  });

  it('T-112 · expense-date edit after approval: allowed pre-lock, audited, month regenerated', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 750 });
    await pool.query(`UPDATE invoices SET expense_date = '2026-08-14' WHERE id = $1`, [invoice]);
    let inv = await getInvoice(invoice);
    expect(inv.expense_month.toISOString().slice(0, 10)).toBe('2026-08-01');

    await pool.query(`UPDATE invoices SET expense_date = '2026-09-02' WHERE id = $1`, [invoice]);
    inv = await getInvoice(invoice);
    expect(inv.expense_month.toISOString().slice(0, 10)).toBe('2026-09-01'); // regenerated

    const audits = (await auditRows(f.org, 'invoices.update')).filter((r) => r.subject_id === invoice);
    const edit = audits.find((r) => r.after?.expense_date === '2026-09-02');
    expect(edit).toBeDefined();
    expect(edit!.before.expense_date).toBe('2026-08-14'); // before/after captured
  });
});
