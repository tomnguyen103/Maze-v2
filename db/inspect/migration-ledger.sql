-- Migration ledger check: one row per migration 0018 to 0035 with `present`
-- true when the database holds the object that migration creates.
--
-- The check reads the system catalog only. It writes nothing, and the
-- transaction is read-only, so a mistaken edit fails instead of writing.
-- Run it with the runtime role or the owner role:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/inspect/migration-ledger.sql
--
-- A migration that only replaces an earlier object (0027, 0028) is checked by
-- a token of its new definition. A migration that runs outside one
-- transaction is checked by its last step, so a half-applied file reads
-- false. A concurrent index counts only when it is valid. Columns come from
-- pg_attribute because information_schema hides a column from a role
-- without a privilege on it. `present` false means pending. A mixed result
-- needs a review before plan Phase 4 step 4 applies anything.

BEGIN READ ONLY;

SELECT migration, present
FROM (
  VALUES
  -- Outside a transaction: the last step grants the runtime role access to
  -- the entries table after a REVOKE ALL. A database without the role reads
  -- false, because has_table_privilege raises an error for a missing role.
  ('0018_verified_daily_entries.sql',
    to_regclass('public.verified_daily_submissions') IS NOT NULL
      AND CASE
        WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname = 'echo_maze_runtime')
        THEN COALESCE(has_table_privilege('echo_maze_runtime',
          to_regclass('public.verified_daily_entries'), 'SELECT'), false)
        ELSE false
      END),
  -- Outside a transaction: the last step builds the concurrent index.
  ('0019_score_entry_ruleset_partitions.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_index
      WHERE indexrelid = to_regclass('public.score_entries_partition_ranking_idx')
        AND indisvalid)),
  -- Outside a transaction: the column is NOT NULL, and the last step drops
  -- the temporary check that proved it.
  ('0020_learning_deck_quest_identity.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = to_regclass('public.cloud_quest_progress')
        AND attname = 'learning_deck_revision'
        AND attnotnull AND NOT attisdropped)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = to_regclass('public.cloud_quest_progress')
          AND conname = 'cloud_quest_progress_deck_not_null')),
  ('0021_class_expeditions.sql',
    to_regclass('public.class_expeditions') IS NOT NULL),
  -- Outside a transaction: the last step validates the pace check.
  ('0022_access_settings_v2.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = to_regclass('public.explorer_access_settings')
        AND conname = 'explorer_access_settings_narration_pace_check'
        AND convalidated)),
  ('0023_daily_trail_constellation.sql',
    to_regclass('public.daily_trail_constellation_totals') IS NOT NULL),
  ('0024_offline_run_continuity.sql',
    to_regclass('public.offline_run_receipts') IS NOT NULL),
  ('0025_offline_run_continuity_forward.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = to_regclass('public.offline_pending_submissions')
        AND attname = 'replay_result' AND NOT attisdropped)),
  ('0026_echo_fossil_collections.sql',
    to_regclass('public.echo_fossil_collections') IS NOT NULL),
  -- Two transactions: the second one validates both deck checks.
  ('0027_echo_lens_learning_deck_revision.sql',
    (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conname IN ('cloud_quest_progress_learning_deck_check',
          'class_expeditions_learning_deck_check')
        AND convalidated
        AND pg_get_constraintdef(oid) LIKE '%af582a7a6a5cb39d1b949fa3de900644%') = 2),
  -- 0016 created this function with a student_name column; 0028 removes it.
  ('0028_classroom_expedition_debrief.sql',
    to_regprocedure('public.read_classroom_progress(text)') IS NOT NULL
      AND pg_get_function_result(
        to_regprocedure('public.read_classroom_progress(text)')
      ) NOT LIKE '%student_name%'),
  ('0029_class_expedition_constellation.sql',
    to_regprocedure('public.read_class_expedition_constellation(text, text)') IS NOT NULL),
  ('0030_domain_autojoin_and_leaderboard_index.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_index
      WHERE indexrelid = to_regclass('public.score_entries_player_partition_idx')
        AND indisvalid)),
  -- Outside a transaction: the last steps build the new index and drop the old one.
  ('0031_billing_mode.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_index
      WHERE indexrelid = to_regclass('public.lifetime_purchases_one_open_per_player_mode_idx')
        AND indisvalid)
      AND to_regclass('public.lifetime_purchases_one_open_per_player_idx') IS NULL),
  ('0032_financial_facts.sql',
    to_regclass('public.financial_facts') IS NOT NULL),
  ('0033_funnel_counts.sql',
    to_regclass('public.funnel_counts') IS NOT NULL),
  ('0034_funnel_counter_shards.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = to_regclass('public.funnel_counts')
        AND attname = 'shard' AND NOT attisdropped)),
  ('0035_financial_fact_partial_refunds.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = to_regclass('public.financial_facts')
        AND attname = 'partial_refunded_cents' AND NOT attisdropped))
) AS ledger (migration, present)
ORDER BY migration;

ROLLBACK;
