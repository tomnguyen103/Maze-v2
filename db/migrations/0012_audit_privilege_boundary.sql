-- Expand stage for the tamper-evident audit-chain privilege boundary.
--
-- Apply with DATABASE_ADMIN_URL. The application DATABASE_URL login must be
-- moved to the definer function before migration 0013 finalizes ownership.
-- Existing direct appends continue during this compatibility stage.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'echo_maze_audit_owner') THEN
    CREATE ROLE echo_maze_audit_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'echo_maze_runtime') THEN
    CREATE ROLE echo_maze_runtime NOLOGIN;
  END IF;
END;
$roles$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The migration credential remains the deliberate break-glass administrator.
GRANT echo_maze_audit_owner TO CURRENT_USER;
-- PostgreSQL requires a new function/table owner to hold CREATE on the
-- containing schema. Migration 0013 revokes it after every transfer.
GRANT USAGE, CREATE ON SCHEMA public TO echo_maze_audit_owner;

-- Existing rows remain verifier-compatible through their structured columns.
-- New rows retain the exact trusted-boundary byte payload used for hashing.
ALTER TABLE audit_events
  ADD COLUMN canonical_payload TEXT
  CHECK (
    canonical_payload IS NULL
    OR octet_length(canonical_payload) BETWEEN 2 AND 65536
  );

-- Trusted-boundary canonicalization: sorted object keys and no insignificant
-- whitespace. The exact result is stored with each new row.
CREATE FUNCTION canonical_audit_json(value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $canonical$
DECLARE
  kind TEXT;
  canonical TEXT;
BEGIN
  kind := jsonb_typeof(value);
  CASE kind
    WHEN 'object' THEN
      SELECT
        '{' || COALESCE(
          string_agg(
            to_json(object_key)::text || ':' ||
              public.canonical_audit_json(value->object_key),
            ',' ORDER BY object_key COLLATE "C"
          ),
          ''
        ) || '}'
      INTO canonical
      FROM jsonb_object_keys(value) AS keys(object_key);
    WHEN 'array' THEN
      SELECT
        '[' || COALESCE(
          string_agg(
            public.canonical_audit_json(element),
            ',' ORDER BY ordinality
          ),
          ''
        ) || ']'
      INTO canonical
      FROM jsonb_array_elements(value)
        WITH ORDINALITY AS elements(element, ordinality);
    ELSE
      canonical := value::text;
  END CASE;
  RETURN canonical;
END;
$canonical$;

ALTER FUNCTION canonical_audit_json(JSONB)
  OWNER TO echo_maze_audit_owner;
REVOKE ALL ON FUNCTION canonical_audit_json(JSONB) FROM PUBLIC;

CREATE FUNCTION append_audit_event(canonical_payload TEXT)
RETURNS TABLE (
  id BIGINT,
  created_at TIMESTAMPTZ,
  prev_hash CHAR(64),
  row_hash CHAR(64)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  payload JSONB;
  normalized_payload TEXT;
  previous_hash CHAR(64);
  next_hash CHAR(64);
  inserted_id BIGINT;
  inserted_at TIMESTAMPTZ;
BEGIN
  IF canonical_payload IS NULL OR octet_length(canonical_payload) > 65536 THEN
    RAISE EXCEPTION 'audit payload is invalid';
  END IF;

  BEGIN
    payload := canonical_payload::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'audit payload is not valid JSON';
  END;

  IF jsonb_typeof(payload) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 10
     OR NOT payload ?& ARRAY[
       'action',
       'actor_id',
       'actor_role',
       'after',
       'before',
       'created_at',
       'ip_hash',
       'request_id',
       'resource_id',
       'resource_type'
     ] THEN
    RAISE EXCEPTION 'audit payload shape is invalid';
  END IF;

  IF jsonb_typeof(payload->'action') <> 'string'
     OR jsonb_typeof(payload->'actor_id') <> 'string'
     OR jsonb_typeof(payload->'actor_role') <> 'string'
     OR jsonb_typeof(payload->'resource_type') <> 'string'
     OR jsonb_typeof(payload->'created_at') <> 'string'
     OR jsonb_typeof(payload->'before') NOT IN ('object', 'null')
     OR jsonb_typeof(payload->'after') NOT IN ('object', 'null')
     OR jsonb_typeof(payload->'resource_id') NOT IN ('string', 'null')
     OR jsonb_typeof(payload->'request_id') NOT IN ('string', 'null')
     OR jsonb_typeof(payload->'ip_hash') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'audit payload field types are invalid';
  END IF;

  IF payload->>'created_at' !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR to_char(
       (payload->>'created_at')::timestamptz AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     ) <> payload->>'created_at' THEN
    RAISE EXCEPTION 'audit payload timestamp is not canonical UTC';
  END IF;

  normalized_payload := public.canonical_audit_json(payload);

  PERFORM set_config('lock_timeout', '5000ms', true);
  SELECT head.row_hash
    INTO previous_hash
    FROM public.audit_chain_head AS head
    WHERE head.id = 1
    FOR UPDATE;

  IF previous_hash IS NULL THEN
    RAISE EXCEPTION 'audit chain head is unavailable';
  END IF;

  next_hash := encode(
    public.digest(previous_hash || normalized_payload, 'sha256'),
    'hex'
  );

  INSERT INTO public.audit_events (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    before,
    after,
    request_id,
    ip_hash,
    canonical_payload,
    created_at,
    prev_hash,
    row_hash
  )
  VALUES (
    payload->>'actor_id',
    payload->>'actor_role',
    payload->>'action',
    payload->>'resource_type',
    payload->>'resource_id',
    CASE
      WHEN payload->'before' = 'null'::jsonb THEN NULL
      ELSE payload->'before'
    END,
    CASE
      WHEN payload->'after' = 'null'::jsonb THEN NULL
      ELSE payload->'after'
    END,
    payload->>'request_id',
    payload->>'ip_hash',
    normalized_payload,
    (payload->>'created_at')::timestamptz,
    previous_hash,
    next_hash
  )
  RETURNING
    audit_events.id,
    audit_events.created_at
  INTO inserted_id, inserted_at;

  UPDATE public.audit_chain_head
    SET row_hash = next_hash, updated_at = now()
    WHERE audit_chain_head.id = 1;

  RETURN QUERY
    SELECT inserted_id, inserted_at, previous_hash, next_hash;
END;
$function$;

ALTER FUNCTION append_audit_event(TEXT) OWNER TO echo_maze_audit_owner;

GRANT SELECT, INSERT ON TABLE audit_events TO echo_maze_audit_owner;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO echo_maze_audit_owner;
GRANT SELECT, UPDATE ON TABLE audit_chain_head TO echo_maze_audit_owner;

-- Transitional execute keeps the new code working before the runtime login is
-- granted echo_maze_runtime. `npm run audit:provision` revokes this from PUBLIC
-- after migration 0013 and proves the final privileges in one transaction.
GRANT EXECUTE ON FUNCTION append_audit_event(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION append_audit_event(TEXT) TO echo_maze_runtime;
