-- Forward compatibility for Offline Run Continuity.
-- Apply with DATABASE_ADMIN_URL after migration 0024. Do not apply from app startup.
--
-- Migration 0024 is already present in deployed databases. The receipt cursor,
-- replay snapshot, tenant predicates, and Quest identity therefore arrive here
-- instead of being retrofitted into an already-applied migration.

BEGIN;

-- A version remains replay-resolvable after it is demoted from the current
-- publication. `published_at` is historical publication evidence; `status`
-- identifies only the version currently served by ordinary reads.
ALTER TABLE question_versions
  DROP CONSTRAINT IF EXISTS question_versions_check;
ALTER TABLE question_versions
  DROP CONSTRAINT IF EXISTS question_versions_status_published_at_check;
ALTER TABLE question_versions
  ADD CONSTRAINT question_versions_status_published_at_check
  CHECK (status <> 'published' OR published_at IS NOT NULL);

ALTER TABLE offline_run_receipts
  ADD COLUMN IF NOT EXISTS quest_id TEXT,
  ADD COLUMN IF NOT EXISTS learning_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS learning_deck_revision TEXT,
  ADD COLUMN IF NOT EXISTS initial_question_ordinal INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_used_question_ids JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE offline_pending_submissions
  ADD COLUMN IF NOT EXISTS replay_result JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.offline_run_receipts'::regclass
      AND conname = 'offline_run_receipts_initial_question_ordinal_check'
  ) THEN
    ALTER TABLE public.offline_run_receipts
      ADD CONSTRAINT offline_run_receipts_initial_question_ordinal_check
      CHECK (initial_question_ordinal BETWEEN 0 AND 5000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.offline_run_receipts'::regclass
      AND conname = 'offline_run_receipts_initial_used_question_ids_check'
  ) THEN
    ALTER TABLE public.offline_run_receipts
      ADD CONSTRAINT offline_run_receipts_initial_used_question_ids_check
      CHECK (jsonb_typeof(initial_used_question_ids) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.offline_pending_submissions'::regclass
      AND conname = 'offline_pending_replay_result_shape'
  ) THEN
    ALTER TABLE public.offline_pending_submissions
      ADD CONSTRAINT offline_pending_replay_result_shape
      CHECK (replay_result IS NULL OR jsonb_typeof(replay_result) = 'object');
  END IF;

END;
$$;

DROP FUNCTION IF EXISTS issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
);
DROP FUNCTION IF EXISTS issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, JSONB
);

