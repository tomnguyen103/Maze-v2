-- 0034: Funnel Count shards. Each counter splits into 16 shard rows, so a busy
-- key never makes a bump wait for an open transaction.
--
-- Problem: a bump runs inside the transaction of the write that fires it. The
-- counter row lock stays until that transaction commits. A second bump on the
-- same key waits 200 ms and then drops with a warning.
--
-- Fix: a bump takes the first shard whose advisory transaction lock is free.
-- A free lock means no open bump holds the row. A fallback bump writes a
-- shard without its lock, so a later bump on that shard can still wait 200 ms
-- and drop. When all 16 shards are busy, the bump upserts the start shard and
-- the 200 ms wait applies, as in 0033. A dropped count stays a warning, so
-- each count is still a lower bound.
--
-- Each session starts at the shard pg_backend_pid() % 16. A transaction then
-- reuses its shard, because advisory locks are re-entrant.
--
-- Both functions pin search_path to pg_catalog, pg_temp. Every name in the
-- bodies is schema-qualified, so a role with CREATE on public cannot plant
-- an overload that a definer function runs.
--
-- The two-int advisory lock keyspace is separate from the one-bigint locks of
-- other migrations. A hash collision only makes a free shard look busy.
--
-- The activation trigger now runs the stamp UPDATE and the bump in one block
-- that turns an error into a warning. A failure there never fails the Grant.
--
-- One transaction with a short lock wait. Every statement survives a re-run.
-- Existing rows become shard 0. The file does not edit 0033.
--
-- Rollback (an agent never runs it): add the shard rows of each key into the
-- shard 0 row, delete the other shard rows, restore the four-column primary
-- key (day, metric, campaign, mode), drop the shard column, and run the
-- function section of 0033 again.

BEGIN;

SET LOCAL lock_timeout = '3s';

-- A non-superuser can give an object only to an owner with CREATE on the
-- schema. 0014 revokes that privilege, so this file grants it for the
-- ownership transfers and revokes it again before COMMIT.
GRANT CREATE ON SCHEMA public TO echo_maze_tenant_owner;

ALTER TABLE funnel_counts
  ADD COLUMN IF NOT EXISTS shard SMALLINT NOT NULL DEFAULT 0
    CHECK (shard BETWEEN 0 AND 15);

ALTER TABLE funnel_counts
  DROP CONSTRAINT IF EXISTS funnel_counts_pkey,
  ADD CONSTRAINT funnel_counts_pkey
    PRIMARY KEY (day, metric, campaign, mode, shard);

-- The one counter write. The inner block turns a failure into a warning, so
-- analytics never blocks an account, a Run Grant, a Checkout or a visit. A
-- wait for a busy counter row over 200 ms is a failure too.
CREATE OR REPLACE FUNCTION bump_funnel_count(
  p_metric TEXT,
  p_campaign TEXT,
  p_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '200ms'
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'UTC')::date;
  v_start INT := pg_backend_pid() % 16;
  v_shard INT;
BEGIN
  BEGIN
    FOR v_step IN 0..15 LOOP
      v_shard := (v_start + v_step) % 16;
      EXIT WHEN pg_try_advisory_xact_lock(
        hashtext('funnel_counts'),
        hashtext(concat_ws(
          '|', to_char(v_day, 'YYYY-MM-DD'), p_metric, p_campaign, p_mode, v_shard
        ))
      );
      v_shard := NULL;
    END LOOP;
    INSERT INTO public.funnel_counts (day, metric, campaign, mode, shard, count)
    VALUES (v_day, p_metric, p_campaign, p_mode, COALESCE(v_shard, v_start), 1)
    ON CONFLICT (day, metric, campaign, mode, shard)
      DO UPDATE SET count = public.funnel_counts.count + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'funnel count dropped: %', SQLSTATE;
  END;
END
$$;

-- The first Personal Run Grant activates an Explorer. The update stamps the
-- earliest Grant, so an Explorer with a Grant from before 0033 gets that time
-- and counts nothing. The stamp and the bump share one block: an error in
-- either becomes a warning, and the Grant succeeds.
CREATE OR REPLACE FUNCTION activate_personal_run()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  BEGIN
    UPDATE public.player_access
    SET first_run_grant_at = (
      SELECT min(created_at) FROM public.run_access_grants
      WHERE player_id = NEW.player_id
    )
    WHERE clerk_user_id = NEW.player_id
      AND first_run_grant_at IS NULL;
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.run_access_grants
      WHERE player_id = NEW.player_id AND id <> NEW.id
    ) THEN
      PERFORM public.bump_funnel_count('personal_run_activated', '', '');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'funnel count dropped: %', SQLSTATE;
  END;
  RETURN NULL;
END
$$;

ALTER FUNCTION bump_funnel_count(TEXT, TEXT, TEXT) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION activate_personal_run() OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION bump_funnel_count(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_personal_run() FROM PUBLIC;

REVOKE CREATE ON SCHEMA public FROM echo_maze_tenant_owner;

COMMIT;
