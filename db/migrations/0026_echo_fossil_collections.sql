-- P1.1: personal, reviewed Echo Fossils for the active Quest.
-- Apply with DATABASE_ADMIN_URL after migration 0025. Do not apply from app startup.

BEGIN;

CREATE TABLE echo_fossil_collections (
  player_id TEXT PRIMARY KEY
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL
    CHECK (quest_id ~ '^quest_[a-z0-9_-]{7,92}$'),
  collection JSONB NOT NULL CHECK (
    jsonb_typeof(collection) = 'object'
    AND collection->>'version' = '1'
    AND jsonb_typeof(collection->'fossils') = 'array'
    AND jsonb_array_length(collection->'fossils') <= 40
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE echo_fossil_collections
  OWNER TO echo_maze_tenant_owner;

ALTER TABLE echo_fossil_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE echo_fossil_collections FORCE ROW LEVEL SECURITY;

CREATE POLICY echo_fossil_collections_explorer_scope
  ON echo_fossil_collections
  FOR ALL
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND NULLIF(
      current_setting('echo_maze.classroom_id', true),
      ''
    ) IS NULL
  )
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND NULLIF(
      current_setting('echo_maze.classroom_id', true),
      ''
    ) IS NULL
  );

REVOKE ALL ON TABLE echo_fossil_collections
  FROM PUBLIC, echo_maze_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE echo_fossil_collections TO echo_maze_runtime;

COMMIT;