CREATE FUNCTION issue_offline_run_receipt(
  p_run_id TEXT,
  p_device_installation_hash CHAR,
  p_player_id TEXT,
  p_seed TEXT,
  p_labyrinth_number SMALLINT,
  p_level_id TEXT,
  p_content_pack_hash CHAR,
  p_issued_at TIMESTAMPTZ,
  p_play_expires_at TIMESTAMPTZ,
  p_submission_expires_at TIMESTAMPTZ,
  p_ruleset_revision TEXT,
  p_quest_id TEXT,
  p_learning_deck_id TEXT,
  p_learning_deck_revision TEXT,
  p_initial_question_ordinal INTEGER,
  p_initial_used_question_ids JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_issued BOOLEAN;
  v_explorer TEXT;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  IF v_explorer IS NOT NULL
     AND NULLIF(p_player_id, '') IS DISTINCT FROM v_explorer THEN
    RAISE EXCEPTION 'An offline receipt may only be issued to the session Explorer.';
  END IF;
  IF p_quest_id IS NULL OR p_quest_id !~ '^(quest|legacy)_[A-Za-z0-9_-]{7,92}$' THEN
    RAISE EXCEPTION 'Offline receipt needs a valid Quest ID.';
  END IF;
  IF p_issued_at IS NULL
     OR p_play_expires_at IS NULL
     OR p_submission_expires_at IS NULL THEN
    RAISE EXCEPTION 'Offline receipt needs all three instants.';
  END IF;

  INSERT INTO public.offline_run_receipts (
    run_id,
    player_id,
    quest_id,
    device_installation_hash,
    seed,
    level_id,
    labyrinth_number,
    ruleset_revision,
    content_pack_hash,
    learning_deck_id,
    learning_deck_revision,
    initial_question_ordinal,
    initial_used_question_ids,
    issued_at,
    play_expires_at,
    submission_expires_at
  )
  VALUES (
    p_run_id,
    NULLIF(p_player_id, ''),
    p_quest_id,
    p_device_installation_hash,
    p_seed,
    p_level_id,
    p_labyrinth_number,
    p_ruleset_revision,
    p_content_pack_hash,
    p_learning_deck_id,
    p_learning_deck_revision,
    COALESCE(p_initial_question_ordinal, 0),
    COALESCE(p_initial_used_question_ids, '[]'::JSONB),
    p_issued_at,
    p_play_expires_at,
    p_submission_expires_at
  )
  ON CONFLICT (run_id) DO NOTHING
  RETURNING TRUE INTO v_issued;

  RETURN COALESCE(v_issued, FALSE);
END;
$$;

DROP FUNCTION IF EXISTS read_offline_run_receipt(TEXT, CHAR);

CREATE FUNCTION read_offline_run_receipt(
  p_run_id TEXT,
  p_device_installation_hash CHAR
)
RETURNS TABLE (
  run_id TEXT,
  player_id TEXT,
  quest_id TEXT,
  device_installation_hash CHAR,
  seed VARCHAR,
  level_id TEXT,
  labyrinth_number SMALLINT,
  ruleset_revision VARCHAR,
  content_pack_hash CHAR,
  learning_deck_id TEXT,
  learning_deck_revision TEXT,
  initial_question_ordinal INTEGER,
  initial_used_question_ids JSONB,
  issued_at TIMESTAMPTZ,
  play_expires_at TIMESTAMPTZ,
  submission_expires_at TIMESTAMPTZ,
  play_open BOOLEAN,
  submission_open BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    receipt.run_id,
    receipt.player_id,
    receipt.quest_id,
    receipt.device_installation_hash,
    receipt.seed,
    receipt.level_id,
    receipt.labyrinth_number,
    receipt.ruleset_revision,
    receipt.content_pack_hash,
    receipt.learning_deck_id,
    receipt.learning_deck_revision,
    receipt.initial_question_ordinal,
    receipt.initial_used_question_ids,
    receipt.issued_at,
    receipt.play_expires_at,
    receipt.submission_expires_at,
    receipt.play_expires_at > NOW() AS play_open,
    receipt.submission_expires_at > NOW() AS submission_open
  FROM public.offline_run_receipts AS receipt
  WHERE receipt.run_id = p_run_id
    AND (
      receipt.player_id = NULLIF(
        current_setting('echo_maze.explorer_id', true),
        ''
      )
      OR (
        receipt.player_id IS NULL
        AND receipt.device_installation_hash = p_device_installation_hash
      )
    );
$$;

DROP FUNCTION IF EXISTS record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER
);
DROP FUNCTION IF EXISTS record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER, JSONB
);

