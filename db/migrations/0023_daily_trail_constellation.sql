-- Milestone 5: Daily Trail Constellation aggregates.
-- Apply with DATABASE_ADMIN_URL after migration 0022. Do not apply from app startup.
--
-- Two classes of row live here. Counters hold how many distinct Explorers
-- touched a Labyrinth position on one canonical UTC Daily, split by marker
-- kind. Contribution receipts record only that an Explorer contributed to one
-- canonical UTC Daily; they carry no position, no ordering, no timing, no
-- answer, and no username, so no receipt can be joined back into a path.
--
-- Every counter carries two totals. `contributor_count` is live and moves on
-- each accepted escape; `published_count` is the snapshot the projection is
-- allowed to serve, and only advances when a whole batch of new contributors
-- has arrived. Freezing the served figure between batches is what stops a
-- single new escape from being visible as a single-Explorer delta.
--
-- Both classes expire 48 hours after their Daily ends. The Daily ends at the
-- close of its UTC day, so expiry is midnight UTC three days on. The column is
-- generated, never supplied, so no caller can widen its own retention.

BEGIN;

CREATE TABLE daily_trail_constellation_totals (
  daily_date DATE PRIMARY KEY,
  contributor_count INTEGER NOT NULL DEFAULT 0
    CHECK (contributor_count >= 0),
  published_contributor_count INTEGER NOT NULL DEFAULT 0
    CHECK (
      published_contributor_count >= 0
      AND published_contributor_count <= contributor_count
    ),
  expires_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (
    timezone('UTC', (daily_date + 3)::timestamp)
  ) STORED
);

CREATE TABLE daily_trail_constellation_counters (
  daily_date DATE NOT NULL
    REFERENCES daily_trail_constellation_totals(daily_date) ON DELETE CASCADE,
  marker_kind TEXT NOT NULL
    CHECK (marker_kind IN ('cell', 'passage', 'pulse')),
  grid_x SMALLINT NOT NULL CHECK (grid_x BETWEEN 0 AND 63),
  grid_y SMALLINT NOT NULL CHECK (grid_y BETWEEN 0 AND 63),
  contributor_count INTEGER NOT NULL DEFAULT 0
    CHECK (contributor_count >= 0),
  published_count INTEGER NOT NULL DEFAULT 0
    CHECK (published_count >= 0 AND published_count <= contributor_count),
  expires_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (
    timezone('UTC', (daily_date + 3)::timestamp)
  ) STORED,
  PRIMARY KEY (daily_date, marker_kind, grid_x, grid_y)
);

CREATE INDEX daily_trail_constellation_counters_expiry_idx
  ON daily_trail_constellation_counters (expires_at);

-- One receipt per Explorer per canonical UTC Daily. The primary key is the
-- whole uniqueness rule: a second escape on the same Daily conflicts and is
-- discarded, so it can neither contribute again nor subtract the first.
CREATE TABLE daily_trail_contributions (
  player_id TEXT NOT NULL
    REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  daily_date DATE NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (
    timezone('UTC', (daily_date + 3)::timestamp)
  ) STORED,
  PRIMARY KEY (player_id, daily_date)
);

CREATE INDEX daily_trail_contributions_expiry_idx
  ON daily_trail_contributions (expires_at);

ALTER TABLE daily_trail_constellation_totals
  OWNER TO echo_maze_tenant_owner;
ALTER TABLE daily_trail_constellation_counters
  OWNER TO echo_maze_tenant_owner;
ALTER TABLE daily_trail_contributions
  OWNER TO echo_maze_tenant_owner;

ALTER TABLE daily_trail_constellation_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trail_constellation_totals FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_trail_constellation_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trail_constellation_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_trail_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trail_contributions FORCE ROW LEVEL SECURITY;

-- Tenant-owner ALL policies are the definer functions' working set. The
-- runtime role reaches the aggregates only through those functions, so the
-- counters carry no runtime-facing policy at all.
CREATE POLICY daily_trail_constellation_totals_tenant_owner_write
  ON daily_trail_constellation_totals
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY daily_trail_constellation_counters_tenant_owner_write
  ON daily_trail_constellation_counters
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY daily_trail_contributions_tenant_owner_write
  ON daily_trail_contributions
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

