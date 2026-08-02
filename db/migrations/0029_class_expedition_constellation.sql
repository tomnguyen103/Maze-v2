-- P2.3: aggregate-only Class Expedition Constellation reader.
-- Apply with DATABASE_ADMIN_URL after migration 0028. Do not apply from app startup.
--
-- This migration adds no table. It reads terminal Classroom Run Grant
-- aggregates through the existing forced-RLS source tables. The runtime sees
-- only threshold-eligible milestone counts, which the application immediately
-- projects into density bands; no personal or route record is added.

BEGIN;

CREATE FUNCTION read_class_expedition_constellation(
  p_classroom_id TEXT,
  p_expedition_id TEXT
)
RETURNS TABLE (
  labyrinth_number SMALLINT,
  completed_count BIGINT,
  escaped_student_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH gate AS (
    SELECT expedition.id, expedition.atlas_region
    FROM public.class_expeditions AS expedition
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
  ),
  cohort AS (
    SELECT COUNT(DISTINCT grants.clerk_user_id)::BIGINT
      AS escaped_student_count
    FROM public.classroom_run_grants AS grants
    WHERE grants.expedition_id = p_expedition_id
      AND grants.status = 'escaped'
  ),
  milestones AS (
    SELECT
      lab.n::SMALLINT AS labyrinth_number,
      COUNT(DISTINCT grants.clerk_user_id) FILTER (
        WHERE grants.status = 'escaped'
      ) AS completed_count,
      cohort.escaped_student_count
    FROM gate
    CROSS JOIN cohort
    CROSS JOIN LATERAL generate_series(
      (gate.atlas_region - 1) * 4 + 1,
      gate.atlas_region * 4
    ) AS lab(n)
    LEFT JOIN public.classroom_run_grants AS grants
      ON grants.expedition_id = p_expedition_id
     AND grants.labyrinth_number = lab.n
    GROUP BY lab.n, cohort.escaped_student_count
  )
  SELECT
    milestones.labyrinth_number,
    milestones.completed_count,
    milestones.escaped_student_count
  FROM milestones
  WHERE milestones.escaped_student_count >= 20
    AND milestones.completed_count >= 5
  ORDER BY milestones.labyrinth_number;
$$;

ALTER FUNCTION read_class_expedition_constellation(TEXT, TEXT)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION read_class_expedition_constellation(TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION read_class_expedition_constellation(TEXT, TEXT)
  TO echo_maze_runtime;

COMMIT;
