-- 007 · Banking (Database Architecture §5).

CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid REFERENCES locations(id), -- NULL = org treasury account
  integration_id uuid REFERENCES integrations(id), -- NULL = manual account
  external_account_id text,
  institution_name text NOT NULL,
  account_name text NOT NULL,
  account_mask char(4) NOT NULL, -- last four only; full numbers never stored
  account_type bank_account_type NOT NULL,
  currency char(3) NOT NULL,
  current_balance numeric(14,2) NOT NULL DEFAULT 0, -- provider cache; ledger truth is bank_transactions
  balance_as_of timestamptz,
  status bank_account_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_bank_accounts_integration_external
  ON bank_accounts (integration_id, external_account_id)
  WHERE integration_id IS NOT NULL;
CREATE INDEX ix_bank_accounts_org ON bank_accounts (organization_id);
CREATE INDEX ix_bank_accounts_location ON bank_accounts (location_id);
SELECT install_touch_trigger('bank_accounts');

CREATE TABLE bank_transaction_rules (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  priority integer NOT NULL, -- lowest wins
  matcher jsonb NOT NULL,    -- {pattern, direction, min_amount, max_amount, bank_account_id}
  set_category_id uuid REFERENCES expense_categories(id),
  set_vendor_id uuid REFERENCES vendors(id),
  auto_exclude boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, priority)
);
CREATE INDEX ix_bank_txn_rules_org ON bank_transaction_rules (organization_id);
SELECT install_touch_trigger('bank_transaction_rules');

-- Immutable ledger: evidence of cash movement, never a financial entry.
CREATE TABLE bank_transactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  external_txn_id text,
  posted_at date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount <> 0), -- signed; negative = outflow
  description_raw text NOT NULL, -- verbatim from bank
  counterparty text,
  category_id uuid REFERENCES expense_categories(id), -- cleared by trigger when matched to a payment
  applied_rule_id uuid REFERENCES bank_transaction_rules(id),
  match_status bank_txn_match_status NOT NULL DEFAULT 'unmatched',
  is_pending boolean NOT NULL DEFAULT false,
  dedupe_hash text NOT NULL,
  reversal_of_id uuid REFERENCES bank_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Duplicate guards: integration re-sync (T-408) and manual/CSV import (T-209).
CREATE UNIQUE INDEX ux_bank_txn_external
  ON bank_transactions (bank_account_id, external_txn_id)
  WHERE external_txn_id IS NOT NULL;
CREATE UNIQUE INDEX ux_bank_txn_dedupe
  ON bank_transactions (bank_account_id, dedupe_hash)
  WHERE external_txn_id IS NULL;
CREATE INDEX ix_bank_txn_account_posted ON bank_transactions (bank_account_id, posted_at DESC);
CREATE INDEX ix_bank_txn_match_status ON bank_transactions (match_status);
CREATE INDEX ix_bank_txn_category ON bank_transactions (category_id);
SELECT install_touch_trigger('bank_transactions');
