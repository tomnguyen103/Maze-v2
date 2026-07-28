CREATE TABLE explorer_access_settings (
  clerk_user_id TEXT PRIMARY KEY,
  schema_version SMALLINT NOT NULL DEFAULT 1
    CHECK (schema_version = 1),
  high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
  large_marks BOOLEAN NOT NULL DEFAULT FALSE,
  reader_friendly_questions BOOLEAN NOT NULL DEFAULT FALSE,
  reduced_effects BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1
    CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
