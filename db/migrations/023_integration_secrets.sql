-- Encrypted provider credentials, managed from the app's settings screen.
-- Ciphertext only (AES-256-GCM, key lives in the service environment); the
-- app role gets NO grants on this table, so RLS or not, sessions can never
-- read tokens — only the service layer (table owner) touches it.

CREATE TABLE integration_secrets (
  ref text PRIMARY KEY, -- matches integrations.credentials_ref ("db:" prefix)
  organization_id uuid NOT NULL REFERENCES organizations(id),
  ciphertext text NOT NULL, -- base64: iv || tag || data
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_integration_secrets_org ON integration_secrets (organization_id);
SELECT install_touch_trigger('integration_secrets');
