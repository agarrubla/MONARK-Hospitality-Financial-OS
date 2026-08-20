-- 022 · Server-side session registry (Security & Audit §10) — durable across
-- deploys. Tokens are stored hashed; the raw token only ever lives on the
-- user's device.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  token_hash char(64) NOT NULL UNIQUE, -- sha256 of the bearer token
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX ix_sessions_user ON sessions (user_id);
