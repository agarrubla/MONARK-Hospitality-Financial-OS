/**
 * §3 · Reconciliation — T-201..T-212.
 */
import { describe, expect, it } from 'vitest';
import {
  cashByMonth,
  createInvoice,
  createOrg,
  createPayment,
  expectReject,
  getBankTxn,
  getPayment,
  insertBankTxn,
  plByMonth,
  pool,
} from './helpers.js';

async function createPosDay(f: Awaited<ReturnType<typeof createOrg>>, businessDate: string, gross: number) {
  const tax = Math.round(gross * 0.08875 * 100) / 100;
  return (
    await pool.query(
      `INSERT INTO pos_sales (organization_id, location_id, business_date, source, gross_sales,
                              discounts, comps, net_sales, tax_collected, tips, tender_breakdown)
       VALUES ($1, $2, $3, 'toast', $4, 0, 0, $4, $5, 0,
               jsonb_build_object('cash', 0, 'card', $4::numeric + $5::numeric, 'gift_card', 0, 'other', 0))
       RETURNING id`,
      [f.org, f.loc1, businessDate, gross, tax],
    )
  ).rows[0].id;
}

async function createDeposit(
  f: Awaited<ReturnType<typeof createOrg>>,
  spec: { expected: number; from: string; to: string; on: string; type?: string },
) {
  return (
    await pool.query(
      `INSERT INTO pos_deposits (organization_id, location_id, deposit_type, covers_from, covers_to,
                                 expected_amount, expected_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [f.org, f.loc1, spec.type ?? 'card_batch', spec.from, spec.to, spec.expected, spec.on],
    )
  ).rows[0].id;
}

describe('reconciliation', () => {
  it('T-201 · exact ACH match: single candidate, link confirmed, payment settled', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 5000 });
    const payment = await createPayment({
      fixture: f, amount: 5000, date: '2026-09-03',
      allocations: [{ invoice, amount: 5000 }], settle: false,
    });
    await pool.query(`UPDATE payments SET status = 'processing' WHERE id = $1`, [payment]);
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-04', amount: -5000,
      description: 'ACH HUDSON VALLEY PRODUCE', externalId: 'plaid-201',
    });
    const candidates = await pool.query(
      `SELECT * FROM v_payment_match_candidates WHERE bank_transaction_id = $1`, [txn],
    );
    expect(candidates.rows).toHaveLength(1);
    expect(candidates.rows[0].payment_id).toBe(payment);

    await pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payment]);
    await pool.query(`UPDATE payments SET status = 'settled', payment_date = '2026-09-04' WHERE id = $1`, [payment]);
    expect((await getBankTxn(txn)).match_status).toBe('matched_payment');
    expect((await getPayment(payment)).status).toBe('settled');
  });

  it('T-202 · debit arrives before the scheduled date: human confirms, schedule cancelled', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-20', subtotal: 1180 });
    const payment = await createPayment({
      fixture: f, amount: 1180, date: '2026-09-10', // scheduled for the 10th
      allocations: [{ invoice, amount: 1180 }], settle: false,
    });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-08', amount: -1180, // autopay pulled early
      description: 'CONED AUTOPAY', externalId: 'plaid-202',
    });
    // Possible-match: within the window, needs a human decision.
    const candidates = await pool.query(
      `SELECT * FROM v_payment_match_candidates WHERE bank_transaction_id = $1`, [txn],
    );
    expect(candidates.rows).toHaveLength(1);
    // Confirming replaces the schedule with the actual cash date.
    await pool.query(`UPDATE payments SET payment_date = '2026-09-08' WHERE id = $1`, [payment]);
    await pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payment]);
    await pool.query(`UPDATE payments SET status = 'settled' WHERE id = $1`, [payment]);
    const p = await getPayment(payment);
    expect(p.status).toBe('settled');
    expect(p.payment_date.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect((await cashByMonth(f.org)).get('2026-09-01')).toBe(1180);
  });

  it('T-203 · one debit vs two same-amount payments: ambiguous, held for a human', async () => {
    const f = await createOrg();
    const invA = await createInvoice({ fixture: f, invoiceDate: '2026-08-14', subtotal: 460 });
    const invB = await createInvoice({ fixture: f, invoiceDate: '2026-08-15', subtotal: 460 });
    await createPayment({ fixture: f, amount: 460, date: '2026-09-02', allocations: [{ invoice: invA, amount: 460 }], settle: false });
    await createPayment({ fixture: f, amount: 460, date: '2026-09-03', allocations: [{ invoice: invB, amount: 460 }], settle: false });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-03', amount: -460,
      description: 'ACH LINEN SERVICE', externalId: 'plaid-203',
    });
    const candidates = await pool.query(
      `SELECT DISTINCT candidate_count FROM v_payment_match_candidates WHERE bank_transaction_id = $1`, [txn],
    );
    expect(Number(candidates.rows[0].candidate_count)).toBe(2); // ambiguous → no auto-match
    const matches = await pool.query(
      `SELECT 1 FROM payment_matches WHERE bank_transaction_id = $1`, [txn],
    );
    expect(matches.rowCount).toBe(0);
  });

  it('T-204 · one bank txn cannot settle two payments: UNIQUE(bank_transaction_id)', async () => {
    const f = await createOrg();
    const invA = await createInvoice({ fixture: f, invoiceDate: '2026-08-14', subtotal: 700 });
    const invB = await createInvoice({ fixture: f, invoiceDate: '2026-08-15', subtotal: 700 });
    const payA = await createPayment({ fixture: f, amount: 700, date: '2026-09-02', allocations: [{ invoice: invA, amount: 700 }], settle: false });
    const payB = await createPayment({ fixture: f, amount: 700, date: '2026-09-02', allocations: [{ invoice: invB, amount: 700 }], settle: false });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-02', amount: -700,
      description: 'ACH SUPPLIER', externalId: 'plaid-204',
    });
    await pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payA]);
    await expectReject(
      pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payB]),
      /duplicate key value|cannot evidence/,
    );
  });

  it('T-205 · POS card batch exact match (T+2): matched, books nothing', async () => {
    const f = await createOrg();
    await createPosDay(f, '2026-08-14', 2874.4);
    const deposit = await createDeposit(f, { expected: 3120.5, from: '2026-08-14', to: '2026-08-14', on: '2026-08-16' });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-08-16', amount: 3120.5,
      description: 'TOAST DEPOSIT 0814', externalId: 'plaid-205',
    });
    const plBefore = await plByMonth(f.org);
    await pool.query(`UPDATE pos_deposits SET bank_transaction_id = $1 WHERE id = $2`, [txn, deposit]);
    const d = (await pool.query(`SELECT * FROM pos_deposits WHERE id = $1`, [deposit])).rows[0];
    expect(d.status).toBe('matched');
    expect(Number(d.actual_amount)).toBe(3120.5);
    expect(Number(d.variance_amount)).toBe(0);
    expect((await getBankTxn(txn)).match_status).toBe('matched_deposit');
    expect(await plByMonth(f.org)).toEqual(plBefore); // books nothing
  });

  it('T-206 · POS batch short $482: variance exception raised, sales untouched', async () => {
    const f = await createOrg();
    const sale = await createPosDay(f, '2026-08-15', 3700);
    const deposit = await createDeposit(f, { expected: 4000, from: '2026-08-15', to: '2026-08-15', on: '2026-08-17' });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-08-17', amount: 3518,
      description: 'TOAST DEPOSIT 0815', externalId: 'plaid-206',
    });
    const saleBefore = (await pool.query(`SELECT * FROM pos_sales WHERE id = $1`, [sale])).rows[0];
    await pool.query(`UPDATE pos_deposits SET bank_transaction_id = $1 WHERE id = $2`, [txn, deposit]);
    const d = (await pool.query(`SELECT * FROM pos_deposits WHERE id = $1`, [deposit])).rows[0];
    expect(d.status).toBe('variance');
    expect(Number(d.variance_amount)).toBe(-482);
    const insight = await pool.query(
      `SELECT * FROM ai_insights WHERE organization_id = $1 AND kind = 'deposit_variance' AND subject_id = $2`,
      [f.org, deposit],
    );
    expect(insight.rowCount).toBe(1); // exception-class alert with evidence
    expect(insight.rows[0].evidence.variance).toBe(-482);
    const saleAfter = (await pool.query(`SELECT * FROM pos_sales WHERE id = $1`, [sale])).rows[0];
    expect(saleAfter).toEqual(saleBefore); // sales rows never touched
  });

  it('T-207 · cash deposit missing past window → marked missing + escalation', async () => {
    const f = await createOrg();
    const deposit = await createDeposit(f, {
      expected: 1900, from: '2026-08-10', to: '2026-08-10', on: '2026-08-12', type: 'cash_deposit',
    });
    const n = await pool.query(`SELECT mark_missing_deposits($1, '2026-08-18'::date) AS n`, [f.org]);
    expect(Number(n.rows[0].n)).toBe(1);
    expect((await pool.query(`SELECT status FROM pos_deposits WHERE id = $1`, [deposit])).rows[0].status).toBe('missing');
    const notifs = await pool.query(
      `SELECT DISTINCT user_id FROM notifications WHERE organization_id = $1 AND subject_id = $2`,
      [f.org, deposit],
    );
    const notified = notifs.rows.map((r) => r.user_id).sort();
    expect(notified).toEqual([f.users.owner, f.users.controller].sort()); // owners + controllers escalated
  });

  it('T-208 · internal transfer pairing: both legs excluded, unmatched to anything else', async () => {
    const f = await createOrg();
    const account2 = (
      await pool.query(
        `INSERT INTO bank_accounts (organization_id, institution_name, account_name, account_mask, account_type, currency, status)
         VALUES ($1, 'Chase', 'Savings', '9922', 'savings', 'USD', 'active') RETURNING id`,
        [f.org],
      )
    ).rows[0].id;
    const legOut = await insertBankTxn({
      account: f.account, posted: '2026-08-20', amount: -15000,
      description: 'ONLINE TRANSFER TO SAVINGS 9922', externalId: 'plaid-208a',
    });
    const legIn = await insertBankTxn({
      account: account2, posted: '2026-08-20', amount: 15000,
      description: 'ONLINE TRANSFER FROM CHECKING 4321', externalId: 'plaid-208b',
    });
    await pool.query(`UPDATE bank_transactions SET match_status = 'excluded' WHERE id = ANY($1)`, [[legOut, legIn]]);

    // Excluded from spend: direct P&L ignores them.
    expect((await plByMonth(f.org)).size).toBe(0);

    // Legs can no longer evidence anything else.
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 15000 });
    const payment = await createPayment({
      fixture: f, amount: 15000, date: '2026-08-20',
      approvers: [f.users.owner], // above the owner threshold
      allocations: [{ invoice, amount: 15000 }], settle: false,
    });
    await expectReject(
      pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [legOut, payment]),
      /excluded and cannot evidence/,
    );
  });

  it('T-209 · CSV re-import of a synced transfer leg → dedupe_hash blocks the duplicate', async () => {
    const f = await createOrg();
    await insertBankTxn({
      account: f.account, posted: '2026-08-20', amount: -15000,
      description: 'ONLINE  TRANSFER   TO SAVINGS', externalId: 'plaid-209',
    });
    // CSV path: no external id, same content with different whitespace/case —
    // the shared canonical hash (T-209 fix) still catches it.
    await expectReject(
      insertBankTxn({
        account: f.account, posted: '2026-08-20', amount: -15000,
        description: 'online transfer to savings',
      }),
      /duplicate bank transaction/,
    );
  });

  it('T-210 · matched bank txn with a direct category → category cleared on match', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 2200 });
    const payment = await createPayment({
      fixture: f, amount: 2200, date: '2026-09-01',
      allocations: [{ invoice, amount: 2200 }], settle: false,
    });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-01', amount: -2200,
      description: 'ACH VENDOR PAYMENT', externalId: 'plaid-210',
      category: f.catFood, // direct category — would double-count if kept
    });
    // While unmatched + categorized it IS a direct P&L row…
    expect((await plByMonth(f.org)).get('2026-09-01')).toBe(2200);
    await pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payment]);
    const t = await getBankTxn(txn);
    expect(t.category_id).toBeNull();
    expect(t.match_status).toBe('matched_payment');
    // …and after matching the invoice is the only expense: no September row.
    const pl = await plByMonth(f.org);
    expect(pl.get('2026-08-01')).toBe(2200);
    expect(pl.get('2026-09-01') ?? 0).toBe(0);
  });

  it('T-211 · unmatch: both sides return to pools, audited, P&L unchanged', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-12', subtotal: 980 });
    const payment = await createPayment({
      fixture: f, amount: 980, date: '2026-09-02',
      allocations: [{ invoice, amount: 980 }],
    });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-02', amount: -980,
      description: 'ACH VENDOR', externalId: 'plaid-211',
    });
    await pool.query(`UPDATE payment_matches SET bank_transaction_id = $1 WHERE payment_id = $2`, [txn, payment]);
    const plBefore = await plByMonth(f.org);

    await pool.query(`UPDATE payment_matches SET bank_transaction_id = NULL WHERE payment_id = $1`, [payment]);
    expect((await getBankTxn(txn)).match_status).toBe('unmatched'); // back to the pool
    expect(await plByMonth(f.org)).toEqual(plBefore); // P&L unchanged
    const audit = await pool.query(
      `SELECT 1 FROM audit_logs WHERE organization_id = $1 AND action = 'payment_matches.update'`,
      [f.org],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('T-212 · deposit matched across the month boundary: AUG revenue unchanged, SEP cash-in only', async () => {
    const f = await createOrg();
    await createPosDay(f, '2026-08-31', 4100);
    const deposit = await createDeposit(f, { expected: 4463.88, from: '2026-08-31', to: '2026-08-31', on: '2026-09-02' });
    const txn = await insertBankTxn({
      account: f.account, posted: '2026-09-02', amount: 4463.88,
      description: 'TOAST DEPOSIT 0831', externalId: 'plaid-212',
    });
    await pool.query(`UPDATE pos_deposits SET bank_transaction_id = $1 WHERE id = $2`, [txn, deposit]);
    const sales = await pool.query(
      `SELECT sum(net_sales)::numeric AS net FROM pos_sales
        WHERE organization_id = $1 AND business_date BETWEEN '2026-08-01' AND '2026-08-31'`,
      [f.org],
    );
    expect(Number(sales.rows[0].net)).toBe(4100); // August revenue untouched
    const cashIn = await cashByMonth(f.org, 'in');
    expect(cashIn.get('2026-09-01')).toBe(4463.88); // September cash-in only
    expect(cashIn.get('2026-08-01') ?? 0).toBe(0);
  });
});
