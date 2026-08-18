-- 010 · Payments & matching (Database Architecture §7).
-- The payment is THE cash event: payment_date → payment_month drives cash flow.
-- payment_matches is the ONLY bridge between accrual and cash; it carries no
-- amount beyond the allocation, so it can never create a financial event.

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  method payment_method NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL,
  payment_date date NOT NULL,
  payment_month date NOT NULL GENERATED ALWAYS AS (date_trunc('month', payment_date::timestamp)::date) STORED,
  initiated_at timestamptz NOT NULL,
  settled_at timestamptz,
  status payment_status NOT NULL,
  -- Retried API sends are structurally un-duplicable (T-407).
  idempotency_key text NOT NULL UNIQUE,
  external_ref text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_payments_org_month ON payments (organization_id, payment_month);
CREATE INDEX ix_payments_account ON payments (bank_account_id);
CREATE INDEX ix_payments_status_date ON payments (status, payment_date);
SELECT install_touch_trigger('payments');

CREATE TABLE payment_matches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  invoice_id uuid REFERENCES invoices(id), -- NULL for non-invoice cash (e.g. transfers)
  bank_transaction_id uuid REFERENCES bank_transactions(id), -- set when the debit syncs
  amount_applied numeric(14,2) NOT NULL CHECK (amount_applied <> 0),
  matched_by match_actor NOT NULL,
  confidence numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  matched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A payment allocates to an invoice at most once.
  UNIQUE (payment_id, invoice_id)
);
-- One bank debit settles exactly one payment (T-204).
CREATE UNIQUE INDEX ux_payment_matches_bank_txn
  ON payment_matches (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX ix_payment_matches_invoice ON payment_matches (invoice_id);
CREATE INDEX ix_payment_matches_payment ON payment_matches (payment_id);
SELECT install_touch_trigger('payment_matches');
