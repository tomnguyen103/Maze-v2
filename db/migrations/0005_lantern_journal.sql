CREATE TABLE learning_journals (
  clerk_user_id TEXT PRIMARY KEY
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE,
  journal JSONB NOT NULL DEFAULT '{"version":1,"events":[]}'::jsonb
    CHECK (journal -> 'version' = '1'::jsonb)
    CHECK (jsonb_typeof(journal->'events') = 'array')
    CHECK (jsonb_array_length(journal->'events') <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
