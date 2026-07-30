-- Milestone 4: Class Expeditions data contract.
-- Apply with DATABASE_ADMIN_URL after migration 0020. Do not apply from app startup.
--
-- One Class Expedition assigns one four-Labyrinth Atlas Region at one Quest
-- Level and one published Learning Deck revision, ending at that Region's
-- Gate Warden. A non-recurring Class Expedition License funds 30 assigned
-- seats; one-time extensions add 5 seats each. A seat is consumed when a
-- Student's first Classroom Run Grant is issued and is never recycled.
-- Authoritative Classroom Membership removal cascades Grants away, while
-- assigned seats deliberately survive it.

BEGIN;

CREATE TABLE class_expeditions (
  id TEXT PRIMARY KEY CHECK (id ~ '^exped_[A-Za-z0-9_-]{3,120}$'),
  classroom_id TEXT NOT NULL
    REFERENCES classrooms(id) ON DELETE CASCADE,
  atlas_region SMALLINT NOT NULL CHECK (atlas_region BETWEEN 1 AND 5),
  level_id TEXT NOT NULL CHECK (
    level_id IN ('bright-start', 'trail-scout', 'maze-master')
  ),
  learning_deck_id TEXT NOT NULL,
  learning_deck_revision VARCHAR(120) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  completion_date DATE,
  created_by TEXT NOT NULL CHECK (created_by ~ '^user_[A-Za-z0-9_-]{3,120}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Every published revision stays listed here; publishing a new revision
  -- ships a migration that extends this list.
  CONSTRAINT class_expeditions_learning_deck_check CHECK (
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
  )
);

CREATE INDEX class_expeditions_classroom_idx
  ON class_expeditions (classroom_id, created_at DESC);

CREATE TABLE class_expedition_licenses (
  id UUID PRIMARY KEY,
  expedition_id TEXT NOT NULL
    REFERENCES class_expeditions(id) ON DELETE CASCADE,
  classroom_id TEXT NOT NULL
    REFERENCES classrooms(id) ON DELETE CASCADE,
  sponsor_user_id TEXT NOT NULL
    CHECK (sponsor_user_id ~ '^user_[A-Za-z0-9_-]{3,120}$'),
  kind TEXT NOT NULL CHECK (kind IN ('base', 'extension')),
  seats SMALLINT NOT NULL CHECK (
    (kind = 'base' AND seats = 30)
    OR (kind = 'extension' AND seats = 5)
  ),
  stripe_price_id TEXT NOT NULL CHECK (stripe_price_id ~ '^price_'),
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  -- The USD amount is intentionally unconstrained to a constant: no concrete
  -- price is proposed before the documented cost model exists, so the ledger
  -- only records what the environment-configured test checkout charged.
  amount INTEGER CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'open',
      'paid',
      'refunded',
      'disputed',
      'expired',
      'failed'
    )
  ),
  state_event_created BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX class_expedition_licenses_one_base_idx
  ON class_expedition_licenses (expedition_id)
  WHERE kind = 'base' AND status IN ('pending', 'open', 'paid');

CREATE INDEX class_expedition_licenses_expedition_idx
  ON class_expedition_licenses (expedition_id, kind, status);

