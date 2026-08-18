/**
 * T-000 · CRITICAL — the $5,000 cross-month invoice.
 *
 * Invoice HVP-90187: $5,000, expense_date Aug 12 2026 (→ expense_month AUG),
 * paid by ACH Sep 3 (→ payment_month SEP). One transaction = one financial
 * event: one accrual row (AUG), one cash row (SEP), one match linking them.
 * No path may produce a second September expense.
 */
import { describe, expect, it } from 'vitest';
import {
  cashByMonth,
  createInvoice,
  createOrg,
  createPayment,
  getBankTxn,
  getInvoice,
  insertBankTxn,
  plByMonth,
  pool,
} from './helpers.js';

describe('T-000 · $5,000 August invoice paid in September', () => {
  it('books one August expense, one September cash outflow, and nothing else', async () => {
    const f = await createOrg();

    const invoice = await createInvoice({
      fixture: f,
      number: 'HVP-90187',
      invoiceDate: '2026-08-12',
      expenseDate: '2026-08-12',
      subtotal: 5000,
    });

    const inv0 = await getInvoice(invoice);
    expect(inv0.expense_month.toISOString().slice(0, 10)).toBe('2026-08-01');

    const payment = await createPayment({
      fixture: f,
      amount: 5000,
      date: '2026-09-03',
      allocations: [{ invoice, amount: 5000 }],
    });

    // The match back-fills the invoice's cash side.
    const inv = await getInvoice(invoice);
    expect(inv.status).toBe('paid');
    expect(Number(inv.amount_paid)).toBe(5000);
    expect(inv.payment_date.toISOString().slice(0, 10)).toBe('2026-09-03');
    expect(inv.payment_month.toISOString().slice(0, 10)).toBe('2026-09-01');

    const pl = await plByMonth(f.org);
    const cash = await cashByMonth(f.org);

    // August P&L expense: −$5,000 (stored as a positive expense amount).
    expect(pl.get('2026-08-01')).toBe(5000);
    // September P&L expense: $0.
    expect(pl.get('2026-09-01') ?? 0).toBe(0);
    // August cash outflow: $0.
    expect(cash.get('2026-08-01') ?? 0).toBe(0);
    // September cash outflow: −$5,000.
    expect(cash.get('2026-09-01')).toBe(5000);
    // Total expense across both months: exactly −$5,000.
    expect([...pl.values()].reduce((a, b) => a + b, 0)).toBe(5000);

    // Sep 4: the bank debit syncs, carrying a direct category from a rule —
    // matching it to the payment must clear the category and book NOTHING.
    const txn = await insertBankTxn({
      account: f.account,
      posted: '2026-09-04',
      amount: -5000,
      description: 'ACH HUDSON VALLEY PRODUCE 90187',
      externalId: 'plaid-t000-1',
      category: f.catFood,
    });
    await pool.query(
      `UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`,
      [txn, payment],
    );

    const matched = await getBankTxn(txn);
    expect(matched.match_status).toBe('matched_payment');
    expect(matched.category_id).toBeNull();

    const plAfter = await plByMonth(f.org);
    const cashAfter = await cashByMonth(f.org);
    expect(plAfter.get('2026-08-01')).toBe(5000);
    expect(plAfter.get('2026-09-01') ?? 0).toBe(0); // never a second September expense
    expect(cashAfter.get('2026-09-01')).toBe(5000); // still exactly one cash event
    expect([...plAfter.values()].reduce((a, b) => a + b, 0)).toBe(5000);
  });
});
