-- 020 · Reporting views.
-- security_invoker: views execute under the CALLER's RLS context, so a
-- single-location GM's "consolidated" P&L equals their own location (T-306,
-- F-01) — rollups are computed over granted locations only, never masked
-- aggregates of others.
--
-- P&L sums strictly by expense_month; cash flow strictly by payment_month.
-- A bank transaction only reaches the P&L while it is UNMATCHED and directly
-- categorized (a real bank-only expense, e.g. a bank fee): it then hits P&L
-- and cash on the same date, once. The moment it is matched to a payment its
-- category is cleared by trigger and the invoice/payment pair is the truth.

CREATE VIEW v_pl_by_month WITH (security_invoker = true) AS
SELECT i.organization_id,
       coalesce(li.location_id, i.location_id) AS location_id,
       i.expense_month,
       li.expense_category_id,
       'invoice'::text AS source,
       sum(li.amount) AS expense_amount
  FROM invoice_line_items li
  JOIN invoices i ON i.id = li.invoice_id
 WHERE i.status NOT IN ('draft', 'pending_approval', 'void')
 GROUP BY 1, 2, 3, 4
UNION ALL
SELECT ba.organization_id,
       ba.location_id,
       date_trunc('month', bt.posted_at::timestamp)::date,
       bt.category_id,
       'bank_direct'::text,
       sum(-bt.amount)
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
 WHERE bt.match_status = 'unmatched'
   AND bt.category_id IS NOT NULL
   AND bt.amount < 0
 GROUP BY 1, 2, 3, 4;

CREATE VIEW v_cash_flow_by_month WITH (security_invoker = true) AS
SELECT p.organization_id,
       p.payment_month AS cash_month,
       'out'::text AS direction,
       'payment'::text AS source,
       p.id AS source_id,
       p.amount
  FROM payments p
 WHERE p.status = 'settled'
UNION ALL
SELECT ba.organization_id,
       date_trunc('month', bt.posted_at::timestamp)::date,
       'out'::text,
       'bank_direct'::text,
       bt.id,
       -bt.amount
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
 WHERE bt.match_status = 'unmatched'
   AND bt.category_id IS NOT NULL
   AND bt.amount < 0
UNION ALL
SELECT ba.organization_id,
       date_trunc('month', bt.posted_at::timestamp)::date,
       'in'::text,
       'deposit'::text,
       bt.id,
       bt.amount
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
 WHERE bt.match_status = 'matched_deposit';

GRANT SELECT ON v_pl_by_month, v_cash_flow_by_month, v_payment_match_candidates
  TO monark_app, monark_ai;
