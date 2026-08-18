-- 012 · Intelligence & support (Database Architecture §10.1–10.2).
-- AI output is a proposal, never a mutation: insights carry evidence and a
-- confidence score; no AI code path holds write permission on financial tables
-- (enforced by the monark_ai read-only role in 018).

CREATE TABLE ai_insights (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid REFERENCES locations(id),
  kind insight_kind NOT NULL,
  subject_type text,
  subject_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  severity insight_severity NOT NULL,
  evidence jsonb NOT NULL, -- row ids + values the model reasoned from
  model_version text NOT NULL,
  status insight_status NOT NULL DEFAULT 'new',
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_insights_org_status ON ai_insights (organization_id, status, severity);
CREATE INDEX ix_ai_insights_subject ON ai_insights (subject_type, subject_id);
SELECT install_touch_trigger('ai_insights');

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind notification_kind NOT NULL,
  subject_type text,
  subject_id uuid,
  title text NOT NULL,
  body text,
  channels jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user ON notifications (user_id, read_at NULLS FIRST, created_at DESC);
SELECT install_touch_trigger('notifications');
