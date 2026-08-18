-- 005 · Vendors & expense categories (Database Architecture §6.1–6.2).

CREATE TABLE expense_categories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  parent_id uuid REFERENCES expense_categories(id),
  name text NOT NULL,
  code text NOT NULL,
  statement_group statement_group NOT NULL,
  gl_account_ref text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX ix_expense_categories_org ON expense_categories (organization_id);
CREATE INDEX ix_expense_categories_parent ON expense_categories (parent_id);
SELECT install_touch_trigger('expense_categories');

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  legal_name text,
  tax_id text, -- encrypted at rest (envelope encryption at the app layer)
  default_expense_category_id uuid REFERENCES expense_categories(id),
  payment_terms_days smallint,
  remittance jsonb, -- tokenized references only, never raw ACH details
  status vendor_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, normalized_name)
);
CREATE INDEX ix_vendors_org ON vendors (organization_id);
SELECT install_touch_trigger('vendors');

-- normalized_name is derived on write, never trusted from the client.
CREATE OR REPLACE FUNCTION vendors_derive_normalized_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_name := normalize_vendor_name(NEW.name);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_vendors_normalize
  BEFORE INSERT OR UPDATE OF name ON vendors
  FOR EACH ROW EXECUTE FUNCTION vendors_derive_normalized_name();
