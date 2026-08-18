-- 009 · Vendors & AP: invoices, line items, approvals (Database Architecture §6.3–6.5).
-- The invoice is THE accrual event: expense_date → expense_month drives the P&L.
-- expense_month / payment_month are GENERATED — derived, never hand-entered.

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  invoice_number text NOT NULL,
  -- T-406 fix: uniqueness rides on the normalized number, not the raw string.
  invoice_number_norm text NOT NULL GENERATED ALWAYS AS (canonical_text(invoice_number)) STORED,
  invoice_date date NOT NULL,
  service_date date,
  expense_date date NOT NULL,
  expense_month date NOT NULL GENERATED ALWAYS AS (date_trunc('month', expense_date::timestamp)::date) STORED,
  due_date date,
  payment_date date, -- set by trigger when amount_paid reaches total; never written directly
  payment_month date GENERATED ALWAYS AS (date_trunc('month', payment_date::timestamp)::date) STORED,
  currency char(3) NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  tax numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'draft',
  source invoice_source NOT NULL,
  document_id uuid REFERENCES documents(id),
  period_id uuid REFERENCES financial_periods(id),
  -- Global convention §0: corrections append reversal rows. A credit memo is a
  -- negative reversal invoice pointing at the original (T-110); only reversal
  -- rows may carry a negative total.
  reversal_of_id uuid REFERENCES invoices(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total = subtotal + tax),
  CHECK (total > 0 OR (reversal_of_id IS NOT NULL AND total < 0)),
  CHECK (
    (total > 0 AND amount_paid >= 0 AND amount_paid <= total)
    OR (total < 0 AND amount_paid <= 0 AND amount_paid >= total)
  ),
  -- Duplicate-invoice guard (T-401): same vendor invoice can never enter twice.
  UNIQUE (organization_id, vendor_id, invoice_number_norm)
);
CREATE INDEX ix_invoices_org_expense_month ON invoices (organization_id, expense_month);
CREATE INDEX ix_invoices_location_expense_date ON invoices (location_id, expense_date);
CREATE INDEX ix_invoices_status_due ON invoices (status, due_date);
CREATE INDEX ix_invoices_vendor ON invoices (vendor_id);
CREATE INDEX ix_invoices_payment_month ON invoices (payment_month);
SELECT install_touch_trigger('invoices');

CREATE TABLE invoice_line_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  line_no smallint NOT NULL,
  description text NOT NULL,
  quantity numeric(12,3),
  unit_cost numeric(12,4),
  amount numeric(14,2) NOT NULL,
  expense_category_id uuid NOT NULL REFERENCES expense_categories(id),
  location_id uuid REFERENCES locations(id), -- override for split-location invoices
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX ix_invoice_line_items_invoice ON invoice_line_items (invoice_id);
CREATE INDEX ix_invoice_line_items_category ON invoice_line_items (expense_category_id);
SELECT install_touch_trigger('invoice_line_items');

-- Polymorphic human approval gate. policy_snapshot freezes the threshold and
-- chain definition at creation so later policy edits can't retroactively
-- legitimize a decision.
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  subject_type approval_subject_type NOT NULL,
  subject_id uuid NOT NULL,
  step smallint NOT NULL,
  approver_id uuid NOT NULL REFERENCES users(id),
  required_role_id uuid REFERENCES roles(id),
  decision approval_decision NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  note text,
  policy_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, step, approver_id)
);
CREATE INDEX ix_approvals_approver ON approvals (approver_id, decision);
CREATE INDEX ix_approvals_subject ON approvals (subject_type, subject_id);
SELECT install_touch_trigger('approvals');
