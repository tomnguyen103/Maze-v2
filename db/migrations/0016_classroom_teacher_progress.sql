-- Phase 8 PR 3: bounded Teacher progress reads.
-- Apply with DATABASE_ADMIN_URL after migration 0015.
--
-- Raw journals remain protected by forced RLS. A trigger projects each
-- Classroom journal into count-only rows, and Teachers can execute one
-- fixed-shape function over that projection.

CREATE POLICY classrooms_member_list
  ON classrooms
  FOR SELECT
  TO echo_maze_runtime
  USING (
    EXISTS (
      SELECT 1
      FROM classroom_memberships AS membership
      WHERE membership.classroom_id = classrooms.id
        AND membership.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
    )
  );

CREATE TABLE classroom_progress_counts (
  classroom_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  hint_count INTEGER NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
  skip_count INTEGER NOT NULL DEFAULT 0 CHECK (skip_count >= 0),
  total_count INTEGER NOT NULL CHECK (total_count > 0),
  PRIMARY KEY (classroom_id, clerk_user_id, objective_id),
  FOREIGN KEY (classroom_id, clerk_user_id)
    REFERENCES classroom_memberships(classroom_id, clerk_user_id)
    ON DELETE CASCADE
);

INSERT INTO classroom_progress_counts (
  classroom_id,
  clerk_user_id,
  objective_id,
  correct_count,
  wrong_count,
  hint_count,
  skip_count,
  total_count
)
SELECT
  journal.classroom_id,
  journal.clerk_user_id,
  event.entry->>'learningObjectiveId',
  COUNT(*) FILTER (
    WHERE event.entry->>'outcome' = 'correct'
  )::INTEGER,
  COUNT(*) FILTER (
    WHERE event.entry->>'outcome' = 'wrong'
  )::INTEGER,
  COUNT(*) FILTER (
    WHERE event.entry->>'outcome' = 'hint'
  )::INTEGER,
  COUNT(*) FILTER (
    WHERE event.entry->>'outcome' = 'skip'
  )::INTEGER,
  COUNT(*)::INTEGER
FROM learning_journals AS journal
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(journal.journal->'events', '[]'::jsonb)
) AS event(entry)
WHERE journal.classroom_id IS NOT NULL
  AND event.entry->>'learningObjectiveId' IS NOT NULL
  AND event.entry->>'outcome' IN ('correct', 'wrong', 'hint', 'skip')
GROUP BY
  journal.classroom_id,
  journal.clerk_user_id,
  event.entry->>'learningObjectiveId';

ALTER TABLE classroom_progress_counts
  OWNER TO echo_maze_tenant_owner;
ALTER TABLE classroom_progress_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_progress_counts FORCE ROW LEVEL SECURITY;

CREATE POLICY classroom_progress_counts_teacher_read
  ON classroom_progress_counts
  FOR SELECT
  TO echo_maze_tenant_owner
  USING (
    classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND EXISTS (
      SELECT 1
      FROM classroom_memberships AS teacher
      WHERE teacher.classroom_id = classroom_progress_counts.classroom_id
        AND teacher.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
        AND teacher.role = 'teacher'
    )
  );

CREATE POLICY classroom_progress_counts_tenant_owner_insert
  ON classroom_progress_counts
  FOR INSERT
  TO echo_maze_tenant_owner
  WITH CHECK (TRUE);

CREATE POLICY classroom_progress_counts_tenant_owner_delete
  ON classroom_progress_counts
  FOR DELETE
  TO echo_maze_tenant_owner
  USING (TRUE);

CREATE FUNCTION refresh_classroom_progress_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.classroom_id IS NOT NULL THEN
    DELETE FROM public.classroom_progress_counts
    WHERE classroom_id = OLD.classroom_id
      AND clerk_user_id = OLD.clerk_user_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.classroom_id IS NOT NULL THEN
    DELETE FROM public.classroom_progress_counts
    WHERE classroom_id = NEW.classroom_id
      AND clerk_user_id = NEW.clerk_user_id;

    INSERT INTO public.classroom_progress_counts (
      classroom_id,
      clerk_user_id,
      objective_id,
      correct_count,
      wrong_count,
      hint_count,
      skip_count,
      total_count
    )
    SELECT
      NEW.classroom_id,
      NEW.clerk_user_id,
      event.entry->>'learningObjectiveId',
      COUNT(*) FILTER (
        WHERE event.entry->>'outcome' = 'correct'
      )::INTEGER,
      COUNT(*) FILTER (
        WHERE event.entry->>'outcome' = 'wrong'
      )::INTEGER,
      COUNT(*) FILTER (
        WHERE event.entry->>'outcome' = 'hint'
      )::INTEGER,
      COUNT(*) FILTER (
        WHERE event.entry->>'outcome' = 'skip'
      )::INTEGER,
      COUNT(*)::INTEGER
    FROM jsonb_array_elements(
      COALESCE(NEW.journal->'events', '[]'::jsonb)
    ) AS event(entry)
    WHERE event.entry->>'learningObjectiveId' IS NOT NULL
      AND event.entry->>'outcome' IN ('correct', 'wrong', 'hint', 'skip')
    GROUP BY event.entry->>'learningObjectiveId';
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$$;

ALTER FUNCTION refresh_classroom_progress_counts()
  OWNER TO echo_maze_tenant_owner;
REVOKE ALL ON FUNCTION refresh_classroom_progress_counts() FROM PUBLIC;

CREATE TRIGGER learning_journals_refresh_classroom_progress_counts
AFTER INSERT OR UPDATE OR DELETE ON learning_journals
FOR EACH ROW EXECUTE FUNCTION refresh_classroom_progress_counts();

GRANT SELECT ON TABLE players TO echo_maze_tenant_owner;

CREATE FUNCTION read_classroom_progress(p_classroom_id TEXT)
RETURNS TABLE (
  student_name TEXT,
  objective_id TEXT,
  correct_count BIGINT,
  wrong_count BIGINT,
  hint_count BIGINT,
  skip_count BIGINT,
  total_count BIGINT,
  truncated BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(NULLIF(player.username, ''), 'Explorer') AS student_name,
    progress.objective_id,
    progress.correct_count::BIGINT,
    progress.wrong_count::BIGINT,
    progress.hint_count::BIGINT,
    progress.skip_count::BIGINT,
    progress.total_count::BIGINT,
    COUNT(*) OVER () > 500 AS truncated
  FROM public.classroom_progress_counts AS progress
  JOIN public.classroom_memberships AS membership
    ON membership.classroom_id = progress.classroom_id
   AND membership.clerk_user_id = progress.clerk_user_id
   AND membership.role = 'student'
  LEFT JOIN public.players AS player
    ON player.clerk_user_id = progress.clerk_user_id
  WHERE p_classroom_id ~ '^org_[A-Za-z0-9_-]{3,120}$'
    AND p_classroom_id =
      NULLIF(current_setting('echo_maze.classroom_id', true), '')
    AND progress.classroom_id = p_classroom_id
    AND EXISTS (
      SELECT 1
      FROM public.classroom_memberships AS teacher
      WHERE teacher.classroom_id = p_classroom_id
        AND teacher.clerk_user_id =
          NULLIF(current_setting('echo_maze.explorer_id', true), '')
        AND teacher.role = 'teacher'
    )
  ORDER BY
    COALESCE(NULLIF(player.username, ''), 'Explorer'),
    progress.clerk_user_id,
    progress.objective_id
  LIMIT 500
$$;

ALTER FUNCTION read_classroom_progress(TEXT)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION read_classroom_progress(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION read_classroom_progress(TEXT)
  TO echo_maze_runtime;
