-- 017 · Row-Level Security (Security & Audit §3–§4).
-- Every tenant table is keyed on organization_id, set per-connection from the
-- verified JWT (SET LOCAL app.org_id). Location-bearing tables intersect the
-- org check with the caller's location grant. Cross-org access returns empty
-- sets — never errors that reveal existence (F-05).

-- ── Identity & access ────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_org())
  WITH CHECK (id = app_current_org());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (id = app_current_user()
         OR EXISTS (SELECT 1 FROM user_org_roles uor
                     WHERE uor.user_id = users.id
                       AND uor.organization_id = app_current_org()));

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
  USING (organization_id IS NULL OR organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON permissions USING (true);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_permissions
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permissions.role_id))
  WITH CHECK (EXISTS (SELECT 1 FROM roles r
                       WHERE r.id = role_permissions.role_id
                         AND r.organization_id = app_current_org()));

ALTER TABLE user_org_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_org_roles
  USING (organization_id = app_current_org() OR user_id = app_current_user())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_location_access
  USING (EXISTS (SELECT 1 FROM user_org_roles uor
                  WHERE uor.id = user_location_access.user_org_role_id))
  WITH CHECK (EXISTS (SELECT 1 FROM user_org_roles uor
                       WHERE uor.id = user_location_access.user_org_role_id
                         AND uor.organization_id = app_current_org()));

-- ── Org structure ────────────────────────────────────────────────────────
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON restaurants
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations
  USING (organization_id = app_current_org() AND app_has_location_access(id))
  WITH CHECK (organization_id = app_current_org());

-- ── Vendors & categories ─────────────────────────────────────────────────
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendors
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expense_categories
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ── Documents & integrations ─────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON documents
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ── Banking ──────────────────────────────────────────────────────────────
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_accounts
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_transactions
  USING (EXISTS (SELECT 1 FROM bank_accounts ba
                  WHERE ba.id = bank_transactions.bank_account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM bank_accounts ba
                       WHERE ba.id = bank_transactions.bank_account_id
                         AND ba.organization_id = app_current_org()));

ALTER TABLE bank_transaction_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_transaction_rules
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ── AP ───────────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org() AND app_has_location_access(location_id));

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_line_items
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_line_items.invoice_id))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_line_items.invoice_id));

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approvals
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ── Payments & matching ──────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE payment_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_matches
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_matches.payment_id))
  WITH CHECK (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_matches.payment_id));

-- ── POS ──────────────────────────────────────────────────────────────────
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_sales
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org() AND app_has_location_access(location_id));

ALTER TABLE pos_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_deposits
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org() AND app_has_location_access(location_id));

-- ── Planning ─────────────────────────────────────────────────────────────
ALTER TABLE financial_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial_periods
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON budgets
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org() AND app_has_location_access(location_id));

ALTER TABLE cash_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cash_forecasts
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ── Intelligence & audit ─────────────────────────────────────────────────
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_insights
  USING (organization_id = app_current_org() AND app_has_location_access(location_id))
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING (organization_id = app_current_org() AND user_id = app_current_user())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON audit_logs FOR SELECT
  USING (organization_id = app_current_org()
         AND (app_current_user() IS NULL
              OR user_has_permission(app_current_user(), app_current_org(), 'audit.read')));
