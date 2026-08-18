-- 006 · Integrations & documents (Database Architecture §10.3–10.4).
-- Created before banking/invoices because bank_accounts and invoices FK them.

CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider integration_provider NOT NULL,
  external_ref text NOT NULL,
  location_id uuid REFERENCES locations(id),
  credentials_ref text NOT NULL, -- vault pointer; raw tokens never stored here
  scopes jsonb NOT NULL,
  status integration_status NOT NULL,
  last_sync_at timestamptz,
  sync_cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_ref)
);
CREATE INDEX ix_integrations_org ON integrations (organization_id);
CREATE INDEX ix_integrations_status ON integrations (status);
SELECT install_touch_trigger('integrations');

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  storage_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 char(64) NOT NULL,
  source document_source NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  ocr_status ocr_status NOT NULL,
  ocr_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The same PDF can never spawn two invoices (duplicate guard, T-402).
  UNIQUE (organization_id, sha256)
);
CREATE INDEX ix_documents_org ON documents (organization_id);
SELECT install_touch_trigger('documents');
