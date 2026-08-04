-- Make the exact Learning Deck revision part of Cloud Quest identity.
-- Apply with DATABASE_ADMIN_URL after migration 0019. Do not apply from app startup.
--
-- Re-authored online-safe alongside 0019 for A+ audit finding DB-03: the same
-- defect, in the same unapplied range, on `cloud_quest_progress` — the table
-- every Labyrinth boundary writes to. It used to run as one transaction
-- holding ACCESS EXCLUSIVE across an unbounded backfill and two unvalidated
-- CHECK constraints, which is a write outage for the length of the scan.
--
-- DO NOT wrap this file in a transaction, and do not apply it with `psql -1`:
-- the backfill has to commit as it goes and `VALIDATE CONSTRAINT` is
-- deliberately outside one. See docs/migration-safety.md.

SET lock_timeout = '3s';

-- Migration 0004 pins CHECK (schema_version = 1) inline, so it has to go
-- before the backfill writes version 2.
ALTER TABLE cloud_quest_progress
  ADD COLUMN IF NOT EXISTS learning_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS learning_deck_revision VARCHAR(120),
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_schema_version_check;

-- Batched and committing, for the same reason as 0019: one UPDATE across the
-- table holds a row lock on everything it has touched until the end, so a
-- Labyrinth boundary reached mid-migration waits for the whole backfill.
DO $$
DECLARE
  touched INTEGER;
BEGIN
  LOOP
    UPDATE cloud_quest_progress
    SET
      schema_version = 2,
      learning_deck_id = 'mixed-trail',
      learning_deck_revision =
        'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92'
    WHERE record_id IN (
      SELECT record_id
      FROM cloud_quest_progress
      WHERE learning_deck_id IS NULL
         OR learning_deck_revision IS NULL
      LIMIT 10000
    );
    GET DIAGNOSTICS touched = ROW_COUNT;
    EXIT WHEN touched = 0;
    COMMIT;
  END LOOP;
END
$$;

-- Defaults are catalogue-only on PostgreSQL 11+; `SET NOT NULL` waits for the
-- validated check below.
ALTER TABLE cloud_quest_progress
  ALTER COLUMN schema_version SET DEFAULT 2,
  ALTER COLUMN learning_deck_id SET DEFAULT 'mixed-trail',
  ALTER COLUMN learning_deck_revision SET DEFAULT
    'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92';

ALTER TABLE cloud_quest_progress
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_schema_version_check,
  ADD CONSTRAINT cloud_quest_progress_schema_version_check
    CHECK (schema_version IN (1, 2)) NOT VALID,
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
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_deck_not_null,
  ADD CONSTRAINT cloud_quest_progress_deck_not_null CHECK (
    learning_deck_id IS NOT NULL AND learning_deck_revision IS NOT NULL
  ) NOT VALID;

-- `lock_timeout` stays set across validation, for the reason 0019 records.
ALTER TABLE cloud_quest_progress
  VALIDATE CONSTRAINT cloud_quest_progress_schema_version_check;
ALTER TABLE cloud_quest_progress
  VALIDATE CONSTRAINT cloud_quest_progress_learning_deck_check;
ALTER TABLE cloud_quest_progress
  VALIDATE CONSTRAINT cloud_quest_progress_deck_not_null;

-- Brief, because the validated check above proves it.
ALTER TABLE cloud_quest_progress
  ALTER COLUMN learning_deck_id SET NOT NULL,
  ALTER COLUMN learning_deck_revision SET NOT NULL;

ALTER TABLE cloud_quest_progress
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_deck_not_null;

RESET lock_timeout;
