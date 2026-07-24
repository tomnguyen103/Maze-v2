CREATE TABLE players (
  clerk_user_id TEXT PRIMARY KEY,
  username VARCHAR(20) NOT NULL,
  username_key VARCHAR(20) NOT NULL UNIQUE,
  explorer_palette TEXT NOT NULL DEFAULT 'teal'
    CHECK (explorer_palette IN ('teal', 'sunset', 'violet', 'gold')),
  playground_palette TEXT NOT NULL DEFAULT 'daylight'
    CHECK (playground_palette IN ('daylight', 'twilight', 'sea-glass', 'dusk')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE score_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  idempotency_key VARCHAR(128) NOT NULL,
  level_id TEXT NOT NULL,
  labyrinth_number SMALLINT NOT NULL CHECK (
    labyrinth_number BETWEEN 1 AND 20
  ),
  seed VARCHAR(32) NOT NULL,
  wardens_defeated SMALLINT NOT NULL CHECK (
    wardens_defeated BETWEEN 0 AND 20
  ),
  echoes_collected SMALLINT NOT NULL CHECK (
    echoes_collected BETWEEN 0 AND 20
  ),
  moves INTEGER NOT NULL CHECK (moves BETWEEN 1 AND 100000),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 86400000),
  score INTEGER NOT NULL CHECK (score BETWEEN 500 AND 3500),
  escaped BOOLEAN NOT NULL CHECK (escaped = TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX score_entries_leaderboard_idx
  ON score_entries (
    score DESC,
    labyrinth_number DESC,
    moves ASC,
    elapsed_ms ASC,
    created_at ASC
  )
  WHERE escaped = TRUE;
