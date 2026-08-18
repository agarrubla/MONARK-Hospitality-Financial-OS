-- 011 · POS sales & deposits (Database Architecture §8).
-- pos_sales is the revenue accrual; a matched deposit records nothing new.

CREATE TABLE pos_sales (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  business_date date NOT NULL,
  source pos_source NOT NULL,
  gross_sales numeric(14,2) NOT NULL,
  discounts numeric(14,2) NOT NULL DEFAULT 0,
  comps numeric(14,2) NOT NULL DEFAULT 0,
  net_sales numeric(14,2) NOT NULL,
  tax_collected numeric(14,2) NOT NULL,
  tips numeric(14,2) NOT NULL DEFAULT 0,
  tender_breakdown jsonb NOT NULL, -- {cash, card, gift_card, other}; sum validated by trigger
  check_count integer,
  external_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (net_sales = gross_sales - discounts - comps),
  -- A POS day can never import twice (T-409).
  UNIQUE (location_id, business_date, source)
);
CREATE INDEX ix_pos_sales_location_date ON pos_sales (location_id, business_date DESC);
CREATE INDEX ix_pos_sales_org_date ON pos_sales (organization_id, business_date);
SELECT install_touch_trigger('pos_sales');

CREATE TABLE pos_deposits (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  deposit_type deposit_type NOT NULL,
  covers_from date NOT NULL,
  covers_to date NOT NULL,
  expected_amount numeric(14,2) NOT NULL,
  expected_on date NOT NULL,
  bank_transaction_id uuid REFERENCES bank_transactions(id),
  actual_amount numeric(14,2), -- copied from the matched txn by trigger
  variance_amount numeric(14,2) GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  status deposit_status NOT NULL DEFAULT 'expected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (covers_to >= covers_from)
);
-- One bank deposit can never match two sales windows.
CREATE UNIQUE INDEX ux_pos_deposits_bank_txn
  ON pos_deposits (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX ix_pos_deposits_location_expected ON pos_deposits (location_id, expected_on);
CREATE INDEX ix_pos_deposits_status ON pos_deposits (status);
SELECT install_touch_trigger('pos_deposits');
