-- Phase 8 PR 2: monotonic Clerk authority synchronization.
-- Apply with DATABASE_ADMIN_URL after migration 0014.

CREATE TABLE classroom_authority_versions (
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('classroom', 'membership')),
  entity_id TEXT NOT NULL,
  event_timestamp BIGINT NOT NULL CHECK (event_timestamp > 0),
  deleted BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE classroom_authority_versions
  OWNER TO echo_maze_tenant_owner;

CREATE POLICY classrooms_tenant_owner_write
  ON classrooms
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY classroom_memberships_tenant_owner_write
  ON classroom_memberships
  FOR ALL
  TO echo_maze_tenant_owner
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT ON TABLE deleted_user_tombstones
  TO echo_maze_tenant_owner;
GRANT SELECT, INSERT ON TABLE player_access
  TO echo_maze_tenant_owner;

ALTER TABLE score_entries
  ADD COLUMN classroom_id TEXT
    REFERENCES classrooms(id) ON DELETE CASCADE,
  DROP CONSTRAINT score_entries_player_id_idempotency_key_key,
  ADD CONSTRAINT score_entries_scope_idempotency_unique
    UNIQUE NULLS NOT DISTINCT (
      player_id,
      classroom_id,
      idempotency_key
    ),
  ADD CONSTRAINT score_entries_membership_fk
    FOREIGN KEY (classroom_id, player_id)
    REFERENCES classroom_memberships(classroom_id, clerk_user_id)
    ON DELETE CASCADE;

CREATE INDEX score_entries_classroom_idx
  ON score_entries (classroom_id, player_id);

ALTER TABLE score_entries OWNER TO echo_maze_tenant_owner;
ALTER SEQUENCE score_entries_id_seq OWNER TO echo_maze_tenant_owner;
ALTER TABLE score_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY score_entries_global_read
  ON score_entries
  FOR SELECT
  TO echo_maze_runtime
  USING (classroom_id IS NULL);

CREATE POLICY score_entries_classroom_read
  ON score_entries
  FOR SELECT
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND classroom_id = NULLIF(
      current_setting('echo_maze.classroom_id', true),
      ''
    )
    AND EXISTS (
      SELECT 1
      FROM classroom_memberships AS membership
      WHERE membership.classroom_id = score_entries.classroom_id
        AND membership.clerk_user_id = score_entries.player_id
    )
  );

CREATE POLICY score_entries_classroom_write
  ON score_entries
  FOR INSERT
  TO echo_maze_runtime
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND (
      (
        classroom_id IS NULL
        AND NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        ) IS NULL
      )
      OR
      (
        classroom_id = NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        )
        AND EXISTS (
          SELECT 1
          FROM classroom_memberships AS membership
          WHERE membership.classroom_id = score_entries.classroom_id
            AND membership.clerk_user_id = score_entries.player_id
        )
      )
    )
  );

CREATE POLICY score_entries_idempotent_update
  ON score_entries
  FOR UPDATE
  TO echo_maze_runtime
  USING (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND (
      (
        classroom_id IS NULL
        AND NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        ) IS NULL
      )
      OR
      (
        classroom_id = NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        )
        AND EXISTS (
          SELECT 1
          FROM classroom_memberships AS membership
          WHERE membership.classroom_id = score_entries.classroom_id
            AND membership.clerk_user_id = score_entries.player_id
        )
      )
    )
  )
  WITH CHECK (
    player_id = NULLIF(
      current_setting('echo_maze.explorer_id', true),
      ''
    )
    AND (
      (
        classroom_id IS NULL
        AND NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        ) IS NULL
      )
      OR
      (
        classroom_id = NULLIF(
          current_setting('echo_maze.classroom_id', true),
          ''
        )
        AND EXISTS (
          SELECT 1
          FROM classroom_memberships AS membership
          WHERE membership.classroom_id = score_entries.classroom_id
            AND membership.clerk_user_id = score_entries.player_id
        )
      )
    )
  );

