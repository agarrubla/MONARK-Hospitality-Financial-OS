-- 001 · Extensions and base helper functions.
-- PostgreSQL 16: uuidv7() is not built in (arrives in PG18), so we ship the
-- standard polyfill: UUIDv4 randomness with the top 48 bits replaced by a
-- unix-epoch-millisecond timestamp and the version bits set to 7. Time-ordered,
-- index-local, RFC 9562 compliant.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
LANGUAGE sql VOLATILE PARALLEL SAFE AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$;

-- updated_at maintenance (attached to every table except audit_logs).
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION install_touch_trigger(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
    tbl);
END $$;

-- Canonicalization shared by every import path (T-209 fix): trim, collapse
-- internal whitespace, uppercase. Also backs invoice_number_norm (T-406 fix).
CREATE OR REPLACE FUNCTION canonical_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT upper(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

-- Vendor-name normalization: lowercased, punctuation-stripped, collapsed.
CREATE OR REPLACE FUNCTION normalize_vendor_name(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(lower(btrim(coalesce(t, ''))), '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g')
$$;

-- The single dedupe-hash function for bank transactions, shared by sync, CSV
-- and manual paths (T-209: hashing must be identical everywhere).
CREATE OR REPLACE FUNCTION bank_txn_dedupe_hash(
  account uuid, posted date, amt numeric, descr text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(digest(
    account::text || '|' || posted::text || '|' || (amt::numeric(14,2))::text || '|' || canonical_text(descr),
    'sha256'), 'hex')
$$;

-- Request context, set per-connection/transaction by the API from the verified
-- JWT: SET LOCAL app.org_id / app.user_id / app.actor_type.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_actor_type() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(nullif(current_setting('app.actor_type', true), ''),
                  CASE WHEN app_current_user() IS NULL THEN 'system' ELSE 'user' END)
$$;
