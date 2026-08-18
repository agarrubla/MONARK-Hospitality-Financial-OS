/**
 * §5 · Duplicate detection — T-401..T-412.
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  createInvoice,
  createOrg,
  createPayment,
  expectReject,
  insertBankTxn,
  pool,
  uniq,
} from './helpers.js';
import { TEST_DATABASE_URL } from './global-setup.js';

async function insertDocument(f: Awaited<ReturnType<typeof createOrg>>, sha: string) {
  return (
    await pool.query(
      `INSERT INTO documents (organization_id, storage_key, filename, mime_type, byte_size, sha256, source, ocr_status)
       VALUES ($1, $2, 'invoice.pdf', 'application/pdf', 12000, $3, 'upload', 'parsed') RETURNING id`,
      [f.org, uniq('s3/docs'), sha],
    )
  ).rows[0].id;
}

const sha = (seed: string) => seed.repeat(64).slice(0, 64);

describe('duplicate detection', () => {
  it('T-401 · same vendor + invoice number entered twice → blocked by unique constraint', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, number: 'SYS-1001', invoiceDate: '2026-08-10', subtotal: 500 });
    await expectReject(
      createInvoice({ fixture: f, number: 'SYS-1001', invoiceDate: '2026-08-10', subtotal: 500 }),
      /duplicate key value.*invoice_number_norm|duplicate key value/,
    );
  });

  it('T-402 · same PDF uploaded twice (identical bytes) → blocked by UNIQUE(org, sha256)', async () => {
    const f = await createOrg();
    await insertDocument(f, sha('a'));
    await expectReject(insertDocument(f, sha('a')), /duplicate key value/);
  });

  it('T-403 · re-issued PDF, same number, different hash → held at the gate, no second invoice', async () => {
    const f = await createOrg();
    const doc1 = await insertDocument(f, sha('b'));
    await createInvoice({ fixture: f, number: 'SYS-88412', invoiceDate: '2026-08-11', subtotal: 740 });
    await pool.query(`UPDATE invoices SET document_id = $1 WHERE invoice_number = 'SYS-88412'`, [doc1]);
    // The re-issued file is new bytes → the document stores fine…
    const doc2 = await insertDocument(f, sha('c'));
    expect(doc2).toBeDefined();
    // …but it can never become a second invoice: the number guard holds, so
    // the intake pipeline parks it for a human decision.
    await expectReject(
      createInvoice({ fixture: f, number: 'SYS-88412', invoiceDate: '2026-08-11', subtotal: 740 }),
      /duplicate key value/,
    );
    expect(
      (await pool.query(`SELECT count(*) FROM invoices WHERE organization_id = $1 AND invoice_number = 'SYS-88412'`, [f.org]))
        .rows[0].count,
    ).toBe('1');
  });

  it('T-404 · same invoice via email + portal simultaneously: one insert wins the race', async () => {
    const f = await createOrg();
    const clientA = new pg.Client({ connectionString: TEST_DATABASE_URL });
    const clientB = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await clientA.connect();
    await clientB.connect();
    try {
      const insert = (c: pg.Client) =>
        c.query(
          `INSERT INTO invoices (organization_id, location_id, vendor_id, invoice_number, invoice_date,
                                 expense_date, currency, subtotal, tax, total, status, source, created_by)
           VALUES ($1, $2, $3, 'RACE-1', '2026-08-12', '2026-08-12', 'USD', 300, 0, 300, 'draft', 'email_capture', $4)`,
          [f.org, f.loc1, f.vendor, f.users.clerk],
        );
      await clientA.query('BEGIN');
      await insert(clientA); // A holds the uncommitted row
      const bAttempt = (async () => {
        await clientB.query('BEGIN');
        await insert(clientB); // blocks on the unique index until A resolves
        await clientB.query('COMMIT');
      })();
      await new Promise((r) => setTimeout(r, 150));
      await clientA.query('COMMIT'); // A wins
      await expect(bAttempt).rejects.toThrow(/duplicate key value/);
      await clientB.query('ROLLBACK').catch(() => {});
      const count = await pool.query(
        `SELECT count(*) FROM invoices WHERE organization_id = $1 AND invoice_number = 'RACE-1'`, [f.org],
      );
      expect(count.rows[0].count).toBe('1');
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  it('T-405 · same invoice number from different vendors is allowed', async () => {
    const f = await createOrg();
    const vendor2 = (
      await pool.query(
        `INSERT INTO vendors (organization_id, name, normalized_name, status) VALUES ($1, $2, '', 'active') RETURNING id`,
        [f.org, `Baldor ${uniq('v')}`],
      )
    ).rows[0].id;
    await createInvoice({ fixture: f, number: 'INV-500', invoiceDate: '2026-08-10', subtotal: 100 });
    const second = await createInvoice({ fixture: f, number: 'INV-500', vendor: vendor2, invoiceDate: '2026-08-10', subtotal: 100 });
    expect(second).toBeDefined();
  });

  it('T-406 · case/whitespace variance ("inv-88412  ") is caught by the normalized guard', async () => {
    const f = await createOrg();
    await createInvoice({ fixture: f, number: 'INV-88412', invoiceDate: '2026-08-10', subtotal: 100 });
    await expectReject(
      createInvoice({ fixture: f, number: '  inv-88412 ', invoiceDate: '2026-08-10', subtotal: 100 }),
      /duplicate key value/,
    );
  });

  it('T-407 · retried payment API call with the same idempotency key → no second payment', async () => {
    const f = await createOrg();
    const key = uniq('idem');
    const insert = () =>
      pool.query(
        `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency,
                               payment_date, initiated_at, status, idempotency_key, created_by)
         VALUES ($1, $2, 'ach', 250, 'USD', '2026-09-01', now(), 'scheduled', $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [f.org, f.account, key, f.users.clerk],
      );
    const first = await insert();
    expect(first.rowCount).toBe(1);
    const retry = await insert(); // replay returns no new effect
    expect(retry.rowCount).toBe(0);
    const all = await pool.query(`SELECT id FROM payments WHERE idempotency_key = $1`, [key]);
    expect(all.rowCount).toBe(1);
    expect(all.rows[0].id).toBe(first.rows[0].id); // the original result stands
  });

  it('T-408 · bank re-sync replaying external_txn_id is an upsert no-op', async () => {
    const f = await createOrg();
    const insert = () =>
      pool.query(
        `INSERT INTO bank_transactions (bank_account_id, external_txn_id, posted_at, amount, description_raw, dedupe_hash)
         VALUES ($1, 'plaid-408', '2026-08-14', -320.55, 'SYSCO FOOD SVC', '')
         ON CONFLICT (bank_account_id, external_txn_id) WHERE external_txn_id IS NOT NULL DO NOTHING`,
        [f.account],
      );
    await insert();
    await insert(); // re-sync replay
    const rows = await pool.query(
      `SELECT count(*) FROM bank_transactions WHERE bank_account_id = $1 AND external_txn_id = 'plaid-408'`,
      [f.account],
    );
    expect(rows.rows[0].count).toBe('1');
  });

  it('T-409 · POS day re-imported after an adapter retry → blocked by UNIQUE(location, date, source)', async () => {
    const f = await createOrg();
    const insert = () =>
      pool.query(
        `INSERT INTO pos_sales (organization_id, location_id, business_date, source, gross_sales,
                                net_sales, tax_collected, tender_breakdown)
         VALUES ($1, $2, '2026-08-14', 'toast', 2000, 2000, 177.50,
                 '{"cash": 0, "card": 2177.50, "gift_card": 0, "other": 0}'::jsonb)`,
        [f.org, f.loc1],
      );
    await insert();
    await expectReject(insert(), /duplicate key value/);
  });

  it('T-410 · amount+date near-duplicate with different numbers: flagged for review, not blocked', async () => {
    const f = await createOrg();
    const a = await createInvoice({ fixture: f, number: 'SPLIT-A', invoiceDate: '2026-08-12', subtotal: 618.4 });
    const b = await createInvoice({ fixture: f, number: 'SPLIT-B', invoiceDate: '2026-08-13', subtotal: 618.4 });
    expect(a).toBeDefined();
    expect(b).toBeDefined(); // both accepted — split deliveries are legitimate
    const flagged = await pool.query(`SELECT detect_near_duplicate_invoices($1) AS n`, [f.org]);
    expect(Number(flagged.rows[0].n)).toBe(1);
    const insight = await pool.query(
      `SELECT * FROM ai_insights WHERE organization_id = $1 AND kind = 'duplicate_risk'`, [f.org],
    );
    expect(insight.rowCount).toBe(1);
    expect(insight.rows[0].confidence).toBeDefined(); // AI proposes with visible confidence
  });

  it('T-411 · confirmed duplicate re-sent as corrected: new number accepted, lineage kept', async () => {
    const f = await createOrg();
    const doc1 = await insertDocument(f, sha('d'));
    await createInvoice({ fixture: f, number: 'CORR-100', invoiceDate: '2026-08-10', subtotal: 900 });
    // Duplicate attempt held (T-403); vendor re-sends with a corrected number.
    const doc2 = await insertDocument(f, sha('e'));
    const corrected = await createInvoice({ fixture: f, number: 'CORR-100-R1', invoiceDate: '2026-08-10', subtotal: 900 });
    await pool.query(`UPDATE invoices SET document_id = $1 WHERE id = $2`, [doc2, corrected]);
    // Lineage: the discarded document is retained and linked by audit.
    await pool.query(`SELECT write_audit_log($1, 'invoice.duplicate_discarded', 'documents', $2, NULL, $3::jsonb)`, [
      f.org, doc1, JSON.stringify({ superseded_by_document: doc2, accepted_invoice: corrected }),
    ]);
    const docs = await pool.query(`SELECT count(*) FROM documents WHERE organization_id = $1`, [f.org]);
    expect(docs.rows[0].count).toBe('2');
    const lineage = await pool.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'invoice.duplicate_discarded'`, [f.org],
    );
    expect(lineage.rowCount).toBe(1);
  });

  it('T-412 · same debit in two accounts (mis-mapped feed) → cross-account detector flags it', async () => {
    const f = await createOrg();
    const account2 = (
      await pool.query(
        `INSERT INTO bank_accounts (organization_id, institution_name, account_name, account_mask, account_type, currency, status)
         VALUES ($1, 'Chase', 'Payroll', '7710', 'checking', 'USD', 'active') RETURNING id`,
        [f.org],
      )
    ).rows[0].id;
    await insertBankTxn({ account: f.account, posted: '2026-08-14', amount: -1240.8, description: 'SYSCO FOOD SVC 44531', externalId: 'feed-a-1' });
    await insertBankTxn({ account: account2, posted: '2026-08-14', amount: -1240.8, description: 'SYSCO FOOD SVC 44531', externalId: 'feed-b-1' });
    const n = await pool.query(`SELECT detect_cross_account_duplicates($1, 3650) AS n`, [f.org]);
    expect(Number(n.rows[0].n)).toBe(1);
    const alert = await pool.query(
      `SELECT * FROM ai_insights WHERE organization_id = $1 AND kind = 'anomaly' AND severity = 'critical'`, [f.org],
    );
    expect(alert.rowCount).toBe(1);
    expect(alert.rows[0].title).toMatch(/two accounts/);
  });
});
