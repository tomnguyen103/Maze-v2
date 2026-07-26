CREATE TABLE player_access (
  clerk_user_id TEXT PRIMARY KEY,
  free_runs_used SMALLINT NOT NULL DEFAULT 0
    CHECK (free_runs_used BETWEEN 0 AND 3),
  membership_state TEXT NOT NULL DEFAULT 'none'
    CHECK (
      membership_state IN ('none', 'active', 'refunded', 'disputed')
    ),
  entitlement_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE run_access_grants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id TEXT NOT NULL
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE,
  run_id VARCHAR(128) NOT NULL,
  seed VARCHAR(24) NOT NULL,
  level_id TEXT NOT NULL CHECK (
    level_id IN ('bright-start', 'trail-scout', 'maze-master')
  ),
  labyrinth_number SMALLINT NOT NULL CHECK (
    labyrinth_number BETWEEN 1 AND 20
  ),
  grant_source TEXT NOT NULL CHECK (
    grant_source IN ('free', 'lifetime')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, run_id)
);

CREATE INDEX run_access_grants_player_created_idx
  ON run_access_grants (player_id, created_at DESC);
