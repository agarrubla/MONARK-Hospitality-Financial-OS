-- 013 · Audit log (Database Architecture §10.5, Security & Audit §11).
-- Append-only, hash-chained, written in the SAME transaction as every change:
-- if the audit write fails, the change rolls back. No UPDATE/DELETE for any
-- role — enforced both by grants (018) and by a guard trigger here, so even
-- the migration owner cannot silently edit history.

CREATE TABLE audit_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY, -- strict append ordering
  organization_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type audit_actor_type NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  before jsonb,
  after jsonb,
  request_id uuid,
  ip inet,
  prev_hash char(64) NOT NULL,
  row_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
  -- no updated_at: rows are immutable
);
CREATE INDEX ix_audit_logs_org_time ON audit_logs (organization_id, occurred_at DESC);
CREATE INDEX ix_audit_logs_subject ON audit_logs (subject_type, subject_id);
CREATE INDEX ix_audit_logs_actor ON audit_logs (actor_id);

CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'raise_exception';
END $$;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- Deterministic payload string for hashing. jsonb::text is stable for equal
-- values (keys are stored sorted); epoch keeps timestamp formatting
-- session-independent.
CREATE OR REPLACE FUNCTION audit_row_payload(
  p_org uuid, p_occurred timestamptz, p_actor_type text, p_actor uuid,
  p_action text, p_subject_type text, p_subject uuid, p_before jsonb, p_after jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_org::text
    || '|' || extract(epoch FROM p_occurred)::text
    || '|' || p_actor_type
    || '|' || coalesce(p_actor::text, '')
    || '|' || p_action
    || '|' || p_subject_type
    || '|' || coalesce(p_subject::text, '')
    || '|' || coalesce(p_before::text, '')
    || '|' || coalesce(p_after::text, '')
$$;

-- Single entry point for writing an audit row. SECURITY DEFINER so the app
-- role can only append through this path. A per-org advisory lock serializes
-- the chain; prev_hash of the first row is 64 zeros.
CREATE OR REPLACE FUNCTION write_audit_log(
  p_org uuid,
  p_action text,
  p_subject_type text,
  p_subject uuid,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_actor_type text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prev char(64);
  v_occurred timestamptz := now();
  v_actor_type audit_actor_type := coalesce(p_actor_type, app_actor_type())::audit_actor_type;
  v_actor uuid := coalesce(p_actor, app_current_user());
  v_request uuid := nullif(current_setting('app.request_id', true), '')::uuid;
  v_ip inet := nullif(current_setting('app.ip', true), '')::inet;
  v_hash char(64);
  v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit_chain:' || p_org::text, 0));
  SELECT row_hash INTO v_prev
    FROM audit_logs
   WHERE organization_id = p_org
   ORDER BY id DESC
   LIMIT 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_hash := encode(digest(
    v_prev || audit_row_payload(p_org, v_occurred, v_actor_type::text, v_actor,
                                p_action, p_subject_type, p_subject, p_before, p_after),
    'sha256'), 'hex');
  INSERT INTO audit_logs (organization_id, occurred_at, actor_type, actor_id, action,
                          subject_type, subject_id, before, after, request_id, ip,
                          prev_hash, row_hash)
  VALUES (p_org, v_occurred, v_actor_type, v_actor, p_action,
          p_subject_type, p_subject, p_before, p_after, v_request, v_ip,
          v_prev, v_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Re-walk the chain for one org; returns ids of rows whose hash no longer
-- matches their content or predecessor (empty set = chain intact).
CREATE OR REPLACE FUNCTION verify_audit_chain(p_org uuid)
RETURNS TABLE (broken_id bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  r record;
  v_prev char(64) := repeat('0', 64);
  v_expected char(64);
BEGIN
  FOR r IN
    SELECT * FROM audit_logs WHERE organization_id = p_org ORDER BY id
  LOOP
    v_expected := encode(digest(
      v_prev || audit_row_payload(r.organization_id, r.occurred_at, r.actor_type::text,
                                  r.actor_id, r.action, r.subject_type, r.subject_id,
                                  r.before, r.after),
      'sha256'), 'hex');
    IF r.prev_hash <> v_prev OR r.row_hash <> v_expected THEN
      broken_id := r.id;
      RETURN NEXT;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
END $$;

-- Redaction list (F-07): sensitive fields never reach the audit payload in
-- plaintext — field name + content hash only.
CREATE OR REPLACE FUNCTION audit_redact(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  k text;
  redacted jsonb := doc;
  sensitive text[] := ARRAY['password_hash', 'tax_id', 'remittance', 'credentials_ref', 'ocr_payload'];
BEGIN
  IF doc IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH k IN ARRAY sensitive LOOP
    IF redacted ? k AND redacted->k IS DISTINCT FROM 'null'::jsonb THEN
      redacted := jsonb_set(redacted, ARRAY[k],
        jsonb_build_object('redacted', true,
                           'sha256', encode(digest(redacted->>k, 'sha256'), 'hex')));
    END IF;
  END LOOP;
  RETURN redacted;
END $$;

-- Generic row-change audit trigger, attached (in 014) to every financial and
-- access-control table. Captures changed fields only, redacted.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org uuid;
  v_before jsonb;
  v_after jsonb;
  v_old jsonb;
  v_new jsonb;
  v_subject uuid;
  k text;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) END;

  -- Resolve the owning organization for tables that don't carry it directly.
  v_org := coalesce(
    (coalesce(v_new, v_old) ->> 'organization_id')::uuid,
    CASE TG_TABLE_NAME
      WHEN 'invoice_line_items' THEN
        (SELECT organization_id FROM invoices WHERE id = (coalesce(v_new, v_old) ->> 'invoice_id')::uuid)
      WHEN 'payment_matches' THEN
        (SELECT organization_id FROM payments WHERE id = (coalesce(v_new, v_old) ->> 'payment_id')::uuid)
      WHEN 'bank_transactions' THEN
        (SELECT organization_id FROM bank_accounts WHERE id = (coalesce(v_new, v_old) ->> 'bank_account_id')::uuid)
      WHEN 'user_location_access' THEN
        (SELECT organization_id FROM user_org_roles WHERE id = (coalesce(v_new, v_old) ->> 'user_org_role_id')::uuid)
      WHEN 'role_permissions' THEN
        (SELECT organization_id FROM roles WHERE id = (coalesce(v_new, v_old) ->> 'role_id')::uuid)
    END,
    app_current_org(),
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  IF TG_OP = 'UPDATE' THEN
    -- Changed fields only.
    v_before := '{}'::jsonb;
    v_after := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_new -> k IS DISTINCT FROM v_old -> k AND k NOT IN ('updated_at') THEN
        v_before := v_before || jsonb_build_object(k, v_old -> k);
        v_after := v_after || jsonb_build_object(k, v_new -> k);
      END IF;
    END LOOP;
    IF v_before = '{}'::jsonb THEN
      RETURN NULL; -- no-op update: nothing to audit
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := v_new;
  ELSE
    v_before := v_old;
    v_after := NULL;
  END IF;

  v_subject := (coalesce(v_new, v_old) ->> 'id')::uuid;
  PERFORM write_audit_log(
    v_org,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_subject,
    audit_redact(v_before),
    audit_redact(v_after)
  );
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION install_audit_trigger(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
    tbl);
END $$;
