-- Milestone 5: Offline Run Continuity records.
-- Apply with DATABASE_ADMIN_URL after migration 0023. Do not apply from app startup.
--
-- Two records. A receipt is the server's own copy of what it signed for one
-- exact Run: the binding it will re-check on reconnect, and the two expiry
-- instants it computed. A pending submission is the idempotency ledger for the
-- reconnect itself, so a retried submission produces one effect however often
-- transport fails.
--
-- Neither record holds reviewed content. The receipt binds a content-pack
-- hash, never the pack; the submission stores the replayed outcome, never the
-- actions that produced it and never a selected option identifier. ADR 0035
-- keeps those in the device-local log that is deleted the moment verification
-- resolves either way.
--
-- Both expiry instants are stored rather than derived on read, because the
-- client's clock decides nothing here: server-side validation compares against
-- what the server itself wrote when it signed.
--
-- A Guest receipt has no player_id. Guest continuity is bound to the device
-- installation alone, so there is no account for it to cascade from and no
-- account it could leak into.

BEGIN;

CREATE TABLE offline_run_receipts (
  run_id TEXT PRIMARY KEY CHECK (run_id ~ '^[A-Za-z0-9_-]{12,128}$'),
  player_id TEXT
    REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  device_installation_hash CHAR(64) NOT NULL
    CHECK (device_installation_hash ~ '^[a-f0-9]{64}$'),
  seed VARCHAR(24) NOT NULL CHECK (seed ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  level_id TEXT NOT NULL CHECK (
    level_id IN ('bright-start', 'trail-scout', 'maze-master')
  ),
  labyrinth_number SMALLINT NOT NULL
    CHECK (labyrinth_number BETWEEN 1 AND 20),
  ruleset_revision VARCHAR(64) NOT NULL,
  content_pack_hash CHAR(64) NOT NULL
    CHECK (content_pack_hash ~ '^[a-f0-9]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  play_expires_at TIMESTAMPTZ NOT NULL,
  submission_expires_at TIMESTAMPTZ NOT NULL,
  -- Not equalities against an interval: interval arithmetic on a timestamptz
  -- is not immutable, so a CHECK cannot pin the exact seven and nine days.
  -- The signer computes those instants and its own tests pin them; this
  -- constrains the ordering no valid receipt can violate.
  CONSTRAINT offline_run_receipts_expiry_order CHECK (
    play_expires_at > issued_at
    AND submission_expires_at >= play_expires_at
  )
);

CREATE INDEX offline_run_receipts_expiry_idx
  ON offline_run_receipts (submission_expires_at);

CREATE TABLE offline_pending_submissions (
  idempotency_key VARCHAR(128) PRIMARY KEY
    CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  run_id TEXT NOT NULL
    REFERENCES offline_run_receipts(run_id) ON DELETE CASCADE,
  player_id TEXT
    REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  accepted BOOLEAN NOT NULL,
  -- Set only once the cloud write has completed. Without it the ledger
  -- cannot tell "recorded and applied" from "recorded, then the process
  -- died", and the retry would report success for a write that never
  -- happened.
  applied_at TIMESTAMPTZ,
  outcome VARCHAR(4) NOT NULL CHECK (outcome IN ('won', 'lost')),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 3500),
  moves INTEGER NOT NULL CHECK (moves BETWEEN 0 AND 100000),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 14400000),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX offline_pending_submissions_run_idx
  ON offline_pending_submissions (run_id);

-- Idempotency is per Run, not per key. Without this a client could submit
-- one Run twice under two keys and earn two cloud writes, which is exactly
-- what the idempotency key exists to prevent.
CREATE UNIQUE INDEX offline_pending_submissions_accepted_run_idx
  ON offline_pending_submissions (run_id)
  WHERE accepted;

ALTER TABLE offline_run_receipts OWNER TO echo_maze_tenant_owner;
ALTER TABLE offline_pending_submissions OWNER TO echo_maze_tenant_owner;

ALTER TABLE offline_run_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_run_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE offline_pending_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_pending_submissions FORCE ROW LEVEL SECURITY;

-- Tenant-owner ALL policies are the definer functions' working set.
CREATE POLICY offline_run_receipts_tenant_owner_write
  ON offline_run_receipts
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY offline_pending_submissions_tenant_owner_write
  ON offline_pending_submissions
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

-- The runtime reads its own rows directly so account-deletion verification can
-- assert their absence without a definer round trip. A Guest row has a NULL
-- player_id and matches no Explorer, which is what keeps it out of every
-- account's reach rather than in all of them.
CREATE POLICY offline_run_receipts_self_read
  ON offline_run_receipts
  FOR SELECT
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

CREATE POLICY offline_pending_submissions_self_read
  ON offline_pending_submissions
  FOR SELECT
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

REVOKE ALL ON TABLE offline_run_receipts
  FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE offline_pending_submissions
  FROM PUBLIC, echo_maze_runtime;

GRANT SELECT ON TABLE offline_run_receipts TO echo_maze_runtime;
GRANT SELECT ON TABLE offline_pending_submissions TO echo_maze_runtime;

-- Records what the server signed. Returns FALSE when a receipt for this Run
-- already exists: one Run may hold exactly one receipt, so a repeated
-- admission cannot mint a second and cannot extend the first.
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
  p_ruleset_revision TEXT
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
  -- The Explorer comes from the transaction, never from a parameter: a
  -- caller-supplied id would let one route bug mint a receipt bound to
  -- somebody else's account. A Guest supplies neither.
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  IF v_explorer IS NOT NULL AND NULLIF(p_player_id, '') IS DISTINCT FROM v_explorer THEN
    RAISE EXCEPTION 'An offline receipt may only be issued to the session Explorer.';
  END IF;
  IF p_issued_at IS NULL
     OR p_play_expires_at IS NULL
     OR p_submission_expires_at IS NULL THEN
    RAISE EXCEPTION 'Offline receipt needs all three instants.';
  END IF;

  INSERT INTO public.offline_run_receipts (
    run_id,
    player_id,
    device_installation_hash,
    seed,
    level_id,
    labyrinth_number,
    ruleset_revision,
    content_pack_hash,
    issued_at,
    play_expires_at,
    submission_expires_at
  )
  VALUES (
    p_run_id,
    NULLIF(p_player_id, ''),
    p_device_installation_hash,
    p_seed,
    p_level_id,
    p_labyrinth_number,
    p_ruleset_revision,
    p_content_pack_hash,
    p_issued_at,
    p_play_expires_at,
    p_submission_expires_at
  )
  ON CONFLICT (run_id) DO NOTHING
  RETURNING TRUE INTO v_issued;

  RETURN COALESCE(v_issued, FALSE);
END;
$$;

-- The binding the server re-checks on reconnect. Both expiry instants come
-- back as the server wrote them, along with whether each window is still open
-- as of the database's own clock, so no caller has to be trusted to compare.
CREATE FUNCTION read_offline_run_receipt(
  p_run_id TEXT,
  p_device_installation_hash CHAR
)
RETURNS TABLE (
  run_id TEXT,
  player_id TEXT,
  device_installation_hash CHAR,
  seed VARCHAR,
  level_id TEXT,
  labyrinth_number SMALLINT,
  ruleset_revision VARCHAR,
  content_pack_hash CHAR,
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
    receipt.device_installation_hash,
    receipt.seed,
    receipt.level_id,
    receipt.labyrinth_number,
    receipt.ruleset_revision,
    receipt.content_pack_hash,
    receipt.issued_at,
    receipt.play_expires_at,
    receipt.submission_expires_at,
    receipt.play_expires_at > NOW() AS play_open,
    receipt.submission_expires_at > NOW() AS submission_open
  FROM public.offline_run_receipts AS receipt
  WHERE receipt.run_id = p_run_id
    -- A signed-in Explorer reads only their own receipts. A Guest receipt
    -- has no owner to compare against, so it is reachable only by the
    -- device installation it was issued to.
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

-- The idempotency ledger. Reports 'recorded' only for the call that created
-- the row, so one key produces one effect however many times transport retries
-- it. A duplicate carries the outcome the ledger already holds, so the caller
-- reports what the server stored rather than what it just replayed.
CREATE FUNCTION record_offline_submission(
  p_idempotency_key TEXT,
  p_run_id TEXT,
  p_accepted BOOLEAN,
  p_outcome TEXT,
  p_score SMALLINT,
  p_moves INTEGER,
  p_elapsed_ms INTEGER
)
RETURNS TABLE (
  state TEXT,
  recorded_outcome TEXT,
  recorded_score SMALLINT,
  recorded_moves INTEGER,
  recorded_elapsed_ms INTEGER
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

  BEGIN
    INSERT INTO public.offline_pending_submissions (
      idempotency_key,
      run_id,
      player_id,
      accepted,
      outcome,
      score,
      moves,
      elapsed_ms
    )
    SELECT
      p_idempotency_key,
      p_run_id,
      receipt.player_id,
      p_accepted,
      p_outcome,
      p_score,
      p_moves,
      p_elapsed_ms
    FROM public.offline_run_receipts AS receipt
    WHERE receipt.run_id = p_run_id
      AND receipt.submission_expires_at > NOW()
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING TRUE INTO v_recorded;
  EXCEPTION
    WHEN unique_violation THEN
      -- offline_pending_submissions_accepted_run_idx, not the primary key: the
      -- Run already holds an accepted submission under a different key. One Run
      -- earns one cloud write, so that is a duplicate rather than an error.
      v_recorded := NULL;
  END;

  IF v_recorded THEN
    RETURN QUERY
      SELECT 'recorded'::TEXT, p_outcome, p_score, p_moves, p_elapsed_ms;
    RETURN;
  END IF;

  -- Nothing was written. That means either the key was already spent, or
  -- the receipt is gone or past its window — and the caller must not read
  -- the second as an acceptance, because doing so would report a result
  -- verified that the server never accepted.
  SELECT TRUE INTO v_live
  FROM public.offline_run_receipts AS receipt
  WHERE receipt.run_id = p_run_id
    AND receipt.submission_expires_at > NOW();

  -- IS NOT TRUE, not NOT: a SELECT that matches nothing leaves v_live NULL,
  -- and a NULL condition is not taken, so plain NOT would skip this branch in
  -- exactly the case it exists to catch.
  IF v_live IS NOT TRUE THEN
    RETURN QUERY
      SELECT 'no-live-receipt'::TEXT, NULL::TEXT, NULL::SMALLINT, NULL::INTEGER,
        NULL::INTEGER;
    RETURN;
  END IF;

  -- The row the ledger already holds for this Run. Reporting the replay just
  -- performed instead would tell the Explorer a score, move count, and elapsed
  -- time that cloud state never took: the idempotency key is client-chosen, so
  -- a second, different action log can arrive under the same key.
  --
  -- Scoped to p_run_id on both branches. The idempotency key is a global
  -- primary key, so matching it alone would hand this caller another Run's
  -- outcome — and this function runs with definer rights, so it is the only
  -- thing enforcing that boundary.
  SELECT submission.* INTO v_existing
  FROM public.offline_pending_submissions AS submission
  WHERE submission.run_id = p_run_id
    AND (
      submission.idempotency_key = p_idempotency_key
      OR submission.accepted
    )
  ORDER BY (submission.idempotency_key = p_idempotency_key) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- The key belongs to a different Run. Nothing was written and nothing of
    -- this Run's is readable, so the caller gets no outcome to report.
    RETURN QUERY
      SELECT 'duplicate'::TEXT, NULL::TEXT, NULL::SMALLINT, NULL::INTEGER,
        NULL::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'duplicate'::TEXT, v_existing.outcome::TEXT, v_existing.score,
      v_existing.moves, v_existing.elapsed_ms;
END;
$$;

-- Marks a recorded submission as applied, once the cloud write it
-- authorised has actually completed.
CREATE FUNCTION complete_offline_submission(p_idempotency_key TEXT)
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
    AND applied_at IS NULL
  RETURNING TRUE INTO v_applied;

  RETURN COALESCE(v_applied, FALSE);
END;
$$;

-- Whether a recorded submission still owes its cloud write. A retry uses
-- this to finish a first attempt that died between the two steps.
CREATE FUNCTION offline_submission_pending_apply(p_idempotency_key TEXT)
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
        AND submission.accepted
    ),
    FALSE
  );
$$;

-- Deletes receipts whose submission window has closed. A closed window means
-- the receipt can no longer authorize play or evidence a submission, so the
-- row is spent; its submissions cascade with it.
CREATE FUNCTION prune_offline_run_continuity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_pruned INTEGER;
BEGIN
  DELETE FROM public.offline_run_receipts
  WHERE submission_expires_at <= NOW();
  GET DIAGNOSTICS v_pruned = ROW_COUNT;

  RETURN v_pruned;
END;
$$;

ALTER FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_offline_run_receipt(TEXT, CHAR)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER
) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION prune_offline_run_continuity()
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_offline_run_receipt(TEXT, CHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION prune_offline_run_continuity() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION issue_offline_run_receipt(
  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_offline_run_receipt(TEXT, CHAR)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION record_offline_submission(
  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION prune_offline_run_continuity()
  TO echo_maze_runtime;

ALTER FUNCTION complete_offline_submission(TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION offline_submission_pending_apply(TEXT)
  OWNER TO echo_maze_tenant_owner;
REVOKE ALL ON FUNCTION complete_offline_submission(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION offline_submission_pending_apply(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_offline_submission(TEXT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION offline_submission_pending_apply(TEXT)
  TO echo_maze_runtime;

COMMIT;
