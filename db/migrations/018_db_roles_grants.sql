-- 018 · Database roles & deny-by-default grants (Security & Audit §2).
--
-- monark_app — the API's role. No BYPASSRLS; every read/write passes RLS.
--   Financial tables get no DELETE (rows void or reverse; nothing disappears).
--   audit_logs gets SELECT only — INSERT happens exclusively through the
--   SECURITY DEFINER write_audit_log(); UPDATE/DELETE are granted to no one.
-- monark_ai — the AI's role. SELECT only, plus INSERT on ai_insights: the AI
--   proposes with evidence and confidence; it never approves, pays, or writes
--   financial records. Structural, not conventional.

DO $$ BEGIN
  CREATE ROLE monark_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE monark_ai NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Let the migration/superuser session assume these roles (tests, seeds).
GRANT monark_app TO CURRENT_USER;
GRANT monark_ai TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO monark_app, monark_ai;

-- ── Read access ──────────────────────────────────────────────────────────
GRANT SELECT ON
  organizations, roles, permissions, role_permissions, user_org_roles,
  user_location_access, restaurants, locations, expense_categories,
  documents, integrations, bank_accounts, bank_transactions,
  bank_transaction_rules, invoices, invoice_line_items, approvals,
  payments, payment_matches, pos_sales, pos_deposits, financial_periods,
  budgets, cash_forecasts, ai_insights, notifications, audit_logs
TO monark_app, monark_ai;

-- users: password_hash is never readable via API (Security §13).
GRANT SELECT (id, email, full_name, phone, auth_provider, mfa_enabled,
              last_login_at, status, created_at, updated_at)
  ON users TO monark_app, monark_ai;

-- vendors: remittance and tax_id stay behind read_vendor_remittance() —
-- AP clerks see masks only (T-307).
GRANT SELECT (id, organization_id, name, normalized_name, legal_name,
              default_expense_category_id, payment_terms_days, status,
              created_at, updated_at)
  ON vendors TO monark_app, monark_ai;

-- ── Write access (monark_app only) ───────────────────────────────────────
GRANT INSERT, UPDATE ON
  organizations, roles, role_permissions, user_org_roles, user_location_access,
  restaurants, locations, vendors, expense_categories, documents, integrations,
  bank_accounts, bank_transactions, bank_transaction_rules, invoices,
  invoice_line_items, approvals, payments, payment_matches, pos_sales,
  pos_deposits, financial_periods, budgets, cash_forecasts, ai_insights,
  notifications
TO monark_app;

GRANT UPDATE (mfa_enabled, full_name, phone, last_login_at) ON users TO monark_app;

-- Deletes: only non-financial, operational rows. Financial rows never
-- hard-delete — no DELETE grant exists for them, to anyone.
GRANT DELETE ON payment_matches, invoice_line_items, user_location_access,
                role_permissions, notifications
TO monark_app;

-- audit_logs: append-only through write_audit_log() only. Nothing to revoke —
-- INSERT/UPDATE/DELETE were never granted, and the guard trigger in 013 stops
-- even the table owner from editing history.

-- monark_ai: proposals only.
GRANT INSERT ON ai_insights TO monark_ai;
GRANT UPDATE (status, resolved_by) ON ai_insights TO monark_app;

-- ── Sensitive-field access path ──────────────────────────────────────────
-- Decrypt/read of remittance requires vendor.read_remittance and is itself
-- audited (reads of sensitive data are audited too — Security §11).
CREATE OR REPLACE FUNCTION read_vendor_remittance(p_vendor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v vendors%ROWTYPE;
BEGIN
  SELECT * INTO v FROM vendors WHERE id = p_vendor;
  IF NOT FOUND OR v.organization_id IS DISTINCT FROM app_current_org() THEN
    RAISE EXCEPTION 'vendor not found'; -- uniform: existence never revealed cross-org
  END IF;
  IF NOT app_has_permission('vendor.read_remittance') THEN
    RAISE EXCEPTION 'permission denied: vendor.read_remittance is required';
  END IF;
  PERFORM write_audit_log(v.organization_id, 'vendor.remittance_read', 'vendors', v.id);
  RETURN v.remittance;
END $$;
