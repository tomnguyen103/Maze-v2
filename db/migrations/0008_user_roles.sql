-- Server-side source of truth for roles.
--
-- The role is mirrored into Clerk publicMetadata for cheap client-side UI
-- gating, but this table is authoritative: the server never trusts the claim.
--
-- Absence of a row means 'player'. That keeps the default least-privileged
-- without needing a row per Explorer.

CREATE TABLE user_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'player')),
  -- Clerk user id of the granting admin, or 'system:bootstrap' for the first
  -- admin created by scripts/grant-admin.mjs.
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Self-promotion is refused in the route as well; this is the backstop that
  -- holds even if a future call site forgets.
  CHECK (user_id <> granted_by OR granted_by = 'system:bootstrap')
);

CREATE INDEX user_roles_role_idx ON user_roles (role, user_id);