-- The runtime role reads its own receipts directly so account-deletion
-- verification can assert their absence without a definer round trip.
CREATE POLICY daily_trail_contributions_self_read
  ON daily_trail_contributions
  FOR SELECT
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
  );

REVOKE ALL ON TABLE daily_trail_constellation_totals
  FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE daily_trail_constellation_counters
  FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE daily_trail_contributions
  FROM PUBLIC, echo_maze_runtime;

GRANT SELECT ON TABLE daily_trail_contributions TO echo_maze_runtime;


-- Aggregates one accepted escape. `p_markers` is a JSON array of
-- {kind, x, y} objects derived in request memory from the submitted Run
-- Action Log; nothing about their order or timing is recorded, and the array
-- itself is never stored. `contributed` is TRUE only when this call was the
-- Explorer's first contribution to this Daily. Threshold policy lives in the
-- application so it can be tested at each boundary; this function reports the
-- counts that policy decides on.
CREATE FUNCTION record_daily_trail_contribution(
  p_daily_date DATE,
  p_markers JSONB
)
RETURNS TABLE (
  contributed BOOLEAN,
  contributor_count INTEGER,
  published_contributor_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_explorer TEXT;
  v_inserted BOOLEAN;
  v_total INTEGER;
  v_published INTEGER;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  IF v_explorer IS NULL THEN
    RAISE EXCEPTION 'Constellation aggregation needs an Explorer identity.';
  END IF;
  IF jsonb_typeof(p_markers) <> 'array' THEN
    RAISE EXCEPTION 'Constellation markers must be a JSON array.';
  END IF;

  INSERT INTO public.daily_trail_contributions (player_id, daily_date)
  VALUES (v_explorer, p_daily_date)
  ON CONFLICT (player_id, daily_date) DO NOTHING
  RETURNING TRUE INTO v_inserted;

  IF v_inserted IS NOT TRUE THEN
    SELECT
      totals.contributor_count,
      totals.published_contributor_count
    INTO v_total, v_published
    FROM public.daily_trail_constellation_totals AS totals
    WHERE totals.daily_date = p_daily_date;
    RETURN QUERY SELECT FALSE, COALESCE(v_total, 0), COALESCE(v_published, 0);
    RETURN;
  END IF;

  INSERT INTO public.daily_trail_constellation_totals (
    daily_date,
    contributor_count
  )
  VALUES (p_daily_date, 1)
  ON CONFLICT (daily_date) DO UPDATE SET
    contributor_count =
      public.daily_trail_constellation_totals.contributor_count + 1
  RETURNING
    daily_trail_constellation_totals.contributor_count,
    daily_trail_constellation_totals.published_contributor_count
  INTO v_total, v_published;

  INSERT INTO public.daily_trail_constellation_counters (
    daily_date,
    marker_kind,
    grid_x,
    grid_y,
    contributor_count
  )
  SELECT
    p_daily_date,
    marker.kind,
    marker.x,
    marker.y,
    1
  FROM jsonb_to_recordset(p_markers)
    AS marker(kind TEXT, x SMALLINT, y SMALLINT)
  GROUP BY marker.kind, marker.x, marker.y
  ON CONFLICT (daily_date, marker_kind, grid_x, grid_y) DO UPDATE SET
    contributor_count =
      public.daily_trail_constellation_counters.contributor_count + 1;

  RETURN QUERY SELECT TRUE, v_total, v_published;
END;
$$;

-- Advances the published snapshot to the live counts for one Daily. Called
-- only when the application's batch policy says a whole new batch of
-- contributors has arrived, so the served projection never moves by one.
CREATE FUNCTION publish_daily_trail_batch(p_daily_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_published INTEGER;
BEGIN
  UPDATE public.daily_trail_constellation_counters
  SET published_count = contributor_count
  WHERE daily_date = p_daily_date
    AND expires_at > NOW();

  UPDATE public.daily_trail_constellation_totals
  SET published_contributor_count = contributor_count
  WHERE daily_date = p_daily_date
    AND expires_at > NOW()
  RETURNING published_contributor_count INTO v_published;

  RETURN COALESCE(v_published, 0);
END;
$$;

-- How many contributors the served projection is allowed to reflect. Zero
-- when the Daily is unknown or already past its expiry window.
CREATE FUNCTION read_daily_trail_summary(p_daily_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_published INTEGER;
BEGIN
  SELECT totals.published_contributor_count INTO v_published
  FROM public.daily_trail_constellation_totals AS totals
  WHERE totals.daily_date = p_daily_date
    AND totals.expires_at > NOW();

  RETURN COALESCE(v_published, 0);
END;
$$;

-- Serves the published density figures for one Daily. Suppression below the
-- per-marker threshold is applied here as well as in the application, and
-- expiry is filtered here as well as by the prune job, so an unpruned or
-- under-observed row can never be served.
CREATE FUNCTION read_daily_trail_constellation(
  p_daily_date DATE,
  p_marker_threshold INTEGER
)
RETURNS TABLE (
  marker_kind TEXT,
  grid_x SMALLINT,
  grid_y SMALLINT,
  contributor_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_marker_threshold IS NULL OR p_marker_threshold < 1 THEN
    RAISE EXCEPTION 'Constellation thresholds must be positive.';
  END IF;

  RETURN QUERY
  SELECT
    counters.marker_kind,
    counters.grid_x,
    counters.grid_y,
    counters.published_count
  FROM public.daily_trail_constellation_counters AS counters
  WHERE counters.daily_date = p_daily_date
    AND counters.expires_at > NOW()
    AND counters.published_count >= p_marker_threshold
  ORDER BY counters.marker_kind, counters.grid_x, counters.grid_y;
END;
$$;

-- The self-service export section. Same expiry guard as every other read.
CREATE FUNCTION read_own_daily_trail_contributions()
RETURNS TABLE (
  daily_date DATE,
  contributed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_explorer TEXT;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  IF v_explorer IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    contribution.daily_date,
    contribution.contributed_at
  FROM public.daily_trail_contributions AS contribution
  WHERE contribution.player_id = v_explorer
    AND contribution.expires_at > NOW()
  ORDER BY contribution.daily_date DESC;
END;
$$;

-- Hard deletion 48 hours after the Daily ends. Counters cascade from the
-- totals row, so deleting totals removes the whole Daily's aggregate.
CREATE FUNCTION prune_daily_trail_constellation()
RETURNS TABLE (
  pruned_totals INTEGER,
  pruned_contributions INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_totals INTEGER;
  v_contributions INTEGER;
BEGIN
  DELETE FROM public.daily_trail_constellation_totals
  WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_totals = ROW_COUNT;

  DELETE FROM public.daily_trail_contributions
  WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_contributions = ROW_COUNT;

  RETURN QUERY SELECT v_totals, v_contributions;
END;
$$;

ALTER FUNCTION record_daily_trail_contribution(DATE, JSONB)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION publish_daily_trail_batch(DATE)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_daily_trail_summary(DATE)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_daily_trail_constellation(DATE, INTEGER)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_own_daily_trail_contributions()
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION prune_daily_trail_constellation()
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION record_daily_trail_contribution(DATE, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION publish_daily_trail_batch(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_daily_trail_summary(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_daily_trail_constellation(DATE, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION read_own_daily_trail_contributions() FROM PUBLIC;
REVOKE ALL ON FUNCTION prune_daily_trail_constellation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_daily_trail_contribution(DATE, JSONB)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION publish_daily_trail_batch(DATE)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_daily_trail_summary(DATE)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_daily_trail_constellation(DATE, INTEGER)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_own_daily_trail_contributions()
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION prune_daily_trail_constellation()
  TO echo_maze_runtime;

COMMIT;