CREATE TABLE class_expedition_seats (
  expedition_id TEXT NOT NULL
    REFERENCES class_expeditions(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE
    CHECK (clerk_user_id ~ '^user_[A-Za-z0-9_-]{3,120}$'),
  seat_number INTEGER NOT NULL CHECK (seat_number >= 1),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (expedition_id, clerk_user_id),
  UNIQUE (expedition_id, seat_number)
);

CREATE TABLE classroom_run_grants (
  expedition_id TEXT NOT NULL
    REFERENCES class_expeditions(id) ON DELETE CASCADE,
  classroom_id TEXT NOT NULL CHECK (classroom_id ~ '^org_[A-Za-z0-9_-]{3,120}$'),
  clerk_user_id TEXT NOT NULL
    CHECK (clerk_user_id ~ '^user_[A-Za-z0-9_-]{3,120}$'),
  labyrinth_number SMALLINT NOT NULL CHECK (labyrinth_number BETWEEN 1 AND 20),
  run_id TEXT NOT NULL CHECK (run_id ~ '^[a-zA-Z0-9_-]{12,128}$'),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (
    status IN ('issued', 'escaped', 'defeated')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (expedition_id, clerk_user_id, labyrinth_number),
  FOREIGN KEY (classroom_id, clerk_user_id)
    REFERENCES classroom_memberships(classroom_id, clerk_user_id)
    ON DELETE CASCADE
);

CREATE INDEX classroom_run_grants_expedition_status_idx
  ON classroom_run_grants (expedition_id, status);

ALTER TABLE class_expeditions OWNER TO echo_maze_tenant_owner;
ALTER TABLE class_expedition_licenses OWNER TO echo_maze_tenant_owner;
ALTER TABLE class_expedition_seats OWNER TO echo_maze_tenant_owner;
ALTER TABLE classroom_run_grants OWNER TO echo_maze_tenant_owner;

ALTER TABLE class_expeditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_expeditions FORCE ROW LEVEL SECURITY;
ALTER TABLE class_expedition_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_expedition_licenses FORCE ROW LEVEL SECURITY;
ALTER TABLE class_expedition_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_expedition_seats FORCE ROW LEVEL SECURITY;
ALTER TABLE classroom_run_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_run_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY class_expeditions_member_read
  ON class_expeditions
  FOR SELECT
  TO echo_maze_runtime
  USING (
    classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM classroom_memberships AS membership
      WHERE membership.classroom_id = class_expeditions.classroom_id
        AND membership.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
    )
  );

CREATE POLICY class_expeditions_teacher_insert
  ON class_expeditions
  FOR INSERT
  TO echo_maze_runtime
  WITH CHECK (
    classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND created_by =
      NULLIF(current_setting('echo_maze.explorer_id', true), '')
    AND status = 'open'
    AND EXISTS (
      SELECT 1
      FROM classroom_memberships AS teacher
      WHERE teacher.classroom_id = class_expeditions.classroom_id
        AND teacher.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
        AND teacher.role = 'teacher'
    )
  );

-- Tenant-owner ALL policies below are the definer functions' working set;
-- runtime-facing access stays confined to the narrow policies above.
CREATE POLICY class_expeditions_tenant_owner_write
  ON class_expeditions
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY class_expedition_licenses_tenant_owner_write
  ON class_expedition_licenses
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY class_expedition_seats_tenant_owner_write
  ON class_expedition_seats
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY classroom_run_grants_explorer_read
  ON classroom_run_grants
  FOR SELECT
  TO echo_maze_runtime
  USING (
    clerk_user_id =
      NULLIF(current_setting('echo_maze.explorer_id', true), '')
    AND classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM classroom_memberships AS membership
      WHERE membership.classroom_id = classroom_run_grants.classroom_id
        AND membership.clerk_user_id = classroom_run_grants.clerk_user_id
    )
  );

CREATE POLICY classroom_run_grants_tenant_owner_write
  ON classroom_run_grants
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON TABLE class_expeditions FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE class_expedition_licenses FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE class_expedition_seats FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON TABLE classroom_run_grants FROM PUBLIC, echo_maze_runtime;

GRANT SELECT, INSERT ON TABLE class_expeditions TO echo_maze_runtime;
GRANT SELECT ON TABLE classroom_run_grants TO echo_maze_runtime;

