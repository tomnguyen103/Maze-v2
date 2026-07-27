-- Tamper-evident audit log.
--
-- Every mutating API writes exactly one append-only row. Each row carries the
-- previous row's hash, so removing, reordering, or editing any row breaks the
-- chain and scripts/verify-audit-chain.mjs reports the first broken id.
--
-- Privacy: never store a raw IP address. ip_hash is
-- sha256(address + ':' + UTC date + ':' + AUDIT_IP_SALT), rotated daily, which
-- follows the Lantern Journal minimization precedent.

CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'player'
    CHECK (actor_role IN ('admin', 'moderator', 'player', 'system')),
  -- Deliberately unconstrained: recordAudit swallows write errors, so a CHECK
  -- on the action name would silently drop rows for any future action.
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before JSONB,
  after JSONB,
  request_id TEXT,
  ip_hash CHAR(64) CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  prev_hash CHAR(64) NOT NULL CHECK (prev_hash ~ '^[a-f0-9]{64}$'),
  row_hash CHAR(64) NOT NULL CHECK (row_hash ~ '^[a-f0-9]{64}$'),
  -- The default is a safety net only. Rows not written by appendAudit have no
  -- matching row_hash and will read as a chain break, which is the intent.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, created_at DESC);
CREATE INDEX audit_events_resource_idx
  ON audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX audit_events_action_idx ON audit_events (action, created_at DESC);

-- Single-row chain head. Appends take FOR UPDATE on it, so concurrent writers
-- serialize instead of racing to read the same latest row_hash.
CREATE TABLE audit_chain_head (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  row_hash CHAR(64) NOT NULL CHECK (row_hash ~ '^[a-f0-9]{64}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row rewritten on every append. A low fillfactor keeps the new tuple
-- version on the same page, and aggressive autovacuum stops dead tuples from
-- accumulating under sustained write volume.
ALTER TABLE audit_chain_head SET (
  fillfactor = 50,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 100
);

INSERT INTO audit_chain_head (id, row_hash)
VALUES (1, repeat('0', 64));

-- Append-only enforcement. The revoke states the intent for non-owner roles;
-- the triggers hold even for the table owner, which is what the app connects as.
-- UPDATE and DELETE are blocked per row; TRUNCATE needs its own statement-level
-- trigger, because TRUNCATE never fires row triggers.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;

CREATE FUNCTION audit_events_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
