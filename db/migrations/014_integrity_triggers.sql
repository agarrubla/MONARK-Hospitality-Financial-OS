-- 014 · Financial-integrity triggers.
-- Everything here enforces "one transaction = one financial event" at the
-- database, not the application: duplicate guards, allocation invariants,
-- approval gates, separation of duties, immutability, and audit coverage.
--
-- Convention: maintenance writes (amount_paid, payment_date backfill, bank-txn
-- category clearing…) are performed by triggers, so inside them
-- pg_trigger_depth() > 1. Top-level statements (depth 1 in a BEFORE trigger)
-- may not touch those columns.

-- ============================================================================
-- Access helpers (SECURITY DEFINER: they read access tables regardless of the
-- caller's RLS so policies and triggers can use them without recursion).
-- ============================================================================

CREATE OR REPLACE FUNCTION user_has_role_key(p_user uuid, p_org uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_org_roles uor
      JOIN roles r ON r.id = uor.role_id
     WHERE uor.user_id = p_user
       AND uor.organization_id = p_org
       AND uor.status = 'active'
       AND r.key = p_key)
$$;

CREATE OR REPLACE FUNCTION user_has_role_id(p_user uuid, p_org uuid, p_role uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_org_roles uor
     WHERE uor.user_id = p_user
       AND uor.organization_id = p_org
       AND uor.status = 'active'
       AND uor.role_id = p_role)
$$;

CREATE OR REPLACE FUNCTION user_has_permission(p_user uuid, p_org uuid, p_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_org_roles uor
      JOIN role_permissions rp ON rp.role_id = uor.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE uor.user_id = p_user
       AND uor.organization_id = p_org
       AND uor.status = 'active'
       AND p.key = p_perm)
$$;

CREATE OR REPLACE FUNCTION user_has_location_access(p_user uuid, p_org uuid, p_loc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_org_roles uor
     WHERE uor.user_id = p_user
       AND uor.organization_id = p_org
       AND uor.status = 'active'
       AND (uor.location_scope = 'all'
            OR EXISTS (SELECT 1 FROM user_location_access ula
                        WHERE ula.user_org_role_id = uor.id
                          AND ula.location_id = p_loc)))
$$;

CREATE OR REPLACE FUNCTION app_has_permission(p_perm text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_current_user() IS NULL THEN true -- system/service context
    ELSE user_has_permission(app_current_user(), app_current_org(), p_perm)
  END
$$;

CREATE OR REPLACE FUNCTION app_has_location_access(p_loc uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_loc IS NULL THEN true
    WHEN app_current_user() IS NULL THEN true -- system/service context
    ELSE user_has_location_access(app_current_user(), app_current_org(), p_loc)
  END
$$;

-- Owner-approval threshold, frozen per-org in settings (default $10,000 —
-- the ">$10K requires owner" tier of the Approval Workflow spec).
CREATE OR REPLACE FUNCTION org_owner_threshold(p_org uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce((settings #>> '{approval_thresholds,owner}')::numeric, 10000)
    FROM organizations WHERE id = p_org
$$;

-- ============================================================================
-- Invoices: the accrual event.
-- ============================================================================

CREATE OR REPLACE FUNCTION invoices_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'invoices must be created in draft status (got %)', NEW.status;
  END IF;
  IF NEW.amount_paid <> 0 OR NEW.payment_date IS NOT NULL THEN
    RAISE EXCEPTION 'amount_paid/payment_date are maintained by payment matching, never written directly';
  END IF;
  -- Spec defaults: expense_date = coalesce(service_date, invoice_date);
  -- due_date = invoice_date + vendor payment terms.
  IF NEW.expense_date IS NULL THEN
    NEW.expense_date := coalesce(NEW.service_date, NEW.invoice_date);
  END IF;
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.invoice_date
      + coalesce((SELECT payment_terms_days FROM vendors WHERE id = NEW.vendor_id), 0);
  END IF;
  IF NOT app_has_permission('invoice.create') THEN
    RAISE EXCEPTION 'permission denied: invoice.create is required';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoices_before_insert
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_before_insert();

CREATE OR REPLACE FUNCTION invoice_approvals_satisfied(p_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM approvals
     WHERE subject_type = 'invoice' AND subject_id = p_invoice
       AND decision <> 'approved')
$$;

CREATE OR REPLACE FUNCTION invoices_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  internal boolean := pg_trigger_depth() > 1;
  line_sum numeric;
BEGIN
  -- Payment-state columns are trigger-maintained only.
  IF NOT internal AND (
       NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.payment_date IS DISTINCT FROM OLD.payment_date) THEN
    RAISE EXCEPTION 'amount_paid/payment_date are maintained by payment matching, never written directly';
  END IF;

  -- Amounts lock after approval (Security §13); corrections are reversal rows.
  IF OLD.status NOT IN ('draft', 'pending_approval')
     AND (NEW.subtotal IS DISTINCT FROM OLD.subtotal
          OR NEW.tax IS DISTINCT FROM OLD.tax
          OR NEW.total IS DISTINCT FROM OLD.total) THEN
    RAISE EXCEPTION 'invoice amounts are locked after approval; correct via a reversal invoice';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Status machine.
  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'void is terminal for invoices';
  END IF;
  IF NEW.status = 'void' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'a paid invoice cannot be voided; issue a reversal invoice';
    END IF;
  ELSIF internal THEN
    -- Trigger-maintained payment states may move freely among post-approval states.
    IF NOT (OLD.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
            AND NEW.status IN ('approved', 'scheduled', 'partially_paid', 'paid')) THEN
      RAISE EXCEPTION 'invalid internal invoice transition % -> %', OLD.status, NEW.status;
    END IF;
  ELSE
    IF NOT ((OLD.status = 'draft' AND NEW.status IN ('pending_approval', 'approved'))
            OR (OLD.status = 'pending_approval' AND NEW.status IN ('draft', 'approved'))) THEN
      RAISE EXCEPTION 'invalid invoice transition % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- Leaving draft: line items must reconcile to the header (spec §6.4).
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'void') THEN
    SELECT coalesce(sum(amount), 0) INTO line_sum
      FROM invoice_line_items WHERE invoice_id = NEW.id;
    IF line_sum <> NEW.subtotal THEN
      RAISE EXCEPTION 'line items (%) must sum to subtotal (%) before the invoice can leave draft',
        line_sum, NEW.subtotal;
    END IF;
  END IF;

  -- Entering approved: the approval chain, if one exists, must be satisfied.
  IF NEW.status = 'approved' AND OLD.status IN ('draft', 'pending_approval')
     AND NOT invoice_approvals_satisfied(NEW.id) THEN
    RAISE EXCEPTION 'invoice approval chain is not satisfied';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoices_before_update
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_before_update();

-- T-106 fix: voiding an invoice cancels its dependent scheduled payments in
-- the same transaction (both audit rows come from the row-change triggers).
CREATE OR REPLACE FUNCTION invoices_after_void() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE payments p
     SET status = 'voided'
   WHERE p.status IN ('scheduled', 'pending_approval')
     AND p.id IN (SELECT payment_id FROM payment_matches WHERE invoice_id = NEW.id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_invoices_after_void
  AFTER UPDATE OF status ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void')
  EXECUTE FUNCTION invoices_after_void();

-- ============================================================================
-- Invoice line items: category truth lives here; frozen once the invoice
-- leaves draft (location/category reassignment stays possible, audited).
-- ============================================================================

CREATE OR REPLACE FUNCTION invoice_line_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inv invoices%ROWTYPE;
  internal boolean := pg_trigger_depth() > 1;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id);
  IF internal THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'DELETE') AND inv.status <> 'draft' THEN
    RAISE EXCEPTION 'line items can only be added or removed while the invoice is draft';
  END IF;
  IF TG_OP = 'UPDATE' AND inv.status <> 'draft' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.line_no IS DISTINCT FROM OLD.line_no
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
      RAISE EXCEPTION 'line amounts are locked after the invoice leaves draft; correct via a reversal invoice';
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER trg_invoice_line_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION invoice_line_items_guard();

-- ============================================================================
-- Approvals: the human gate. Separation of duties and decision-time
-- eligibility are data-enforced (Security §2, findings F-02).
-- ============================================================================

CREATE OR REPLACE FUNCTION approval_subject_org(p_type approval_subject_type, p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE p_type
    WHEN 'invoice' THEN (SELECT organization_id FROM invoices WHERE id = p_id)
    WHEN 'payment' THEN (SELECT organization_id FROM payments WHERE id = p_id)
    WHEN 'rule_change' THEN (SELECT organization_id FROM bank_transaction_rules WHERE id = p_id)
    WHEN 'budget' THEN (SELECT organization_id FROM budgets WHERE id = p_id)
    WHEN 'period_lock' THEN (SELECT organization_id FROM financial_periods WHERE id = p_id)
  END
$$;

CREATE OR REPLACE FUNCTION approval_subject_creator(p_type approval_subject_type, p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE p_type
    WHEN 'invoice' THEN (SELECT created_by FROM invoices WHERE id = p_id)
    WHEN 'payment' THEN (SELECT created_by FROM payments WHERE id = p_id)
    ELSE NULL
  END
$$;

-- Returns NULL when eligible, otherwise the reason the decision must be blocked.
CREATE OR REPLACE FUNCTION approval_block_reason(a approvals)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_creator uuid := approval_subject_creator(a.subject_type, a.subject_id);
  v_loc uuid;
  v_perm text;
BEGIN
  IF approval_subject_org(a.subject_type, a.subject_id) IS DISTINCT FROM a.organization_id THEN
    RETURN 'approval organization does not match its subject';
  END IF;
  -- Separation of duties (T-301, T-302): the creator/initiator never approves.
  IF v_creator IS NOT NULL AND a.approver_id = v_creator THEN
    RETURN 'separation of duties: the creator of a ' || a.subject_type || ' cannot approve it';
  END IF;
  -- Decision-time eligibility (F-02, T-304): active membership, required role,
  -- and location access are re-checked now, not at chain creation.
  IF NOT EXISTS (SELECT 1 FROM user_org_roles
                  WHERE user_id = a.approver_id
                    AND organization_id = a.organization_id
                    AND status = 'active') THEN
    RETURN 'approver has no active role in this organization';
  END IF;
  IF a.required_role_id IS NOT NULL
     AND NOT user_has_role_id(a.approver_id, a.organization_id, a.required_role_id) THEN
    RETURN 'approver does not hold the role this step requires';
  END IF;
  v_perm := CASE a.subject_type
    WHEN 'invoice' THEN 'invoice.approve'
    WHEN 'payment' THEN 'payment.approve'
    ELSE NULL END;
  IF v_perm IS NOT NULL AND NOT user_has_permission(a.approver_id, a.organization_id, v_perm) THEN
    RETURN 'approver lacks permission ' || v_perm;
  END IF;
  IF a.subject_type = 'invoice' THEN
    SELECT location_id INTO v_loc FROM invoices WHERE id = a.subject_id;
    IF NOT user_has_location_access(a.approver_id, a.organization_id, v_loc) THEN
      RETURN 'approver has no access to the invoice''s location (re-checked at decision time)';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION approvals_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_creator uuid;
BEGIN
  IF approval_subject_org(NEW.subject_type, NEW.subject_id) IS NULL THEN
    RAISE EXCEPTION 'approval subject %/% does not exist', NEW.subject_type, NEW.subject_id;
  END IF;
  IF approval_subject_org(NEW.subject_type, NEW.subject_id) <> NEW.organization_id THEN
    RAISE EXCEPTION 'approval organization does not match its subject';
  END IF;
  v_creator := approval_subject_creator(NEW.subject_type, NEW.subject_id);
  IF v_creator IS NOT NULL AND NEW.approver_id = v_creator THEN
    RAISE EXCEPTION 'separation of duties: the creator of a % cannot be its approver', NEW.subject_type;
  END IF;
  IF NEW.decision <> 'pending' THEN
    RAISE EXCEPTION 'approvals are created pending; decisions happen at decision time';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_approvals_before_insert
  BEFORE INSERT ON approvals
  FOR EACH ROW EXECUTE FUNCTION approvals_before_insert();

CREATE OR REPLACE FUNCTION approvals_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.decision IS DISTINCT FROM OLD.decision THEN
    IF OLD.decision <> 'pending' THEN
      RAISE EXCEPTION 'approval decisions are final; % cannot become %', OLD.decision, NEW.decision;
    END IF;
    -- Only the assigned approver decides, acting as themselves.
    IF app_current_user() IS NOT NULL AND app_current_user() <> NEW.approver_id THEN
      RAISE EXCEPTION 'only the assigned approver can decide this step';
    END IF;
    v_reason := approval_block_reason(NEW);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION 'approval blocked: %', v_reason;
    END IF;
    NEW.decided_at := coalesce(NEW.decided_at, now());
  ELSIF OLD.decision <> 'pending'
        AND (NEW.approver_id IS DISTINCT FROM OLD.approver_id
             OR NEW.step IS DISTINCT FROM OLD.step
             OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
             OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
             OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot) THEN
    RAISE EXCEPTION 'decided approvals are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_approvals_before_update
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION approvals_before_update();

-- Decision entry point that AUDITS blocked attempts instead of losing them to
-- a rollback (T-301 "attempt audited"). Returns 'approved' / 'rejected' /
-- 'blocked: <reason>'.
CREATE OR REPLACE FUNCTION decide_approval(p_approval uuid, p_decision approval_decision, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  a approvals%ROWTYPE;
  v_reason text;
  probe approvals%ROWTYPE;
BEGIN
  SELECT * INTO a FROM approvals WHERE id = p_approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval % not found', p_approval;
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;
  IF a.decision <> 'pending' THEN
    RETURN 'blocked: approval already decided (' || a.decision || ')';
  END IF;
  IF app_current_user() IS NOT NULL AND app_current_user() <> a.approver_id THEN
    v_reason := 'only the assigned approver can decide this step';
  ELSE
    probe := a;
    probe.decision := p_decision;
    v_reason := approval_block_reason(probe);
  END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM write_audit_log(a.organization_id, 'approval.blocked', 'approvals', a.id,
      NULL, jsonb_build_object('reason', v_reason, 'attempted_decision', p_decision));
    RETURN 'blocked: ' || v_reason;
  END IF;
  UPDATE approvals
     SET decision = p_decision, decided_at = now(), note = coalesce(p_note, note)
   WHERE id = p_approval;
  PERFORM write_audit_log(a.organization_id,
    a.subject_type || '.' || CASE p_decision WHEN 'approved' THEN 'approve' ELSE 'reject' END,
    a.subject_type::text, a.subject_id,
    NULL, jsonb_build_object('approval_id', a.id, 'step', a.step, 'note', p_note));
  RETURN p_decision::text;
END $$;

-- ============================================================================
-- Payments: the cash event.
-- ============================================================================

CREATE OR REPLACE FUNCTION payment_approvals_satisfied(p payments)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  n_total int;
  n_open int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE decision <> 'approved')
    INTO n_total, n_open
    FROM approvals
   WHERE subject_type = 'payment' AND subject_id = p.id;
  IF n_total = 0 THEN
    RETURN 'all outbound payments require an approval chain';
  END IF;
  IF n_open > 0 THEN
    RETURN 'payment approval chain is not satisfied';
  END IF;
  -- Owner tier is not delegable (T-309): above the threshold, at least one
  -- approved step must have been decided by an owner-role holder.
  IF p.amount > org_owner_threshold(p.organization_id)
     AND NOT EXISTS (
       SELECT 1 FROM approvals a
        WHERE a.subject_type = 'payment' AND a.subject_id = p.id
          AND a.decision = 'approved'
          AND user_has_role_key(a.approver_id, p.organization_id, 'owner')) THEN
    RETURN 'payments above the owner threshold require an owner''s approval';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION payments_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'pending_approval') THEN
    RAISE EXCEPTION 'payments must be created scheduled or pending_approval (got %)', NEW.status;
  END IF;
  IF (SELECT organization_id FROM bank_accounts WHERE id = NEW.bank_account_id)
     IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'funding account belongs to a different organization';
  END IF;
  -- Deny-by-default at the data layer too (T-308).
  IF NOT app_has_permission('payment.initiate') THEN
    RAISE EXCEPTION 'permission denied: payment.initiate is required';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payments_before_insert
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_before_insert();

CREATE OR REPLACE FUNCTION payments_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_gate text;
  v_alloc numeric;
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'payment amount is immutable; void and re-issue instead';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'payment identity fields are immutable';
  END IF;

  IF NEW.status = OLD.status THEN
    IF OLD.status IN ('settled', 'failed', 'voided')
       AND (NEW.payment_date IS DISTINCT FROM OLD.payment_date
            OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id) THEN
      RAISE EXCEPTION 'a % payment is financially immutable', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('settled', 'failed', 'voided') THEN
    RAISE EXCEPTION '% is terminal for payments; retries are new payments', OLD.status;
  END IF;
  IF NOT ((OLD.status = 'scheduled' AND NEW.status IN ('pending_approval', 'processing', 'settled', 'failed', 'voided'))
          OR (OLD.status = 'pending_approval' AND NEW.status IN ('scheduled', 'processing', 'voided'))
          OR (OLD.status = 'processing' AND NEW.status IN ('settled', 'failed'))) THEN
    RAISE EXCEPTION 'invalid payment transition % -> %', OLD.status, NEW.status;
  END IF;

  -- The approval gate: a payment cannot move toward money-out without a
  -- satisfied chain — trigger-enforced, not application code.
  IF NEW.status IN ('processing', 'settled') AND OLD.status NOT IN ('processing') THEN
    v_gate := payment_approvals_satisfied(NEW);
    IF v_gate IS NOT NULL THEN
      RAISE EXCEPTION 'payment cannot proceed: %', v_gate;
    END IF;
  END IF;

  -- Cash truth requires full allocation before money moves.
  IF NEW.status IN ('processing', 'settled') THEN
    SELECT coalesce(sum(amount_applied), 0) INTO v_alloc
      FROM payment_matches WHERE payment_id = NEW.id;
    IF v_alloc <> NEW.amount THEN
      RAISE EXCEPTION 'payment allocations (%) must equal payment amount (%) before %',
        v_alloc, NEW.amount, NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'settled' THEN
    NEW.settled_at := coalesce(NEW.settled_at, now());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payments_before_update
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_before_update();

-- ============================================================================
-- Payment matches: the single accrual ⟷ cash bridge.
-- ============================================================================

-- Recompute an invoice's payment state from its settled matches. The ONLY
-- writer of invoices.amount_paid / payment_date / the paid statuses.
CREATE OR REPLACE FUNCTION recompute_invoice_payment_state(p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv invoices%ROWTYPE;
  v_paid numeric;
  v_last date;
  v_pending boolean;
  v_status invoice_status;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT coalesce(sum(pm.amount_applied) FILTER (WHERE p.status = 'settled'), 0),
         max(p.payment_date) FILTER (WHERE p.status = 'settled'),
         count(*) FILTER (WHERE p.status IN ('scheduled', 'pending_approval', 'processing')) > 0
    INTO v_paid, v_last, v_pending
    FROM payment_matches pm
    JOIN payments p ON p.id = pm.payment_id
   WHERE pm.invoice_id = p_invoice;

  IF inv.status IN ('draft', 'pending_approval', 'void') THEN
    v_status := inv.status;
  ELSIF (inv.total > 0 AND v_paid >= inv.total) OR (inv.total < 0 AND v_paid <= inv.total) THEN
    v_status := 'paid';
  ELSIF v_paid <> 0 THEN
    v_status := 'partially_paid';
  ELSIF v_pending THEN
    v_status := 'scheduled';
  ELSE
    v_status := 'approved';
  END IF;

  UPDATE invoices
     SET amount_paid = v_paid,
         payment_date = CASE WHEN v_status = 'paid' THEN v_last END,
         status = v_status
   WHERE id = p_invoice
     AND (amount_paid IS DISTINCT FROM v_paid
          OR payment_date IS DISTINCT FROM CASE WHEN v_status = 'paid' THEN v_last END
          OR status IS DISTINCT FROM v_status);
END $$;

CREATE OR REPLACE FUNCTION payment_matches_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pay payments%ROWTYPE;
  inv invoices%ROWTYPE;
  txn bank_transactions%ROWTYPE;
  v_sum numeric;
BEGIN
  SELECT * INTO pay FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', NEW.payment_id;
  END IF;
  IF pay.status IN ('failed', 'voided') THEN
    RAISE EXCEPTION 'cannot allocate a % payment', pay.status;
  END IF;

  -- Σ per payment never exceeds the payment (phantom-cash guard).
  SELECT coalesce(sum(amount_applied), 0) INTO v_sum
    FROM payment_matches
   WHERE payment_id = NEW.payment_id AND id IS DISTINCT FROM NEW.id;
  IF v_sum + NEW.amount_applied > pay.amount THEN
    RAISE EXCEPTION 'allocation (%) would exceed payment amount (%)',
      v_sum + NEW.amount_applied, pay.amount;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice % not found', NEW.invoice_id;
    END IF;
    IF inv.organization_id <> pay.organization_id THEN
      RAISE EXCEPTION 'invoice and payment belong to different organizations';
    END IF;
    IF inv.status IN ('draft', 'pending_approval') THEN
      RAISE EXCEPTION 'only approved invoices can be paid (invoice is %)', inv.status;
    END IF;
    IF inv.status = 'void' THEN
      RAISE EXCEPTION 'a voided invoice cannot be paid';
    END IF;
    -- Σ per invoice never exceeds its total (T-108 over-allocation guard).
    -- Failed/voided payments no longer claim the invoice (T-107 retry).
    SELECT coalesce(sum(pm.amount_applied), 0) INTO v_sum
      FROM payment_matches pm
      JOIN payments p ON p.id = pm.payment_id
     WHERE pm.invoice_id = NEW.invoice_id
       AND pm.id IS DISTINCT FROM NEW.id
       AND p.status NOT IN ('failed', 'voided');
    IF (inv.total > 0 AND v_sum + NEW.amount_applied > inv.total)
       OR (inv.total < 0 AND v_sum + NEW.amount_applied < inv.total) THEN
      RAISE EXCEPTION 'allocation (%) would exceed invoice total (%): over-payment rejected',
        v_sum + NEW.amount_applied, inv.total;
    END IF;
  END IF;

  IF NEW.bank_transaction_id IS NOT NULL
     AND NEW.bank_transaction_id IS DISTINCT FROM
         (CASE WHEN TG_OP = 'UPDATE' THEN OLD.bank_transaction_id END) THEN
    SELECT * INTO txn FROM bank_transactions WHERE id = NEW.bank_transaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'bank transaction % not found', NEW.bank_transaction_id;
    END IF;
    IF (SELECT organization_id FROM bank_accounts WHERE id = txn.bank_account_id)
       <> pay.organization_id THEN
      RAISE EXCEPTION 'bank transaction belongs to a different organization';
    END IF;
    IF txn.match_status <> 'unmatched' THEN
      RAISE EXCEPTION 'bank transaction is % and cannot evidence a payment', txn.match_status;
    END IF;
    IF -txn.amount <> pay.amount THEN
      RAISE EXCEPTION 'bank debit (%) does not equal payment amount (%)', -txn.amount, pay.amount;
    END IF;
  END IF;

  -- System matches below the confidence floor require a human (spec §7.2).
  IF NEW.matched_by = 'system' AND (NEW.confidence IS NULL OR NEW.confidence < 0.90) THEN
    RAISE EXCEPTION 'system matches under 0.90 confidence require user confirmation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_matches_before_write
  BEFORE INSERT OR UPDATE ON payment_matches
  FOR EACH ROW EXECUTE FUNCTION payment_matches_before_write();

CREATE OR REPLACE FUNCTION payment_matches_after_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Bank evidence linked: the transaction is matched and its direct category
  -- cleared in the same transaction, so the same dollar is never counted twice
  -- (spec §2, T-210).
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.bank_transaction_id IS NOT NULL THEN
    UPDATE bank_transactions
       SET match_status = 'matched_payment', category_id = NULL, applied_rule_id = NULL
     WHERE id = NEW.bank_transaction_id
       AND (match_status <> 'matched_payment' OR category_id IS NOT NULL);
  END IF;
  -- Bank evidence unlinked (unmatch, T-211): the transaction returns to the pool.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.bank_transaction_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id) THEN
    UPDATE bank_transactions
       SET match_status = 'unmatched'
     WHERE id = OLD.bank_transaction_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.invoice_id IS NOT NULL THEN
    PERFORM recompute_invoice_payment_state(NEW.invoice_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.invoice_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
    PERFORM recompute_invoice_payment_state(OLD.invoice_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_payment_matches_after_write
  AFTER INSERT OR UPDATE OR DELETE ON payment_matches
  FOR EACH ROW EXECUTE FUNCTION payment_matches_after_write();

-- Payment status changes re-derive dependent invoice state (settle, fail, void).
CREATE OR REPLACE FUNCTION payments_after_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice uuid;
BEGIN
  FOR v_invoice IN
    SELECT DISTINCT invoice_id FROM payment_matches
     WHERE payment_id = NEW.id AND invoice_id IS NOT NULL
  LOOP
    PERFORM recompute_invoice_payment_state(v_invoice);
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_payments_after_status_change
  AFTER UPDATE OF status ON payments
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION payments_after_status_change();

-- Deferred, at COMMIT: a payment that is processing/settled must be exactly
-- fully allocated (Σ matches = payment.amount) even after later edits.
CREATE OR REPLACE FUNCTION payment_matches_check_full_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_payment uuid := coalesce(NEW.payment_id, OLD.payment_id);
  pay payments%ROWTYPE;
  v_sum numeric;
BEGIN
  SELECT * INTO pay FROM payments WHERE id = v_payment;
  IF FOUND AND pay.status IN ('processing', 'settled') THEN
    SELECT coalesce(sum(amount_applied), 0) INTO v_sum
      FROM payment_matches WHERE payment_id = v_payment;
    IF v_sum <> pay.amount THEN
      RAISE EXCEPTION 'payment % is % but allocations (%) no longer equal its amount (%)',
        v_payment, pay.status, v_sum, pay.amount;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_payment_matches_full_allocation
  AFTER INSERT OR UPDATE OR DELETE ON payment_matches
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION payment_matches_check_full_allocation();

-- ============================================================================
-- Bank transactions: immutable evidence.
-- ============================================================================

CREATE OR REPLACE FUNCTION bank_transactions_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r bank_transaction_rules%ROWTYPE;
  v_org uuid;
BEGIN
  -- T-209 fix: every import path derives the hash from the same canonical
  -- function; client-supplied values are ignored.
  NEW.dedupe_hash := bank_txn_dedupe_hash(NEW.bank_account_id, NEW.posted_at, NEW.amount, NEW.description_raw);

  -- Manual/CSV imports can never duplicate an already-synced row.
  IF NEW.external_txn_id IS NULL AND EXISTS (
       SELECT 1 FROM bank_transactions
        WHERE bank_account_id = NEW.bank_account_id
          AND dedupe_hash = NEW.dedupe_hash) THEN
    RAISE EXCEPTION 'duplicate bank transaction (dedupe_hash %) — already imported', NEW.dedupe_hash;
  END IF;

  -- Ordered auto-categorization rules: metadata only, never amounts or matches.
  IF NEW.category_id IS NULL AND NEW.match_status = 'unmatched' THEN
    SELECT organization_id INTO v_org FROM bank_accounts WHERE id = NEW.bank_account_id;
    FOR r IN
      SELECT * FROM bank_transaction_rules
       WHERE organization_id = v_org AND is_active
       ORDER BY priority
    LOOP
      IF (r.matcher ->> 'pattern' IS NULL OR NEW.description_raw ILIKE (r.matcher ->> 'pattern'))
         AND (r.matcher ->> 'direction' IS NULL
              OR (r.matcher ->> 'direction' = 'outflow' AND NEW.amount < 0)
              OR (r.matcher ->> 'direction' = 'inflow' AND NEW.amount > 0))
         AND (r.matcher ->> 'min_amount' IS NULL OR abs(NEW.amount) >= (r.matcher ->> 'min_amount')::numeric)
         AND (r.matcher ->> 'max_amount' IS NULL OR abs(NEW.amount) <= (r.matcher ->> 'max_amount')::numeric)
         AND (r.matcher ->> 'bank_account_id' IS NULL
              OR (r.matcher ->> 'bank_account_id')::uuid = NEW.bank_account_id)
      THEN
        NEW.applied_rule_id := r.id;
        NEW.category_id := r.set_category_id;
        IF r.set_vendor_id IS NOT NULL THEN
          NEW.counterparty := (SELECT name FROM vendors WHERE id = r.set_vendor_id);
        END IF;
        IF r.auto_exclude THEN
          NEW.match_status := 'excluded';
          NEW.category_id := NULL;
        END IF;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_bank_transactions_before_insert
  BEFORE INSERT ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION bank_transactions_before_insert();

CREATE OR REPLACE FUNCTION bank_transactions_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  internal boolean := pg_trigger_depth() > 1;
BEGIN
  -- Rows are immutable once posted: amount/date/description never change;
  -- corrections append a reversal row (spec §5.2).
  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
     OR NEW.description_raw IS DISTINCT FROM OLD.description_raw
     OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
     OR NEW.external_txn_id IS DISTINCT FROM OLD.external_txn_id
     OR NEW.dedupe_hash IS DISTINCT FROM OLD.dedupe_hash THEN
    RAISE EXCEPTION 'bank transactions are immutable; corrections append a reversal row';
  END IF;

  IF NOT internal THEN
    -- matched_* states are set exclusively by the matching triggers.
    IF NEW.match_status IS DISTINCT FROM OLD.match_status
       AND NOT (OLD.match_status IN ('unmatched', 'excluded')
                AND NEW.match_status IN ('unmatched', 'excluded')) THEN
      RAISE EXCEPTION 'match_status % -> % is set by the matching engine, not directly',
        OLD.match_status, NEW.match_status;
    END IF;
    -- A matched transaction cannot carry a direct category (double-count guard).
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       AND NEW.category_id IS NOT NULL
       AND OLD.match_status <> 'unmatched' THEN
      RAISE EXCEPTION 'a % transaction cannot be categorized directly', OLD.match_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_bank_transactions_before_update
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION bank_transactions_before_update();

CREATE OR REPLACE FUNCTION bank_transactions_block_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bank transactions are never deleted; corrections append a reversal row';
END $$;

CREATE TRIGGER trg_bank_transactions_block_delete
  BEFORE DELETE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION bank_transactions_block_delete();

-- ============================================================================
-- POS: revenue accrual + deposit reconciliation.
-- ============================================================================

CREATE OR REPLACE FUNCTION pos_sales_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tender numeric;
BEGIN
  v_tender := coalesce((NEW.tender_breakdown ->> 'cash')::numeric, 0)
            + coalesce((NEW.tender_breakdown ->> 'card')::numeric, 0)
            + coalesce((NEW.tender_breakdown ->> 'gift_card')::numeric, 0)
            + coalesce((NEW.tender_breakdown ->> 'other')::numeric, 0);
  IF v_tender <> NEW.gross_sales + NEW.tax_collected + NEW.tips THEN
    RAISE EXCEPTION 'tender breakdown (%) must sum to gross + tax + tips (%)',
      v_tender, NEW.gross_sales + NEW.tax_collected + NEW.tips;
  END IF;
  IF (SELECT organization_id FROM locations WHERE id = NEW.location_id)
     IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'location belongs to a different organization';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pos_sales_validate
  BEFORE INSERT OR UPDATE ON pos_sales
  FOR EACH ROW EXECUTE FUNCTION pos_sales_validate();

CREATE OR REPLACE FUNCTION pos_deposits_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  txn bank_transactions%ROWTYPE;
  internal boolean := pg_trigger_depth() > 1;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.bank_transaction_id IS NOT NULL OR NEW.actual_amount IS NOT NULL
       OR NEW.status NOT IN ('expected') THEN
      RAISE EXCEPTION 'deposits are created expected; matching happens afterwards';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT internal AND NEW.actual_amount IS DISTINCT FROM OLD.actual_amount
     AND NEW.bank_transaction_id IS NOT DISTINCT FROM OLD.bank_transaction_id THEN
    RAISE EXCEPTION 'actual_amount is copied from the matched bank transaction, never written directly';
  END IF;

  IF NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id THEN
    IF NEW.bank_transaction_id IS NULL THEN
      -- Unmatch: back to the pool.
      NEW.actual_amount := NULL;
      NEW.status := 'expected';
    ELSE
      SELECT * INTO txn FROM bank_transactions WHERE id = NEW.bank_transaction_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'bank transaction % not found', NEW.bank_transaction_id;
      END IF;
      IF (SELECT organization_id FROM bank_accounts WHERE id = txn.bank_account_id)
         <> NEW.organization_id THEN
        RAISE EXCEPTION 'bank transaction belongs to a different organization';
      END IF;
      IF txn.match_status <> 'unmatched' THEN
        RAISE EXCEPTION 'bank transaction is % and cannot evidence a deposit', txn.match_status;
      END IF;
      IF txn.amount <= 0 THEN
        RAISE EXCEPTION 'a deposit must match an inflow';
      END IF;
      NEW.actual_amount := txn.amount;
      NEW.status := CASE WHEN txn.amount = NEW.expected_amount THEN 'matched' ELSE 'variance' END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pos_deposits_before_write
  BEFORE INSERT OR UPDATE ON pos_deposits
  FOR EACH ROW EXECUTE FUNCTION pos_deposits_before_write();

CREATE OR REPLACE FUNCTION pos_deposits_after_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.bank_transaction_id IS NOT NULL
     AND NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id THEN
    UPDATE bank_transactions
       SET match_status = 'matched_deposit', category_id = NULL
     WHERE id = NEW.bank_transaction_id;
    -- A variance is an exception, surfaced as evidence-carrying insight
    -- (T-206); the sales rows are never touched.
    IF NEW.variance_amount IS DISTINCT FROM 0 THEN
      INSERT INTO ai_insights (organization_id, location_id, kind, subject_type, subject_id,
                               title, body, confidence, severity, evidence, model_version)
      VALUES (NEW.organization_id, NEW.location_id, 'deposit_variance', 'pos_deposits', NEW.id,
              'Deposit variance detected',
              format('Expected %s, received %s for window %s → %s',
                     NEW.expected_amount, NEW.actual_amount, NEW.covers_from, NEW.covers_to),
              1.00, 'warning',
              jsonb_build_object('pos_deposit_id', NEW.id,
                                 'bank_transaction_id', NEW.bank_transaction_id,
                                 'expected_amount', NEW.expected_amount,
                                 'actual_amount', NEW.actual_amount,
                                 'variance', NEW.variance_amount),
              'detector-v1');
    END IF;
  END IF;
  IF OLD.bank_transaction_id IS NOT NULL
     AND NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id THEN
    UPDATE bank_transactions SET match_status = 'unmatched'
     WHERE id = OLD.bank_transaction_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_pos_deposits_after_write
  AFTER UPDATE ON pos_deposits
  FOR EACH ROW EXECUTE FUNCTION pos_deposits_after_write();

-- ============================================================================
-- Audit coverage: every financial and access-control table writes an audit row
-- in the same transaction as the change.
-- ============================================================================

SELECT install_audit_trigger(t) FROM unnest(ARRAY[
  'invoices', 'invoice_line_items', 'payments', 'payment_matches',
  'bank_accounts', 'bank_transactions', 'bank_transaction_rules',
  'pos_sales', 'pos_deposits', 'approvals', 'financial_periods', 'budgets',
  'vendors', 'expense_categories', 'documents', 'integrations',
  'user_org_roles', 'user_location_access', 'roles', 'role_permissions'
]::regclass[]) AS t;
