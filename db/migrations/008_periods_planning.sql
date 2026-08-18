-- 008 · Planning & periods (Database Architecture §9).
-- financial_periods comes before invoices because invoices.period_id FKs it.

CREATE TABLE financial_periods (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  period_month date NOT NULL CHECK (period_month = date_trunc('month', period_month::timestamp)::date),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status period_status NOT NULL DEFAULT 'open',
  locked_by uuid REFERENCES users(id),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_month)
);
SELECT install_touch_trigger('financial_periods');

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid REFERENCES locations(id), -- NULL = org-level budget line
  period_month date NOT NULL CHECK (period_month = date_trunc('month', period_month::timestamp)::date),
  expense_category_id uuid NOT NULL REFERENCES expense_categories(id),
  basis budget_basis NOT NULL,
  amount numeric(14,2),
  pct numeric(5,4),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((basis = 'fixed' AND amount IS NOT NULL) OR (basis = 'pct_of_net_sales' AND pct IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (organization_id, location_id, period_month, expense_category_id)
);
CREATE INDEX ix_budgets_org_month ON budgets (organization_id, period_month);
SELECT install_touch_trigger('budgets');

CREATE TABLE cash_forecasts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  bank_account_id uuid REFERENCES bank_accounts(id), -- NULL = consolidated
  forecast_date date NOT NULL,
  generated_at timestamptz NOT NULL,
  horizon_days smallint NOT NULL,
  opening_balance numeric(14,2) NOT NULL,
  projected_inflows numeric(14,2) NOT NULL,
  projected_outflows numeric(14,2) NOT NULL,
  projected_closing numeric(14,2) NOT NULL,
  assumptions jsonb NOT NULL,
  model_version text NOT NULL,
  superseded_by_id uuid REFERENCES cash_forecasts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (projected_closing = opening_balance + projected_inflows - projected_outflows)
);
CREATE INDEX ix_cash_forecasts_org_date ON cash_forecasts (organization_id, forecast_date);
CREATE INDEX ix_cash_forecasts_generated ON cash_forecasts (generated_at);
SELECT install_touch_trigger('cash_forecasts');
