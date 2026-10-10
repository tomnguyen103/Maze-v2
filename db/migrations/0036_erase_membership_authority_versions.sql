-- 0036: Account erasure removes the Classroom Membership authority versions.
-- Apply with DATABASE_ADMIN_URL after migration 0035. Do not apply from app startup.
--
-- Problem: account deletion runs as the runtime role. Migration 0015 revokes
-- every runtime privilege on classroom_authority_versions. The deletion store
-- deletes from that table directly, so each account deletion fails with
-- "permission denied" and rolls back. No account can be erased.
--
-- Fix: a SECURITY DEFINER function deletes the Membership versions of one
-- Explorer as the table owner. The function accepts only the Explorer of the
-- current tenant context, so the runtime cannot erase the versions of another
-- Explorer. The function returns TRUE when no Membership version of that
-- Explorer remains. It runs before the Memberships are deleted, because the
-- Membership rows are the only link from a version to the Explorer.
--
-- Rollback (an agent never runs it): drop the function. The deletion store
-- from before 0036 then fails as described above.

BEGIN;

CREATE OR REPLACE FUNCTION erase_membership_authority_versions(
  p_clerk_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_clerk_user_id IS DISTINCT FROM
     NULLIF(current_setting('echo_maze.explorer_id', true), '') THEN
    RAISE EXCEPTION 'Membership authority erasure needs the Explorer tenant context.';
  END IF;

  DELETE FROM public.classroom_authority_versions AS authority
  WHERE authority.entity_type = 'membership'
    AND authority.entity_id IN (
      SELECT membership.clerk_membership_id
      FROM public.classroom_memberships AS membership
      WHERE membership.clerk_user_id = p_clerk_user_id
    );

  RETURN NOT EXISTS (
    SELECT 1 FROM public.classroom_authority_versions AS authority
    WHERE authority.entity_type = 'membership'
      AND authority.entity_id IN (
        SELECT membership.clerk_membership_id
        FROM public.classroom_memberships AS membership
        WHERE membership.clerk_user_id = p_clerk_user_id
      )
  );
END;
$$;

ALTER FUNCTION erase_membership_authority_versions(TEXT)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION erase_membership_authority_versions(TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erase_membership_authority_versions(TEXT)
  TO echo_maze_runtime;

COMMIT;