CREATE FUNCTION record_offline_submission(
  p_idempotency_key TEXT,
  p_run_id TEXT,
  p_accepted BOOLEAN,
  p_outcome TEXT,
  p_score SMALLINT,
  p_moves INTEGER,
  p_elapsed_ms INTEGER,
  p_replay_result JSONB
)
RETURNS TABLE (
  state TEXT,
  recorded_idempotency_key TEXT,
  recorded_accepted BOOLEAN,
  recorded_outcome TEXT,
  recorded_score SMALLINT,
  recorded_moves INTEGER,
  recorded_elapsed_ms INTEGER,
  recorded_replay_result JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_recorded BOOLEAN;
  v_live BOOLEAN;
  v_existing public.offline_pending_submissions%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Offline submission outcome is invalid.';
  END IF;
  IF p_accepted AND p_replay_result IS NULL THEN
    RAISE EXCEPTION 'Accepted Offline submission needs a replay result.';
  END IF;

  BEGIN
    INSERT INTO public.offline_pending_submissions (
      idempotency_key,
      run_id,
      player_id,
      accepted,
      outcome,
      score,
      moves,
      elapsed_ms,
      replay_result
    )
    SELECT
      p_idempotency_key,
      p_run_id,
      receipt.player_id,
      p_accepted,
      p_outcome,
      p_score,
      p_moves,
      p_elapsed_ms,
      p_replay_result
    FROM public.offline_run_receipts AS receipt
    WHERE receipt.run_id = p_run_id
      AND receipt.player_id IS NOT DISTINCT FROM NULLIF(
        current_setting('echo_maze.explorer_id', true),
        ''
      )
      AND receipt.submission_expires_at > NOW()
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING TRUE INTO v_recorded;
  EXCEPTION
    WHEN unique_violation THEN
      v_recorded := NULL;
  END;

  IF v_recorded THEN
    RETURN QUERY
      SELECT 'recorded'::TEXT, p_idempotency_key, p_accepted, p_outcome,
        p_score, p_moves, p_elapsed_ms, p_replay_result;
    RETURN;
  END IF;

  SELECT TRUE INTO v_live
  FROM public.offline_run_receipts AS receipt
  WHERE receipt.run_id = p_run_id
    AND receipt.player_id IS NOT DISTINCT FROM NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND receipt.submission_expires_at > NOW();

  IF v_live IS NOT TRUE THEN
    RETURN QUERY
      SELECT 'no-live-receipt'::TEXT, NULL::TEXT, NULL::BOOLEAN, NULL::TEXT,
        NULL::SMALLINT, NULL::INTEGER, NULL::INTEGER, NULL::JSONB;
    RETURN;
  END IF;

  SELECT submission.* INTO v_existing
  FROM public.offline_pending_submissions AS submission
  WHERE submission.run_id = p_run_id
    AND submission.player_id IS NOT DISTINCT FROM NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND (
      submission.idempotency_key = p_idempotency_key
      OR submission.accepted
    )
  ORDER BY (submission.idempotency_key = p_idempotency_key) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT 'duplicate'::TEXT, NULL::TEXT, NULL::BOOLEAN, NULL::TEXT,
        NULL::SMALLINT, NULL::INTEGER, NULL::INTEGER, NULL::JSONB;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'duplicate'::TEXT, v_existing.idempotency_key,
      v_existing.accepted, v_existing.outcome::TEXT, v_existing.score,
      v_existing.moves, v_existing.elapsed_ms, v_existing.replay_result;
END;
$$;

CREATE OR REPLACE FUNCTION complete_offline_submission(p_idempotency_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applied BOOLEAN;
BEGIN
  UPDATE public.offline_pending_submissions
  SET applied_at = NOW()
  WHERE idempotency_key = p_idempotency_key
    AND player_id IS NOT DISTINCT FROM NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND applied_at IS NULL
  RETURNING TRUE INTO v_applied;

  RETURN COALESCE(v_applied, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION offline_submission_pending_apply(p_idempotency_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT submission.applied_at IS NULL
      FROM public.offline_pending_submissions AS submission
      WHERE submission.idempotency_key = p_idempotency_key
        AND submission.player_id IS NOT DISTINCT FROM NULLIF(
          current_setting('echo_maze.explorer_id', true),
          ''
        )
        AND submission.accepted
    ),
    FALSE
  );
$$;

ALTER FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB
) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_offline_run_receipt(TEXT, CHAR)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER, JSONB
) OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_offline_run_receipt(TEXT, CHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_offline_submission(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION offline_submission_pending_apply(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_offline_run_receipt(TEXT, CHAR)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER, JSONB
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION complete_offline_submission(TEXT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION offline_submission_pending_apply(TEXT)
  TO echo_maze_runtime;

COMMIT;
