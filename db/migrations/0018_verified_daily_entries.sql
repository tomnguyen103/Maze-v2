-- Verified current-UTC Daily ranking through server-authoritative replay.
-- Apply with DATABASE_ADMIN_URL after migration 0017.

CREATE TABLE verified_daily_submissions (
  player_id TEXT NOT NULL
    REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  daily_date DATE NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  daily_version SMALLINT NOT NULL DEFAULT 1
    CHECK (daily_version = 1),
  score SMALLINT NOT NULL CHECK (score BETWEEN 500 AND 3500),
  wardens_defeated SMALLINT NOT NULL
    CHECK (wardens_defeated BETWEEN 0 AND 20),
  echoes_collected SMALLINT NOT NULL
    CHECK (echoes_collected BETWEEN 0 AND 20),
  moves INTEGER NOT NULL CHECK (moves BETWEEN 1 AND 100000),
  elapsed_ms INTEGER NOT NULL
    CHECK (elapsed_ms BETWEEN 0 AND 14400000),
  best_result VARCHAR(9) NOT NULL
    CHECK (best_result IN ('created', 'improved', 'unchanged')),
  response_score SMALLINT NOT NULL
    CHECK (response_score BETWEEN 500 AND 3500),
  response_moves INTEGER NOT NULL
    CHECK (response_moves BETWEEN 1 AND 100000),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, daily_date, idempotency_key)
);

CREATE TABLE verified_daily_entries (
  player_id TEXT NOT NULL
    REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  daily_date DATE NOT NULL,
  daily_version SMALLINT NOT NULL DEFAULT 1
    CHECK (daily_version = 1),
  source_idempotency_key VARCHAR(128) NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 500 AND 3500),
  wardens_defeated SMALLINT NOT NULL
    CHECK (wardens_defeated BETWEEN 0 AND 20),
  echoes_collected SMALLINT NOT NULL
    CHECK (echoes_collected BETWEEN 0 AND 20),
  moves INTEGER NOT NULL CHECK (moves BETWEEN 1 AND 100000),
  elapsed_ms INTEGER NOT NULL
    CHECK (elapsed_ms BETWEEN 0 AND 14400000),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, daily_date),
  FOREIGN KEY (player_id, daily_date, source_idempotency_key)
    REFERENCES verified_daily_submissions (
      player_id,
      daily_date,
      idempotency_key
    )
);

CREATE INDEX verified_daily_entries_ranking_idx
  ON verified_daily_entries (
    daily_date,
    score DESC,
    moves ASC,
    achieved_at ASC,
    player_id ASC
  );

ALTER TABLE verified_daily_submissions
  OWNER TO echo_maze_tenant_owner;
ALTER TABLE verified_daily_entries
  OWNER TO echo_maze_tenant_owner;

ALTER TABLE verified_daily_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_daily_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE verified_daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_daily_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY verified_daily_submissions_self_select
  ON verified_daily_submissions
  FOR SELECT
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

CREATE POLICY verified_daily_submissions_self_insert
  ON verified_daily_submissions
  FOR INSERT
  TO echo_maze_runtime
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

CREATE POLICY verified_daily_entries_public_read
  ON verified_daily_entries
  FOR SELECT
  TO echo_maze_runtime
  USING (TRUE);

CREATE POLICY verified_daily_entries_self_insert
  ON verified_daily_entries
  FOR INSERT
  TO echo_maze_runtime
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

CREATE POLICY verified_daily_entries_self_update
  ON verified_daily_entries
  FOR UPDATE
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  )
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

REVOKE ALL ON TABLE verified_daily_submissions
  FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE verified_daily_entries
  FROM PUBLIC, echo_maze_runtime;
GRANT SELECT, INSERT ON TABLE verified_daily_submissions
  TO echo_maze_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE verified_daily_entries
  TO echo_maze_runtime;
