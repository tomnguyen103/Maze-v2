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
  action TEXT NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before JSONB,
  after JSONB,
  request_id TEXT,
  ip_hash CHAR(64) CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  prev_hash CHAR(64) NOT NULL CHECK (prev_hash ~ '^[a-f0-9]{64}$'),
  row_hash CHAR(64) NOT NULL CHECK (row_hash ~ '^[a-f0-9]{64}$'),
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

INSERT INTO audit_chain_head (id, row_hash)
VALUES (1, repeat('0', 64));

-- Append-only enforcement. The revoke states the intent for non-owner roles;
-- the trigger holds even for the table owner, which is what the app connects as.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;

CREATE FUNCTION audit_events_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
