-- 016 · Detectors & matching candidates.
-- The AI/detector layer PROPOSES (ai_insights with evidence + confidence);
-- it never approves, pays, or writes financial records.

-- Candidate payments for an unmatched bank debit: exact amount, date window.
-- More than one candidate = ambiguous → held for a human (T-203); exactly one
-- with tight signals = auto-matchable (T-201). The engine reads this view.
CREATE OR REPLACE VIEW v_payment_match_candidates AS
SELECT bt.id AS bank_transaction_id,
       p.id AS payment_id,
       ba.organization_id,
       bt.posted_at,
       p.payment_date,
       -bt.amount AS debit_amount,
       abs(bt.posted_at - p.payment_date) AS date_distance_days,
       (bt.external_txn_id IS NOT NULL AND p.external_ref IS NOT NULL
        AND position(p.external_ref IN bt.description_raw) > 0) AS reference_hit,
       count(*) OVER (PARTITION BY bt.id) AS candidate_count
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
  JOIN payments p
    ON p.organization_id = ba.organization_id
   AND p.amount = -bt.amount
   AND p.status IN ('scheduled', 'pending_approval', 'processing', 'settled')
   AND abs(bt.posted_at - p.payment_date) <= 5
   AND NOT EXISTS (SELECT 1 FROM payment_matches pm
                    WHERE pm.payment_id = p.id AND pm.bank_transaction_id IS NOT NULL)
 WHERE bt.match_status = 'unmatched'
   AND bt.amount < 0;

-- T-410: amount+date near-duplicates with DIFFERENT numbers are flagged for
-- review, never blocked (split deliveries are legitimate).
CREATE OR REPLACE FUNCTION detect_near_duplicate_invoices(p_org uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT a.id AS a_id, b.id AS b_id, a.vendor_id, a.total, a.invoice_date
      FROM invoices a
      JOIN invoices b
        ON b.organization_id = a.organization_id
       AND b.vendor_id = a.vendor_id
       AND b.total = a.total
       AND b.id > a.id
       AND abs(b.invoice_date - a.invoice_date) <= 3
       AND b.invoice_number_norm <> a.invoice_number_norm
     WHERE a.organization_id = p_org
       AND a.status <> 'void' AND b.status <> 'void'
       AND NOT EXISTS (
         SELECT 1 FROM ai_insights i
          WHERE i.kind = 'duplicate_risk' AND i.subject_id = b.id
            AND i.evidence ->> 'paired_invoice_id' = a.id::text)
  LOOP
    INSERT INTO ai_insights (organization_id, kind, subject_type, subject_id, title, body,
                             confidence, severity, evidence, model_version)
    VALUES (p_org, 'duplicate_risk', 'invoices', r.b_id,
            'Possible duplicate invoice',
            format('Two invoices from the same vendor for %s within 3 days carry different numbers. Review before paying both.', r.total),
            0.72, 'warning',
            jsonb_build_object('paired_invoice_id', r.a_id, 'invoice_id', r.b_id,
                               'vendor_id', r.vendor_id, 'total', r.total),
            'detector-v1');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- T-412 compensating detector: the same debit appearing in two accounts
-- (mis-mapped feed) raises an exception-class alert nightly; the structural
-- fix (feed identity verification at connection time) is gated before GA.
CREATE OR REPLACE FUNCTION detect_cross_account_duplicates(p_org uuid, p_window_days integer DEFAULT 7)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT a.id AS a_id, b.id AS b_id, a.amount, a.posted_at
      FROM bank_transactions a
      JOIN bank_accounts aa ON aa.id = a.bank_account_id
      JOIN bank_transactions b
        ON b.amount = a.amount
       AND b.posted_at = a.posted_at
       AND canonical_text(b.description_raw) = canonical_text(a.description_raw)
       AND b.bank_account_id <> a.bank_account_id
       AND b.id > a.id
      JOIN bank_accounts bb ON bb.id = b.bank_account_id AND bb.organization_id = aa.organization_id
     WHERE aa.organization_id = p_org
       AND a.posted_at >= current_date - p_window_days
       AND NOT EXISTS (
         SELECT 1 FROM ai_insights i
          WHERE i.kind = 'anomaly' AND i.subject_id = b.id
            AND i.evidence ->> 'paired_transaction_id' = a.id::text)
  LOOP
    INSERT INTO ai_insights (organization_id, kind, subject_type, subject_id, title, body,
                             confidence, severity, evidence, model_version)
    VALUES (p_org, 'anomaly', 'bank_transactions', r.b_id,
            'Same debit present in two accounts',
            format('A %s transaction on %s appears in two different accounts — possible mis-mapped feed.', r.amount, r.posted_at),
            0.85, 'critical',
            jsonb_build_object('paired_transaction_id', r.a_id, 'transaction_id', r.b_id,
                               'amount', r.amount, 'posted_at', r.posted_at),
            'detector-v1');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- T-207: deposits past their window are marked missing and escalated to the
-- org's owners/controllers.
CREATE OR REPLACE FUNCTION mark_missing_deposits(p_org uuid, p_as_of date, p_grace_days integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n integer := 0;
  d record;
BEGIN
  FOR d IN
    SELECT * FROM pos_deposits
     WHERE organization_id = p_org
       AND status = 'expected'
       AND expected_on + p_grace_days < p_as_of
  LOOP
    UPDATE pos_deposits SET status = 'missing' WHERE id = d.id;
    INSERT INTO notifications (user_id, organization_id, kind, subject_type, subject_id, title, body, channels)
    SELECT uor.user_id, p_org, 'deposit_variance', 'pos_deposits', d.id,
           'Expected deposit missing',
           format('A %s deposit of %s expected on %s has not arrived.', d.deposit_type, d.expected_amount, d.expected_on),
           '["in_app"]'::jsonb
      FROM user_org_roles uor
      JOIN roles r ON r.id = uor.role_id
     WHERE uor.organization_id = p_org AND uor.status = 'active'
       AND r.key IN ('owner', 'controller');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
