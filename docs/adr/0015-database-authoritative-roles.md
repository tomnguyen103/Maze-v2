# 15. Database-authoritative roles and a single permission matrix

Date: 2026-07-26

## Status

Accepted

## Context

Every authenticated route answered the same question — "is there a signed-in
Explorer?" — and nothing else. There was no way to express that a support person
may read the audit log but may not issue a refund, or that content edits belong
to someone other than whoever holds the database password.

Clerk can store a role in `publicMetadata`, which is tempting because it arrives
with the session and costs no query. It is also a claim the client can see and
that a compromised or stale token can carry. A permission model whose source of
truth lives in a token is a permission model that fails open.

## Decision

**One matrix, `shared/permissions.js`.** Server and browser import the same
table. Only the server enforces it. A permission exists only where a route
actually checks it — an unused permission is a claim the code does not back.

**The database row is authoritative.** `user_roles` holds the role, and the
absence of a row means `player`. That keeps the default least-privileged without
a row per Explorer, and it means a `DELETE` is a complete revocation rather than
a state to remember.

**The Clerk claim is a mirror, written but never read.** `publicMetadata.role`
is updated on every change so the browser can hide UI without an extra round
trip. Nothing server-side reads it. A failed mirror write is logged and the
request still succeeds — losing UI polish is not worth losing the grant.

**Unknown resolves to the default, everywhere.** `hasPermission` and
`getRole` both coerce an unrecognised role to `player` rather than throwing. A
forged claim, a stale enum, or a bad write can therefore only ever narrow access.

**The resolver fails closed.** If `user_roles` is unreachable the resolver
returns `player` and logs. An admin briefly seeing 403 is the right failure; the
reverse is not.

**Roles are cached per request, never longer.** The cache hangs off the request
object, so two guards in one request share one query and a role change takes
effect on the very next request.

**Denials do not describe the model.** 403 says "You do not have access to
that" — never which permission was missing or which role the caller holds. The
tests assert that the permission name and role name are absent from the body.

**Self-service is refused twice.** The route rejects an actor changing their own
role, and the migration carries a `CHECK (user_id <> granted_by)` that holds even
if a future call site forgets. The one exception is `system:bootstrap`, which is
how the first admin exists at all.

## Bootstrapping

`scripts/grant-admin.mjs` exists only to break the circle: every role change goes
through an endpoint that requires an existing admin. It writes the same audit row
the endpoint would, attributed to `system:bootstrap`, so the chain of custody
starts with a record rather than with an untracked `INSERT`. If the grant
succeeds but its audit row fails, the script exits non-zero and says so — a role
change with no audit row is exactly what phase 1 exists to prevent.

## Consequences

- Every `/api/admin/*` route is permission-checked and audited. There is no
  unguarded path in `server/admin-route.js`, and an unknown admin route returns
  404 rather than falling through.
- Player-facing routes are unchanged. `GET /api/profile` gains an `access` field
  for UI gating; it is additive, and the existing profile tests still pass
  unmodified.
- With no Clerk keys configured there is no admin identity, so admin routes
  answer 401 rather than being silently unguarded.
- One extra query per request that reaches a guarded route, cached per request.
  If that ever matters, the fix is a shorter-lived cache with an explicit
  invalidation path — not trusting the token.
- Roles are global. Per-classroom roles arrive in phase 8 as a separate
  `org_memberships.org_role`, deliberately not overloaded onto this table.