REVOKE ALL ON TABLE score_entries FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON SEQUENCE score_entries_id_seq FROM PUBLIC, echo_maze_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE score_entries TO echo_maze_runtime;
GRANT USAGE, SELECT ON SEQUENCE score_entries_id_seq TO echo_maze_runtime;

CREATE FUNCTION sync_classroom(
  p_id TEXT,
  p_name TEXT,
  p_event_timestamp BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  IF p_id !~ '^org_[A-Za-z0-9_-]{3,120}$'
     OR char_length(p_name) NOT BETWEEN 1 AND 120
     OR p_event_timestamp <= 0 THEN
    RAISE EXCEPTION 'Invalid Classroom synchronization input.';
  END IF;

  INSERT INTO public.classroom_authority_versions (
    entity_type,
    entity_id,
    event_timestamp,
    deleted
  )
  VALUES ('classroom', p_id, p_event_timestamp, FALSE)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    event_timestamp = EXCLUDED.event_timestamp,
    deleted = FALSE,
    updated_at = NOW()
  WHERE EXCLUDED.event_timestamp >
    public.classroom_authority_versions.event_timestamp
  RETURNING TRUE INTO applied;

  IF applied IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.classrooms (id, name)
  VALUES (p_id, p_name)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();
  RETURN TRUE;
END;
$$;

CREATE FUNCTION delete_classroom(
  p_id TEXT,
  p_event_timestamp BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  IF p_id !~ '^org_[A-Za-z0-9_-]{3,120}$'
     OR p_event_timestamp <= 0 THEN
    RAISE EXCEPTION 'Invalid Classroom deletion input.';
  END IF;

  INSERT INTO public.classroom_authority_versions (
    entity_type,
    entity_id,
    event_timestamp,
    deleted
  )
  VALUES ('classroom', p_id, p_event_timestamp, TRUE)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    event_timestamp = EXCLUDED.event_timestamp,
    deleted = TRUE,
    updated_at = NOW()
  WHERE EXCLUDED.event_timestamp >
      public.classroom_authority_versions.event_timestamp
    OR (
      EXCLUDED.event_timestamp =
        public.classroom_authority_versions.event_timestamp
      AND public.classroom_authority_versions.deleted = FALSE
    )
  RETURNING TRUE INTO applied;

  IF applied IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.classrooms WHERE id = p_id;
  RETURN TRUE;
END;
$$;

CREATE FUNCTION sync_classroom_membership(
  p_id TEXT,
  p_classroom_id TEXT,
  p_user_id TEXT,
  p_role TEXT,
  p_event_timestamp BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
  user_hash TEXT;
BEGIN
  IF p_id !~ '^orgmem_[A-Za-z0-9_-]{3,120}$'
     OR p_classroom_id !~ '^org_[A-Za-z0-9_-]{3,120}$'
     OR p_user_id !~ '^user_[A-Za-z0-9_-]{3,120}$'
     OR p_role NOT IN ('teacher', 'student')
     OR p_event_timestamp <= 0 THEN
    RAISE EXCEPTION 'Invalid Classroom Membership synchronization input.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
  user_hash := encode(sha256(convert_to(p_user_id, 'UTF8')), 'hex');
  IF EXISTS (
    SELECT 1
    FROM public.deleted_user_tombstones
    WHERE clerk_user_id_hash = user_hash
  ) THEN
    INSERT INTO public.classroom_authority_versions (
      entity_type,
      entity_id,
      event_timestamp,
      deleted
    )
    VALUES ('membership', p_id, p_event_timestamp, TRUE)
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      event_timestamp = EXCLUDED.event_timestamp,
      deleted = TRUE,
      updated_at = NOW()
    WHERE EXCLUDED.event_timestamp >
        public.classroom_authority_versions.event_timestamp
      OR (
        EXCLUDED.event_timestamp =
          public.classroom_authority_versions.event_timestamp
        AND public.classroom_authority_versions.deleted = FALSE
      );
    RETURN FALSE;
  END IF;

  INSERT INTO public.player_access (clerk_user_id)
  VALUES (p_user_id)
  ON CONFLICT (clerk_user_id) DO NOTHING;

  INSERT INTO public.classroom_authority_versions (
    entity_type,
    entity_id,
    event_timestamp,
    deleted
  )
  VALUES ('membership', p_id, p_event_timestamp, FALSE)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    event_timestamp = EXCLUDED.event_timestamp,
    deleted = FALSE,
    updated_at = NOW()
  WHERE EXCLUDED.event_timestamp >
      public.classroom_authority_versions.event_timestamp
    OR (
      EXCLUDED.event_timestamp =
        public.classroom_authority_versions.event_timestamp
      AND public.classroom_authority_versions.deleted = FALSE
      AND p_role = 'student'
      AND EXISTS (
        SELECT 1
        FROM public.classroom_memberships AS current_membership
        WHERE current_membership.clerk_membership_id = p_id
          AND current_membership.classroom_id = p_classroom_id
          AND current_membership.clerk_user_id = p_user_id
          AND current_membership.role = 'teacher'
      )
    )
  RETURNING TRUE INTO applied;

  IF applied IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.classroom_memberships (
    classroom_id,
    clerk_user_id,
    clerk_membership_id,
    role
  )
  VALUES (p_classroom_id, p_user_id, p_id, p_role)
  ON CONFLICT (clerk_membership_id) DO UPDATE SET
    classroom_id = EXCLUDED.classroom_id,
    clerk_user_id = EXCLUDED.clerk_user_id,
    role = EXCLUDED.role,
    updated_at = NOW();
  RETURN TRUE;
END;
$$;

CREATE FUNCTION delete_classroom_membership(
  p_id TEXT,
  p_event_timestamp BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  applied BOOLEAN;
BEGIN
  IF p_id !~ '^orgmem_[A-Za-z0-9_-]{3,120}$'
     OR p_event_timestamp <= 0 THEN
    RAISE EXCEPTION 'Invalid Classroom Membership deletion input.';
  END IF;

  INSERT INTO public.classroom_authority_versions (
    entity_type,
    entity_id,
    event_timestamp,
    deleted
  )
  VALUES ('membership', p_id, p_event_timestamp, TRUE)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    event_timestamp = EXCLUDED.event_timestamp,
    deleted = TRUE,
    updated_at = NOW()
  WHERE EXCLUDED.event_timestamp >
      public.classroom_authority_versions.event_timestamp
    OR (
      EXCLUDED.event_timestamp =
        public.classroom_authority_versions.event_timestamp
      AND public.classroom_authority_versions.deleted = FALSE
    )
  RETURNING TRUE INTO applied;

  IF applied IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.classroom_memberships
  WHERE clerk_membership_id = p_id;
  RETURN TRUE;
END;
$$;

ALTER FUNCTION sync_classroom(TEXT, TEXT, BIGINT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION delete_classroom(TEXT, BIGINT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION sync_classroom_membership(TEXT, TEXT, TEXT, TEXT, BIGINT)
  OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION delete_classroom_membership(TEXT, BIGINT)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON TABLE classroom_authority_versions
  FROM PUBLIC, echo_maze_runtime;
REVOKE ALL ON FUNCTION sync_classroom(TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_classroom(TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  sync_classroom_membership(TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  delete_classroom_membership(TEXT, BIGINT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION sync_classroom(TEXT, TEXT, BIGINT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION delete_classroom(TEXT, BIGINT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION
  sync_classroom_membership(TEXT, TEXT, TEXT, TEXT, BIGINT)
  TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION delete_classroom_membership(TEXT, BIGINT)
  TO echo_maze_runtime;
