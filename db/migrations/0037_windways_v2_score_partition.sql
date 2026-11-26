-- 0037: Shared scores accept the windways-v2 Trail Twist revision.
-- Apply with DATABASE_ADMIN_URL after migration 0036. Do not apply from app startup.
--
-- Problem: ADR 0053 starts every new Developing Run on windways-v2. Migration
-- 0019 allows only classic-v1 and windways-v1 in the Developing partition, so
-- each escaped windways-v2 Run fails its score insert.
--
-- Fix: replace score_entries_ruleset_partition_check with the same set plus
-- windways-v2. windways-v1 stays, because its scores keep their own partition
-- (ADR 0037) and v1 Runs still replay and recover (ADR 0026, ADR 0053).
--
-- DO NOT wrap this file in a transaction, and do not apply it with `psql -1`.
-- The ADD is NOT VALID, so it takes ACCESS EXCLUSIVE for a catalogue change
-- only. VALIDATE then scans under SHARE UPDATE EXCLUSIVE, and reads and writes
-- continue. The DROP and the ADD are one statement, so no moment exists
-- without the check. See docs/migration-safety.md.
--
-- Rollback (an agent never runs it): re-add the 0019 set with the same two
-- steps. A windways-v2 score row makes that VALIDATE fail, so move or delete
-- those rows first.

SET lock_timeout = '3s';

ALTER TABLE score_entries
  DROP CONSTRAINT IF EXISTS score_entries_ruleset_partition_check,
  ADD CONSTRAINT score_entries_ruleset_partition_check CHECK (
    (atlas_region_id = 'foundation' AND ruleset_revision IN (
      'classic-v1',
      'echo-hush-v1'
    ))
    OR (atlas_region_id = 'developing' AND ruleset_revision IN (
      'classic-v1',
      'windways-v1',
      'windways-v2'
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

ALTER TABLE score_entries
  VALIDATE CONSTRAINT score_entries_ruleset_partition_check;
