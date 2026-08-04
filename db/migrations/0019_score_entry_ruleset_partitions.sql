-- Partition ordinary shared scores by exact Atlas Region and ruleset.
-- Apply with DATABASE_ADMIN_URL after migration 0018. Do not apply from app startup.
--
-- Re-authored online-safe for A+ audit finding DB-03. `score_entries` is the
-- table the anonymous Global Scoreboard reads and every escaped Run writes, so
-- nothing here may hold ACCESS EXCLUSIVE across a scan of it. This file is
-- above the applied boundary — 0001 through 0017 are applied, 0018 onward are
-- not — so it is corrected in place rather than superseded.
--
-- DO NOT wrap this file in a transaction, and do not apply it with `psql -1`:
-- `CREATE INDEX CONCURRENTLY` and `VALIDATE CONSTRAINT` are deliberately
-- outside one, and the batched backfill has to commit as it goes.
--
-- Every statement here that takes ACCESS EXCLUSIVE takes it briefly, so a
-- lock_timeout turns "queued behind a long reader" into a clean failure
-- rather than an outage. See docs/migration-safety.md.

SET lock_timeout = '3s';

-- Nullable and without a default: a catalogue-only change on PostgreSQL 11+,
-- so this does not rewrite the table.
--
-- `IF NOT EXISTS` here, and `DROP CONSTRAINT IF EXISTS` before every ADD
-- below, because the file is deliberately not one transaction: an interrupted
-- apply has to be restartable from the top rather than needing a repair
-- written by hand under pressure.
ALTER TABLE score_entries
  ADD COLUMN IF NOT EXISTS atlas_region_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS ruleset_revision VARCHAR(32);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM score_entries
    WHERE labyrinth_number NOT BETWEEN 1 AND 20
  ) THEN
    RAISE EXCEPTION
      'Invalid legacy score_entries.labyrinth_number outside 1-20';
  END IF;
END
$$;

-- Backfill in bounded batches, committing between them. A single UPDATE over
-- the whole table holds a row lock on everything it has touched until it
-- commits, so an escaped Run submitted mid-migration waits for the entire
-- backfill. Ten thousand rows at a time keeps that wait short; the loop ends
-- when a pass changes nothing.
DO $$
DECLARE
  touched INTEGER;
BEGIN
  LOOP
    UPDATE score_entries
    SET
      atlas_region_id = CASE
        WHEN labyrinth_number BETWEEN 1 AND 4 THEN 'foundation'
        WHEN labyrinth_number BETWEEN 5 AND 8 THEN 'developing'
        WHEN labyrinth_number BETWEEN 9 AND 12 THEN 'capable'
        WHEN labyrinth_number BETWEEN 13 AND 16 THEN 'advanced'
        WHEN labyrinth_number BETWEEN 17 AND 20 THEN 'mastery'
      END,
      ruleset_revision = 'classic-v1'
    WHERE id IN (
      SELECT id
      FROM score_entries
      WHERE atlas_region_id IS NULL
         OR ruleset_revision IS NULL
      LIMIT 10000
    );
    GET DIAGNOSTICS touched = ROW_COUNT;
    EXIT WHEN touched = 0;
    COMMIT;
  END LOOP;
END
$$;

-- NOT VALID first. Adding the constraint is a brief catalogue change that
-- takes effect for every new and updated row immediately; validating it is
-- the part that scans, and validation takes only SHARE UPDATE EXCLUSIVE, so
-- reads and writes continue throughout.
ALTER TABLE score_entries
  DROP CONSTRAINT IF EXISTS score_entries_region_labyrinth_check,
  DROP CONSTRAINT IF EXISTS score_entries_ruleset_partition_check,
  ADD CONSTRAINT score_entries_region_labyrinth_check CHECK (
    (atlas_region_id = 'foundation' AND labyrinth_number BETWEEN 1 AND 4)
    OR (atlas_region_id = 'developing' AND labyrinth_number BETWEEN 5 AND 8)
    OR (atlas_region_id = 'capable' AND labyrinth_number BETWEEN 9 AND 12)
    OR (atlas_region_id = 'advanced' AND labyrinth_number BETWEEN 13 AND 16)
    OR (atlas_region_id = 'mastery' AND labyrinth_number BETWEEN 17 AND 20)
  ) NOT VALID,
  ADD CONSTRAINT score_entries_ruleset_partition_check CHECK (
    (atlas_region_id = 'foundation' AND ruleset_revision IN (
      'classic-v1',
      'echo-hush-v1'
    ))
    OR (atlas_region_id = 'developing' AND ruleset_revision IN (
      'classic-v1',
      'windways-v1'
    ))
    OR (atlas_region_id = 'capable' AND ruleset_revision IN (
      'classic-v1',
      'echo-bridges-v1'
    ))
    OR (atlas_region_id = 'advanced' AND ruleset_revision IN (
      'classic-v1',
      'tide-doors-v1'
    ))
    OR (atlas_region_id = 'mastery' AND ruleset_revision IN (
      'classic-v1',
      'warden-bells-v1'
    ))
  ) NOT VALID;

-- Also NOT VALID, and this one is not decoration: a validated
-- `CHECK (col IS NOT NULL)` is the proof that lets `SET NOT NULL` below skip
-- its own full scan. PostgreSQL 12 and later recognise it.
ALTER TABLE score_entries
  DROP CONSTRAINT IF EXISTS score_entries_partition_not_null,
  ADD CONSTRAINT score_entries_partition_not_null CHECK (
    atlas_region_id IS NOT NULL AND ruleset_revision IS NOT NULL
  ) NOT VALID;

-- `lock_timeout` stays set across validation. It bounds how long a statement
-- waits for a lock, not how long it runs, so keeping it is strictly safer:
-- validation still needs SHARE UPDATE EXCLUSIVE, and an ANALYZE or another
-- DDL holding a conflicting lock should fail this fast rather than queue.
ALTER TABLE score_entries
  VALIDATE CONSTRAINT score_entries_region_labyrinth_check;
ALTER TABLE score_entries
  VALIDATE CONSTRAINT score_entries_ruleset_partition_check;
ALTER TABLE score_entries
  VALIDATE CONSTRAINT score_entries_partition_not_null;

-- Brief, because the validated CHECK above already proves it.
ALTER TABLE score_entries
  ALTER COLUMN atlas_region_id SET NOT NULL,
  ALTER COLUMN ruleset_revision SET NOT NULL;

-- Now redundant with the column constraints, and a redundant constraint is
-- one more expression every write evaluates.
ALTER TABLE score_entries
  DROP CONSTRAINT IF EXISTS score_entries_partition_not_null;

RESET lock_timeout;

-- CONCURRENTLY: a plain CREATE INDEX blocks every write to `score_entries`
-- for the whole build, and this is the index the public Scoreboard reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS score_entries_partition_ranking_idx
  ON score_entries (
    atlas_region_id,
    ruleset_revision,
    score DESC,
    labyrinth_number DESC,
    moves ASC,
    elapsed_ms ASC,
    created_at ASC
  )
  WHERE escaped = TRUE AND classroom_id IS NULL;
