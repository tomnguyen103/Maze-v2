-- P2.2: thresholded Classroom objective signals for Expedition debrief.
-- Apply with DATABASE_ADMIN_URL after migration 0027. Do not apply from app
-- startup.
--
-- The existing projection remains per Classroom member so membership removal
-- and account deletion continue to cascade. This reader deliberately rolls it
-- up before returning data to a Teacher. It does not expose identity fields or
-- raw Journal content, and hides any objective with fewer than three total
-- responses.

BEGIN;

DROP FUNCTION IF EXISTS read_classroom_progress(TEXT);

CREATE FUNCTION read_classroom_progress(p_classroom_id TEXT)
RETURNS TABLE (
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
    progress.objective_id,
    SUM(progress.correct_count)::BIGINT,
    SUM(progress.wrong_count)::BIGINT,
    SUM(progress.hint_count)::BIGINT,
    SUM(progress.skip_count)::BIGINT,
    SUM(progress.total_count)::BIGINT,
    COUNT(*) OVER () > 100 AS truncated
  FROM public.classroom_progress_counts AS progress
  JOIN public.classroom_memberships AS membership
    ON membership.classroom_id = progress.classroom_id
   AND membership.clerk_user_id = progress.clerk_user_id
   AND membership.role = 'student'
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
  GROUP BY progress.objective_id
  HAVING SUM(progress.total_count) >= 3
  ORDER BY progress.objective_id
  LIMIT 100
$$;

ALTER FUNCTION read_classroom_progress(TEXT)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION read_classroom_progress(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION read_classroom_progress(TEXT)
  TO echo_maze_runtime;

COMMIT;
