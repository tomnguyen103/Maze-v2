CREATE TABLE cloud_quest_progress (
  clerk_user_id TEXT PRIMARY KEY
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE,
  schema_version SMALLINT NOT NULL DEFAULT 1
    CHECK (schema_version = 1),
  quest_id VARCHAR(100) NOT NULL CHECK (
    quest_id ~ '^(quest|legacy)_[A-Za-z0-9_-]{7,92}$'
  ),
  level_id TEXT NOT NULL CHECK (
    level_id IN ('bright-start', 'trail-scout', 'maze-master')
  ),
  labyrinth_number SMALLINT NOT NULL CHECK (
    labyrinth_number BETWEEN 1 AND 20
  ),
  completed_labyrinths SMALLINT NOT NULL CHECK (
    completed_labyrinths BETWEEN 0 AND 20
  ),
  used_map_fingerprints JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (
    jsonb_typeof(used_map_fingerprints) = 'array'
    AND jsonb_array_length(used_map_fingerprints) <= 1000
  ),
  used_question_ids JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (
    jsonb_typeof(used_question_ids) = 'array'
    AND jsonb_array_length(used_question_ids) <= 5000
  ),
  next_question_ordinal INTEGER NOT NULL CHECK (
    next_question_ordinal BETWEEN 0 AND 100000
  ),
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (
    (
      complete = TRUE
      AND labyrinth_number = 20
      AND completed_labyrinths = 20
    )
    OR (
      complete = FALSE
      AND completed_labyrinths = labyrinth_number - 1
    )
  ),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
