-- Make the exact Learning Deck revision part of Cloud Quest identity.
-- Apply with DATABASE_ADMIN_URL after migration 0019. Do not apply from app startup.

BEGIN;

-- Migration 0004 pins CHECK (schema_version = 1) inline, so it has to go
-- before the backfill writes version 2.
ALTER TABLE cloud_quest_progress
  ADD COLUMN IF NOT EXISTS learning_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS learning_deck_revision VARCHAR(120),
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_schema_version_check;

UPDATE cloud_quest_progress
SET
  schema_version = 2,
  learning_deck_id = 'mixed-trail',
  learning_deck_revision =
    'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92'
WHERE learning_deck_id IS NULL
   OR learning_deck_revision IS NULL;

ALTER TABLE cloud_quest_progress
  ALTER COLUMN schema_version SET DEFAULT 2,
  ALTER COLUMN learning_deck_id SET DEFAULT 'mixed-trail',
  ALTER COLUMN learning_deck_id SET NOT NULL,
  ALTER COLUMN learning_deck_revision SET DEFAULT
    'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92',
  ALTER COLUMN learning_deck_revision SET NOT NULL,
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_schema_version_check,
  ADD CONSTRAINT cloud_quest_progress_schema_version_check
    CHECK (schema_version IN (1, 2)),
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_learning_deck_check,
  -- Every published revision stays listed here; publishing a new revision
  -- ships a migration that extends this list.
  ADD CONSTRAINT cloud_quest_progress_learning_deck_check CHECK (
    (
      learning_deck_id = 'mixed-trail'
      AND learning_deck_revision =
        'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92'
    )
    OR (
      learning_deck_id = 'number-trail'
      AND learning_deck_revision =
        'deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105'
    )
  );

COMMIT;
