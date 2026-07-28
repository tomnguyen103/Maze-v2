# Classroom operations

Echo Maze maps one Classroom to one Clerk Organization. Clerk synchronizes
identity events; PostgreSQL Classroom Memberships remain the authority used by
every read and write. A missing or delayed webhook denies access.

## Provider setup

1. Enable Organizations in the Clerk instance.
2. Keep the default roles. Echo Maze maps `org:admin` to Teacher and
   `org:member` to Student.
3. Configure the signed `/api/clerk-webhook` endpoint for:
   `user.created`, `user.updated`, `user.deleted`,
   `organization.created`, `organization.updated`, `organization.deleted`,
   `organizationMembership.created`, `organizationMembership.updated`, and
   `organizationMembership.deleted`.
4. Set `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET`.
5. Allow the deployed application's `/class` route in Clerk's redirect
   configuration. Echo Maze sends that path on Organization invitations.

Do not create local authority from a successful Clerk API response. Classroom
creation returns `awaiting-webhook`; `/class` displays it only after the signed
Organization and Membership events commit through the durable inbox.

## Database release order

Apply migrations 0014 through 0017 with `DATABASE_ADMIN_URL`, in that order:

- 0014 adds nullable Classroom scope, a non-login tenant owner, transaction-local
  context, and forced RLS while preserving Personal Play.
- 0015 adds monotonic Clerk authority writes and Class Play writes for Quest
  Progress, Lantern Journal, and Score Entries.
- 0016 adds a trigger-maintained count projection and the bounded Teacher read.
- 0017 adds the forced-RLS Verified Classroom Domain mapping and bounded
  register/read/lookup functions used by domain auto-join.

The application login named by `DATABASE_URL` must inherit
`echo_maze_runtime`. It must not be superuser, tenant-table owner, or hold
`BYPASSRLS`. Run the disposable PostgreSQL proof from `docs/SETUP.md` before
release.

## Runtime behavior

`/class` provides:

- Personal Play, which clears the selected Classroom and keeps existing rules;
- Class Play, which stores one validated Organization id in browser storage;
- Classroom creation for signed-in Explorers;
- Verified Classroom Domain registration for synchronized Teachers;
- Student invitations for database-authoritative Teachers; and
- per-Student/per-objective counts for Teachers.

The API surfaces are:

- `GET /api/classrooms`
- `POST /api/classrooms`
- `POST /api/classrooms/:id/invitations`
- `GET /api/classrooms/:id/progress`
- `GET /api/classrooms/:id/domain`
- `PUT /api/classrooms/:id/domain`

Creation is limited to 3/hour per signed-in user and invitations to 20/hour.
Clerk also applies provider limits. UI visibility is never authorization:
invitation and progress routes re-check the selected Membership in PostgreSQL.
Domain registration also re-checks Teacher Membership, verifies the exact domain
of the Teacher's primary verified Clerk email, rejects public mailbox providers,
and allows one Classroom owner per domain.

## Privacy boundary

Teacher progress contains Student display name, objective id, and correct,
wrong, Hint, Skip, and total counts. It contains no prompts, selected answers,
answer text, Question timestamps, or raw Journal JSON.

`learning_journals` stays behind its Explorer-only forced-RLS policy. Migration
0016 derives count rows whenever a Classroom Journal changes; the runtime has
no direct read grant on that projection. One fixed-shape definer function
returns at most 500 rows for the selected Classroom after a Teacher check.

Removing a Membership cascades that Explorer's Class Play Quest Progress,
Journal, Score Entries, and derived counts. Account deletion removes all
Memberships and Class Play data. Personal Play remains when only one Classroom
Membership is removed.

## Failure and support

- New Classroom absent: confirm the Clerk events arrived, inspect the webhook
  inbox/dead-letter view, retry safely, then refresh `/class`.
- Student denied after accepting: confirm the Membership event synchronized;
  never insert a local Membership manually to bypass a delayed webhook.
- Matching-domain Student not joined: confirm migrations through 0017 are
  applied, `user.created` and `user.updated` are subscribed, and the Clerk
  Membership event followed the user event. See `docs/sso.md`.
- Domain rejected: use the exact domain from the Teacher's primary verified
  Clerk email. Public mailbox domains and domains already assigned to another
  Classroom are intentionally rejected.
- Invitation denied: confirm the caller is a synchronized Teacher and that
  Clerk Organizations are enabled.
- Counts absent: confirm the Student used Class Play for that Classroom and
  migration 0016 is applied. Do not grant Teacher access to raw Journals.
- Provider outage: creation/invitation returns a bounded safe error. Existing
  Personal Play and synchronized Class Play remain available.
- Database context failure: the transaction rolls back and its local Explorer
  and Classroom settings clear before the pooled connection is reused.

Rollback is reverse expand-contract and is documented in `docs/SETUP.md`.

## Verification

```powershell
npm run check
npm run test:e2e
```

For a disposable migrated PostgreSQL database:

```powershell
$env:RUN_DATABASE_INTEGRATION = "1"
$env:DATABASE_URL = "<disposable runtime URL>"
$env:DATABASE_ADMIN_URL = "<disposable admin URL>"
npx vitest run tests/classroom-rls.integration.test.js
```

Never run that fixture-producing integration test against production.