-- Closing and reopening stay a definer write so every other Expedition
-- column remains immutable to the runtime role after creation.
CREATE FUNCTION close_class_expedition(
  p_expedition_id TEXT,
  p_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_classroom TEXT;
BEGIN
  IF p_expedition_id !~ '^exped_[A-Za-z0-9_-]{3,120}$'
     OR p_status NOT IN ('open', 'closed') THEN
    RAISE EXCEPTION 'Invalid Class Expedition status input.';
  END IF;

  SELECT classroom_id INTO v_classroom
  FROM public.class_expeditions
  WHERE id = p_expedition_id;

  IF v_classroom IS NULL
     OR v_classroom IS DISTINCT FROM
       NULLIF(current_setting('echo_maze.classroom_id', true), '')
     OR NOT EXISTS (
       SELECT 1
       FROM public.classroom_memberships AS teacher
       WHERE teacher.classroom_id = v_classroom
         AND teacher.clerk_user_id =
           NULLIF(current_setting('echo_maze.explorer_id', true), '')
         AND teacher.role = 'teacher'
     ) THEN
    RAISE EXCEPTION 'Class Expedition access denied.';
  END IF;

  UPDATE public.class_expeditions
  SET status = p_status, updated_at = NOW()
  WHERE id = p_expedition_id;

  RETURN p_status;
END;
$$;

CREATE FUNCTION reserve_class_expedition_license(
  p_purchase_id UUID,
  p_expedition_id TEXT,
  p_kind TEXT,
  p_sponsor_user_id TEXT,
  p_stripe_price_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_classroom TEXT;
BEGIN
  IF p_purchase_id IS NULL
     OR p_expedition_id !~ '^exped_[A-Za-z0-9_-]{3,120}$'
     OR p_kind NOT IN ('base', 'extension')
     OR p_sponsor_user_id !~ '^user_[A-Za-z0-9_-]{3,120}$'
     OR p_stripe_price_id !~ '^price_' THEN
    RAISE EXCEPTION 'Invalid Class Expedition License input.';
  END IF;

  SELECT classroom_id INTO v_classroom
  FROM public.class_expeditions
  WHERE id = p_expedition_id;

  IF v_classroom IS NULL THEN
    RAISE EXCEPTION 'Class Expedition not found.';
  END IF;

  -- Sponsor purchases are Teacher-initiated in this milestone: the caller's
  -- transaction-local identity must be a Teacher of the Expedition's own
  -- Classroom, and the sponsor parameter must be that same identity.
  IF v_classroom IS DISTINCT FROM
       NULLIF(current_setting('echo_maze.classroom_id', true), '')
     OR p_sponsor_user_id IS DISTINCT FROM
       NULLIF(current_setting('echo_maze.explorer_id', true), '')
     OR NOT EXISTS (
       SELECT 1
       FROM public.classroom_memberships AS teacher
       WHERE teacher.classroom_id = v_classroom
         AND teacher.clerk_user_id = p_sponsor_user_id
         AND teacher.role = 'teacher'
     ) THEN
    RAISE EXCEPTION 'Class Expedition access denied.';
  END IF;

  -- An extension only makes sense once a base License is paid.
  IF p_kind = 'extension' AND NOT EXISTS (
    SELECT 1
    FROM public.class_expedition_licenses
    WHERE expedition_id = p_expedition_id
      AND kind = 'base'
      AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Class Expedition has no paid base License.';
  END IF;

  INSERT INTO public.class_expedition_licenses (
    id,
    expedition_id,
    classroom_id,
    sponsor_user_id,
    kind,
    seats,
    stripe_price_id
  )
  VALUES (
    p_purchase_id,
    p_expedition_id,
    v_classroom,
    p_sponsor_user_id,
    p_kind,
    CASE WHEN p_kind = 'base' THEN 30 ELSE 5 END,
    p_stripe_price_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Activation and status transitions are driven by verified Stripe webhook
-- deliveries, which carry no Explorer session: these two functions therefore
-- gate on validated inputs and monotonic provider timestamps rather than the
-- transaction-local tenant context. EXECUTE stays limited to the runtime
-- role, and the webhook inbox is the only caller in the application.
CREATE FUNCTION activate_class_expedition_license(
  p_purchase_id UUID,
  p_checkout_session_id TEXT,
  p_payment_intent_id TEXT,
  p_amount INTEGER,
  p_currency TEXT,
  p_event_created BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  IF p_purchase_id IS NULL
     OR p_amount IS NULL OR p_amount <= 0
     OR p_currency IS DISTINCT FROM 'usd'
     OR p_event_created IS NULL OR p_event_created <= 0 THEN
    RAISE EXCEPTION 'Invalid Class Expedition License activation input.';
  END IF;

  UPDATE public.class_expedition_licenses
  SET
    status = 'paid',
    checkout_session_id = COALESCE(p_checkout_session_id, checkout_session_id),
    payment_intent_id = COALESCE(p_payment_intent_id, payment_intent_id),
    amount = p_amount,
    currency = p_currency,
    state_event_created = p_event_created,
    updated_at = NOW()
  WHERE id = p_purchase_id
    AND status IN ('pending', 'open')
    AND state_event_created < p_event_created
  RETURNING TRUE INTO applied;

  IF applied IS DISTINCT FROM TRUE THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.class_expedition_licenses
      WHERE id = p_purchase_id AND status = 'paid'
    );
  END IF;

  RETURN TRUE;
END;
$$;

CREATE FUNCTION transition_class_expedition_license(
  p_purchase_id UUID,
  p_status TEXT,
  p_event_created BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  IF p_purchase_id IS NULL
     OR p_status NOT IN ('paid', 'refunded', 'disputed', 'expired', 'failed')
     OR p_event_created IS NULL OR p_event_created <= 0 THEN
    RAISE EXCEPTION 'Invalid Class Expedition License transition input.';
  END IF;

  UPDATE public.class_expedition_licenses
  SET status = p_status, state_event_created = p_event_created,
    updated_at = NOW()
  WHERE id = p_purchase_id
    AND state_event_created < p_event_created
    -- A dispute resolution may only reinstate a License that is actually
    -- disputed; it can never resurrect a refunded or expired purchase.
    AND (p_status <> 'paid' OR status = 'disputed')
  RETURNING TRUE INTO applied;

  RETURN applied IS NOT DISTINCT FROM TRUE;
END;
$$;

CREATE FUNCTION issue_classroom_run_grant(
  p_expedition_id TEXT,
  p_run_id TEXT,
  p_labyrinth_number SMALLINT
)
RETURNS TABLE (
  out_run_id TEXT,
  out_status TEXT,
  out_seat_number INTEGER,
  out_duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_explorer TEXT;
  v_classroom TEXT;
  v_expedition public.class_expeditions%ROWTYPE;
  v_grant public.classroom_run_grants%ROWTYPE;
  v_seat INTEGER;
  v_capacity INTEGER;
  v_assigned INTEGER;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  v_classroom := NULLIF(current_setting('echo_maze.classroom_id', true), '');

  IF v_explorer IS NULL OR v_classroom IS NULL
     OR p_expedition_id !~ '^exped_[A-Za-z0-9_-]{3,120}$'
     OR p_run_id !~ '^[a-zA-Z0-9_-]{12,128}$'
     OR p_labyrinth_number IS NULL THEN
    RAISE EXCEPTION 'Invalid Classroom Run Grant input.';
  END IF;

  SELECT * INTO v_expedition
  FROM public.class_expeditions
  WHERE id = p_expedition_id;

  IF v_expedition.id IS NULL
     OR v_expedition.classroom_id IS DISTINCT FROM v_classroom
     OR NOT EXISTS (
       SELECT 1
       FROM public.classroom_memberships AS membership
       WHERE membership.classroom_id = v_expedition.classroom_id
         AND membership.clerk_user_id = v_explorer
         AND membership.role = 'student'
     ) THEN
    RAISE EXCEPTION 'Class Expedition access denied.';
  END IF;

  IF p_labyrinth_number
       NOT BETWEEN (v_expedition.atlas_region - 1) * 4 + 1
       AND v_expedition.atlas_region * 4 THEN
    RAISE EXCEPTION 'Labyrinth is outside the assigned Atlas Region.';
  END IF;

  -- The idempotent lookup comes before the open check: an already-issued
  -- Grant may finish or recover its started Labyrinth after explicit
  -- closure. Only NEW Grants and defeat retries require an open assignment.
  SELECT * INTO v_grant
  FROM public.classroom_run_grants
  WHERE expedition_id = p_expedition_id
    AND clerk_user_id = v_explorer
    AND labyrinth_number = p_labyrinth_number
  FOR UPDATE;

  IF v_grant.run_id IS NOT NULL THEN
    SELECT seat_number INTO v_seat
    FROM public.class_expedition_seats
    WHERE expedition_id = p_expedition_id AND clerk_user_id = v_explorer;

    IF v_grant.run_id = p_run_id THEN
      RETURN QUERY
        SELECT v_grant.run_id, v_grant.status, v_seat, TRUE;
      RETURN;
    END IF;

    -- Defeat retries and lost terminal acknowledgements both re-point the
    -- same Grant to the Student's fresh Run: without the 'issued' branch a
    -- transient failure while recording an outcome would strand this
    -- Labyrinth forever. 'escaped' stays terminal.
    IF v_grant.status IN ('issued', 'defeated') THEN
      IF v_expedition.status <> 'open' THEN
        RAISE EXCEPTION 'Class Expedition is closed.';
      END IF;
      UPDATE public.classroom_run_grants
      SET run_id = p_run_id, status = 'issued', updated_at = NOW()
      WHERE expedition_id = p_expedition_id
        AND clerk_user_id = v_explorer
        AND labyrinth_number = p_labyrinth_number;
      RETURN QUERY SELECT p_run_id, 'issued'::TEXT, v_seat, FALSE;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Classroom Run Grant conflict.';
  END IF;

  IF v_expedition.status <> 'open' THEN
    RAISE EXCEPTION 'Class Expedition is closed.';
  END IF;

  -- ADR 0030: billing disputes never automatically interrupt Class Play.
  -- A disputed base License keeps funding Grants; only refunded, expired,
  -- failed, or never-paid Licenses block new assigned play.
  IF NOT EXISTS (
    SELECT 1
    FROM public.class_expedition_licenses
    WHERE expedition_id = p_expedition_id
      AND kind = 'base'
      AND status IN ('paid', 'disputed')
  ) THEN
    RAISE EXCEPTION 'Class Expedition has no paid base License.';
  END IF;

  -- Serialize seat assignment per Expedition so declared capacity cannot be
  -- oversubscribed by concurrent first Grants.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_expedition_id, 0));

  SELECT seat_number INTO v_seat
  FROM public.class_expedition_seats
  WHERE expedition_id = p_expedition_id AND clerk_user_id = v_explorer;

  IF v_seat IS NULL THEN
    SELECT 30 + 5 * COUNT(*) INTO v_capacity
    FROM public.class_expedition_licenses
    WHERE expedition_id = p_expedition_id
      AND kind = 'extension'
      AND status IN ('paid', 'disputed');

    -- Consumed capacity is the highest seat number ever assigned, not the
    -- surviving row count: account deletion cascades a seat row away as
    -- personal data, but the seat itself is never recycled.
    SELECT COALESCE(MAX(seat_number), 0) INTO v_assigned
    FROM public.class_expedition_seats
    WHERE expedition_id = p_expedition_id;

    IF v_assigned >= v_capacity THEN
      RAISE EXCEPTION 'Class Expedition capacity is fully assigned.';
    END IF;

    v_seat := v_assigned + 1;
    INSERT INTO public.class_expedition_seats (
      expedition_id,
      clerk_user_id,
      seat_number
    )
    VALUES (p_expedition_id, v_explorer, v_seat);
  END IF;

  INSERT INTO public.classroom_run_grants (
    expedition_id,
    classroom_id,
    clerk_user_id,
    labyrinth_number,
    run_id
  )
  VALUES (
    p_expedition_id,
    v_classroom,
    v_explorer,
    p_labyrinth_number,
    p_run_id
  );

  RETURN QUERY SELECT p_run_id, 'issued'::TEXT, v_seat, FALSE;
END;
$$;

CREATE FUNCTION record_classroom_run_outcome(
  p_expedition_id TEXT,
  p_labyrinth_number SMALLINT,
  p_run_id TEXT,
  p_outcome TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_explorer TEXT;
  v_classroom TEXT;
  v_grant public.classroom_run_grants%ROWTYPE;
BEGIN
  v_explorer := NULLIF(current_setting('echo_maze.explorer_id', true), '');
  v_classroom := NULLIF(current_setting('echo_maze.classroom_id', true), '');

  IF v_explorer IS NULL OR v_classroom IS NULL
     OR p_expedition_id !~ '^exped_[A-Za-z0-9_-]{3,120}$'
     OR p_run_id !~ '^[a-zA-Z0-9_-]{12,128}$'
     OR p_outcome NOT IN ('escaped', 'defeated') THEN
    RAISE EXCEPTION 'Invalid Classroom Run outcome input.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classroom_memberships AS membership
    WHERE membership.classroom_id = v_classroom
      AND membership.clerk_user_id = v_explorer
      AND membership.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Class Expedition access denied.';
  END IF;

  SELECT * INTO v_grant
  FROM public.classroom_run_grants
  WHERE expedition_id = p_expedition_id
    AND clerk_user_id = v_explorer
    AND labyrinth_number = p_labyrinth_number
  FOR UPDATE;

  IF v_grant.run_id IS NULL
     OR v_grant.classroom_id IS DISTINCT FROM v_classroom
     OR v_grant.run_id <> p_run_id THEN
    RAISE EXCEPTION 'Classroom Run Grant not found.';
  END IF;

  IF v_grant.status = p_outcome THEN
    RETURN TRUE;
  END IF;

  IF v_grant.status <> 'issued' THEN
    RAISE EXCEPTION 'Classroom Run outcome already recorded.';
  END IF;

  UPDATE public.classroom_run_grants
  SET status = p_outcome, updated_at = NOW()
  WHERE expedition_id = p_expedition_id
    AND clerk_user_id = v_explorer
    AND labyrinth_number = p_labyrinth_number;

  RETURN TRUE;
END;
$$;

-- Teacher aggregates: class counts only. No Student name, identifier,
-- ordering, or per-Question fact ever leaves this reader.
CREATE FUNCTION read_class_expedition_progress(
  p_classroom_id TEXT,
  p_expedition_id TEXT
)
RETURNS TABLE (
  labyrinth_number SMALLINT,
  completed_count BIGINT,
  started_student_count BIGINT,
  region_complete_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    lab.n::SMALLINT AS labyrinth_number,
    (
      SELECT COUNT(*)
      FROM public.classroom_run_grants AS grants
      WHERE grants.expedition_id = p_expedition_id
        AND grants.labyrinth_number = lab.n
        AND grants.status = 'escaped'
    ) AS completed_count,
    (
      SELECT COUNT(DISTINCT grants.clerk_user_id)
      FROM public.classroom_run_grants AS grants
      WHERE grants.expedition_id = p_expedition_id
    ) AS started_student_count,
    (
      SELECT COUNT(*)
      FROM (
        SELECT grants.clerk_user_id
        FROM public.classroom_run_grants AS grants
        WHERE grants.expedition_id = p_expedition_id
          AND grants.status = 'escaped'
        GROUP BY grants.clerk_user_id
        HAVING COUNT(*) = 4
      ) AS finished
    ) AS region_complete_count
  FROM public.class_expeditions AS expedition
  CROSS JOIN LATERAL generate_series(
    (expedition.atlas_region - 1) * 4 + 1,
    expedition.atlas_region * 4
  ) AS lab(n)
  WHERE expedition.id = p_expedition_id
    AND expedition.classroom_id = p_classroom_id
    AND p_classroom_id ~ '^org_[A-Za-z0-9_-]{3,120}$'
    AND p_classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM public.classroom_memberships AS teacher
      WHERE teacher.classroom_id = p_classroom_id
        AND teacher.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
        AND teacher.role = 'teacher'
    )
  ORDER BY lab.n
$$;

CREATE FUNCTION read_class_expedition_capacity(
  p_expedition_id TEXT
)
RETURNS TABLE (
  seats_total INTEGER,
  seats_assigned BIGINT,
  base_status TEXT,
  extension_paid_count BIGINT,
  base_refund_eligible BOOLEAN,
  extension_refund_eligible_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH gate AS (
    SELECT expedition.id, expedition.classroom_id
    FROM public.class_expeditions AS expedition
    WHERE expedition.id = p_expedition_id
      AND expedition.classroom_id =
        NULLIF(current_setting('echo_maze.classroom_id', true), '')
      AND EXISTS (
        SELECT 1
        FROM public.classroom_memberships AS teacher
        WHERE teacher.classroom_id = expedition.classroom_id
          AND teacher.clerk_user_id =
            NULLIF(current_setting('echo_maze.explorer_id', true), '')
          AND teacher.role = 'teacher'
      )
  ),
  assigned AS (
    SELECT COALESCE(MAX(seats.seat_number), 0)::BIGINT AS seat_count
    FROM public.class_expedition_seats AS seats
    WHERE seats.expedition_id = p_expedition_id
  ),
  extensions AS (
    SELECT
      COUNT(*) FILTER (WHERE licenses.status = 'paid')::BIGINT AS paid_count,
      COUNT(*) FILTER (
        WHERE licenses.status = 'paid'
          AND (
            SELECT seat_count FROM assigned
          ) <= 30 + 5 * (
            SELECT COUNT(*)
            FROM public.class_expedition_licenses AS earlier
            WHERE earlier.expedition_id = p_expedition_id
              AND earlier.kind = 'extension'
              AND earlier.status = 'paid'
              AND (
                earlier.created_at < licenses.created_at
                OR (
                  earlier.created_at = licenses.created_at
                  AND earlier.id < licenses.id
                )
              )
          )
      )::BIGINT AS refund_eligible_count
    FROM public.class_expedition_licenses AS licenses
    WHERE licenses.expedition_id = p_expedition_id
      AND licenses.kind = 'extension'
  )
  SELECT
    (30 + 5 * extensions.paid_count)::INTEGER AS seats_total,
    assigned.seat_count AS seats_assigned,
    (
      SELECT licenses.status
      FROM public.class_expedition_licenses AS licenses
      WHERE licenses.expedition_id = p_expedition_id
        AND licenses.kind = 'base'
      ORDER BY licenses.created_at DESC
      LIMIT 1
    ) AS base_status,
    extensions.paid_count AS extension_paid_count,
    assigned.seat_count = 0 AS base_refund_eligible,
    extensions.refund_eligible_count AS extension_refund_eligible_count
  FROM gate
  CROSS JOIN assigned
  CROSS JOIN extensions
$$;

-- Self-service data export: an Explorer's own seat and sponsored-License
-- facts are personal data. Both readers key on the transaction-local
-- Explorer identity and return nothing for anyone else.
CREATE FUNCTION read_own_class_expedition_seats()
RETURNS TABLE (
  expedition_id TEXT,
  seat_number INTEGER,
  assigned_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT seats.expedition_id, seats.seat_number, seats.assigned_at
  FROM public.class_expedition_seats AS seats
  WHERE seats.clerk_user_id =
    NULLIF(current_setting('echo_maze.explorer_id', true), '')
  ORDER BY seats.assigned_at, seats.expedition_id
$$;

CREATE FUNCTION read_own_class_expedition_licenses()
RETURNS TABLE (
  id UUID,
  expedition_id TEXT,
  classroom_id TEXT,
  kind TEXT,
  seats SMALLINT,
  stripe_price_id TEXT,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT licenses.id, licenses.expedition_id, licenses.classroom_id,
    licenses.kind, licenses.seats, licenses.stripe_price_id,
    licenses.checkout_session_id, licenses.payment_intent_id,
    licenses.amount, licenses.currency, licenses.status,
    licenses.created_at, licenses.updated_at
  FROM public.class_expedition_licenses AS licenses
  WHERE licenses.sponsor_user_id =
    NULLIF(current_setting('echo_maze.explorer_id', true), '')
  ORDER BY licenses.created_at, licenses.id
$$;

ALTER FUNCTION close_class_expedition(TEXT, TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION reserve_class_expedition_license(UUID, TEXT, TEXT, TEXT, TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION activate_class_expedition_license(
  UUID, TEXT, TEXT, INTEGER, TEXT, BIGINT
) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION transition_class_expedition_license(UUID, TEXT, BIGINT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION issue_classroom_run_grant(TEXT, TEXT, SMALLINT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION record_classroom_run_outcome(TEXT, SMALLINT, TEXT, TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_class_expedition_progress(TEXT, TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_class_expedition_capacity(TEXT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_own_class_expedition_seats()
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION read_own_class_expedition_licenses()
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION close_class_expedition(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_class_expedition_license(
  UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_class_expedition_license(
  UUID, TEXT, TEXT, INTEGER, TEXT, BIGINT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_class_expedition_license(
  UUID, TEXT, BIGINT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_classroom_run_grant(
  TEXT, TEXT, SMALLINT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_classroom_run_outcome(
  TEXT, SMALLINT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_class_expedition_progress(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_class_expedition_capacity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_own_class_expedition_seats() FROM PUBLIC;
REVOKE ALL ON FUNCTION read_own_class_expedition_licenses() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION close_class_expedition(TEXT, TEXT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION reserve_class_expedition_license(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION activate_class_expedition_license(
  UUID, TEXT, TEXT, INTEGER, TEXT, BIGINT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION transition_class_expedition_license(
  UUID, TEXT, BIGINT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION issue_classroom_run_grant(
  TEXT, TEXT, SMALLINT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION record_classroom_run_outcome(
  TEXT, SMALLINT, TEXT, TEXT
) TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_class_expedition_progress(TEXT, TEXT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_class_expedition_capacity(TEXT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_own_class_expedition_seats()
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION read_own_class_expedition_licenses()
  TO echo_maze_runtime;

COMMIT;
