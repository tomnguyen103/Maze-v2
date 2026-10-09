-- Migration ledger check: one row per migration 0018 to 0033 with `present`
-- true when the database holds the object that migration creates.
--
-- The check reads the system catalog only. It writes nothing, and the
-- transaction is read-only, so a mistaken edit fails instead of writing.
-- Run it with the runtime role or the owner role:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/inspect/migration-ledger.sql
--
-- A migration that only replaces an earlier object (0027, 0028) is checked by
-- a token of its new definition. `present` false means pending. A mixed
-- result needs a review before plan Phase 4 step 4 applies anything.

BEGIN READ ONLY;

SELECT migration, present
FROM (
  VALUES
  ('0018_verified_daily_entries.sql',
    to_regclass('public.verified_daily_submissions') IS NOT NULL),
  ('0019_score_entry_ruleset_partitions.sql',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'score_entries'
        AND column_name = 'atlas_region_id')),
  ('0020_learning_deck_quest_identity.sql',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cloud_quest_progress'
        AND column_name = 'learning_deck_revision')),
  ('0021_class_expeditions.sql',
    to_regclass('public.class_expeditions') IS NOT NULL),
  ('0022_access_settings_v2.sql',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'explorer_access_settings'
        AND column_name = 'trail_compass_enabled')),
  ('0023_daily_trail_constellation.sql',
    to_regclass('public.daily_trail_constellation_totals') IS NOT NULL),
  ('0024_offline_run_continuity.sql',
    to_regclass('public.offline_run_receipts') IS NOT NULL),
  ('0025_offline_run_continuity_forward.sql',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offline_pending_submissions'
        AND column_name = 'replay_result')),
  ('0026_echo_fossil_collections.sql',
    to_regclass('public.echo_fossil_collections') IS NOT NULL),
  ('0027_echo_lens_learning_deck_revision.sql',
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conname = 'cloud_quest_progress_learning_deck_check'
        AND pg_get_constraintdef(oid) LIKE '%af582a7a6a5cb39d1b949fa3de900644%')),
  -- 0016 created this function with a student_name column; 0028 removes it.
  ('0028_classroom_expedition_debrief.sql',
    to_regprocedure('public.read_classroom_progress(text)') IS NOT NULL
      AND pg_get_function_result(
        to_regprocedure('public.read_classroom_progress(text)')
      ) NOT LIKE '%student_name%'),
  ('0029_class_expedition_constellation.sql',
    to_regprocedure('public.read_class_expedition_constellation(text, text)') IS NOT NULL),
  ('0030_domain_autojoin_and_leaderboard_index.sql',
    to_regclass('public.score_entries_player_partition_idx') IS NOT NULL),
  ('0031_billing_mode.sql',
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lifetime_purchases'
        AND column_name = 'billing_mode')),
  ('0032_financial_facts.sql',
    to_regclass('public.financial_facts') IS NOT NULL),
  ('0033_funnel_counts.sql',
    to_regclass('public.funnel_counts') IS NOT NULL)
) AS ledger (migration, present)
ORDER BY migration;

ROLLBACK;
