-- Milestone 5: Daily Trail Constellation aggregates.
-- Apply with DATABASE_ADMIN_URL after migration 0022. Do not apply from app startup.
--
-- Two classes of row live here. Counters hold how many distinct Explorers
-- touched a Labyrinth position on one canonical UTC Daily, split by marker
-- kind. Contribution receipts record only that an Explorer contributed to one
-- canonical UTC Daily, and when. They carry no position, no ordering, no
-- timing within the Run, no answer, and no username, so no receipt can be
-- joined back into a path.
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

-- The prune deletes from the totals row and lets counters cascade, so this is
-- the expiry scan that needs the index. Counter reads lead with daily_date,
-- which their primary key already covers.
CREATE INDEX daily_trail_constellation_totals_expiry_idx
  ON daily_trail_constellation_totals (expires_at);

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
  -- A marker set larger than any legal Labyrinth can produce is a caller
  -- fault, and jsonb_to_recordset would materialize it before any CHECK
  -- fired. The largest Quest Labyrinth is 23 by 23, so 4096 is generous.
  IF jsonb_array_length(p_markers) > 4096 THEN
    RAISE EXCEPTION 'Constellation markers exceed the protocol limit.';
  END IF;
  -- Only a live Daily may be aggregated. Without this an out-of-window date
  -- would create a receipt whose generated expiry the prune job never
  -- reaches, leaving personal data that cannot be deleted on schedule.
  --
  -- The window resolves in UTC, not the session time zone: p_daily_date is
  -- a canonical UTC Daily key, and CURRENT_DATE on a non-UTC connection
  -- would shift it by a day and silently reject live escapes near the
  -- boundary.
  IF p_daily_date IS NULL
     OR p_daily_date > (NOW() AT TIME ZONE 'UTC')::date
     OR p_daily_date < (NOW() AT TIME ZONE 'UTC')::date - 2 THEN
    RAISE EXCEPTION 'Constellation aggregation needs a live Daily date.';
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
--
-- Totals are updated before counters, the same order
-- record_daily_trail_contribution takes them in. Taking them in the
-- opposite order would deadlock the moment anything called this
-- concurrently with a contribution.
CREATE FUNCTION publish_daily_trail_batch(p_daily_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_published INTEGER;
BEGIN
  IF p_daily_date IS NULL
     OR p_daily_date > (NOW() AT TIME ZONE 'UTC')::date
     OR p_daily_date < (NOW() AT TIME ZONE 'UTC')::date - 2 THEN
    RAISE EXCEPTION 'Constellation publication needs a live Daily date.';
  END IF;

  -- Eligibility is decided here, under the totals row lock, not by the
  -- caller. Two callers that both read the same published figure before
  -- either published would otherwise advance the snapshot twice, and the
  -- second advance would expose a single Explorer's marker delta — the one
  -- thing the batch rule exists to prevent.
  UPDATE public.daily_trail_constellation_totals
  SET published_contributor_count = contributor_count
  WHERE daily_date = p_daily_date
    AND expires_at > NOW()
    AND contributor_count >= 20
    AND contributor_count - published_contributor_count >= 10
  RETURNING published_contributor_count INTO v_published;

  IF v_published IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.daily_trail_constellation_counters
  SET published_count = contributor_count
  WHERE daily_date = p_daily_date
    AND expires_at > NOW();

  RETURN v_published;
END;
$$;

-- How many contributors the served projection is allowed to reflect. Zero
-- when the Daily is unknown or already past its expiry window.
CREATE FUNCTION read_daily_trail_summary(p_daily_date DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  -- Reports zero below the publication threshold rather than the raw
  -- figure, so that gate holds here as well as in the application.
  SELECT COALESCE(
    (
      SELECT totals.published_contributor_count
      FROM public.daily_trail_constellation_totals AS totals
      WHERE totals.daily_date = p_daily_date
        AND totals.expires_at > NOW()
        AND totals.published_contributor_count >= 20
    ),
    0
  );
$$;

-- Serves the published density figures for one Daily. Expiry is filtered
-- here as well as by the prune job, so an unpruned row can never be served,
-- the publication threshold and the caller's suppression threshold are both
-- applied here: an application asking for a lower marker threshold gets the
-- contract's 5 rather than what it asked for, and an unpublished Daily
-- returns nothing whatever the caller asks. That is what makes this a
-- second gate rather than a restatement of the first.
CREATE FUNCTION read_daily_trail_constellation(
  p_daily_date DATE,
  p_marker_threshold INTEGER
)
RETURNS TABLE (
  marker_kind TEXT,
  grid_x SMALLINT,
  grid_y SMALLINT,
  published_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    counters.marker_kind,
    counters.grid_x,
    counters.grid_y,
    counters.published_count
  FROM public.daily_trail_constellation_counters AS counters
  WHERE counters.daily_date = p_daily_date
    AND counters.expires_at > NOW()
    AND EXISTS (
      SELECT 1
      FROM public.daily_trail_constellation_totals AS totals
      WHERE totals.daily_date = p_daily_date
        AND totals.expires_at > NOW()
        AND totals.published_contributor_count >= 20
    )
    AND counters.published_count >=
      GREATEST(COALESCE(p_marker_threshold, 5), 5)
  ORDER BY counters.marker_kind, counters.grid_x, counters.grid_y;
$$;

-- The self-service export section. Same expiry guard as every other read.
CREATE FUNCTION read_own_daily_trail_contributions()
RETURNS TABLE (
  daily_date DATE,
  contributed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_explorer TEXT;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  -- Raises rather than returning nothing: a caller that forgot to set
  -- tenant context would otherwise receive a silently empty export section
  -- and believe the Explorer had no receipts.
  IF v_explorer IS NULL THEN
    RAISE EXCEPTION 'Constellation export needs an Explorer identity.';
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
