# Running the database and object-store test lanes

Eight test files — 18 tests — need a live PostgreSQL database, and one needs an
object store. They are written as `describe.runIf(...)`, so with the environment
absent they report as skipped and the suite still exits 0.

That is how the repository's strongest security assertion, forced-RLS
cross-tenant denial in `tests/classroom-rls.integration.test.js`, executed
nowhere while every gate run reported green. The A+ audit filed it as `T-02`.

## What changed

- `npm test` still runs with no database, and still reports those 18 as
  skipped — but `scripts/vitest-test-count.json` now pins `skipped`, so the
  count cannot grow silently. Moving a test from executed to skipped fails the
  gate.
- `npm run test:db` runs the lanes for real. It refuses to start without the
  environment they need, and fails if a lane it was asked to run executed
  nothing. A skipped lane can no longer look like a pass.

## The command

```bash
RUN_DATABASE_INTEGRATION=1 \
DATABASE_URL='postgres://echo_maze_app:PASSWORD@HOST/echo_maze' \
DATABASE_ADMIN_URL='postgres://echo_maze_tenant_owner:PASSWORD@HOST/echo_maze' \
npm run test:db
```

PowerShell:

```powershell
$env:RUN_DATABASE_INTEGRATION='1'
$env:DATABASE_URL='postgres://echo_maze_app:PASSWORD@HOST/echo_maze'
$env:DATABASE_ADMIN_URL='postgres://echo_maze_tenant_owner:PASSWORD@HOST/echo_maze'
npm run test:db
```

To include the audit-checkpoint object-store lane, add every variable the sink
itself reads — `loadAuditCheckpointConfig` returns `null` if any is absent, and
the lane then throws rather than skipping:

```bash
RUN_AUDIT_SINK_INTEGRATION=1 \
AUDIT_CHECKPOINT_TEST_BUCKET='echo-maze-audit-test' \
AUDIT_CHECKPOINT_BUCKET='echo-maze-audit' \
AUDIT_CHECKPOINT_REGION='us-east-1' \
AUDIT_CHECKPOINT_ACCESS_KEY_ID='...' \
AUDIT_CHECKPOINT_SECRET_ACCESS_KEY='...' \
AUDIT_CHECKPOINT_HMAC_KEY='...'
```

The object-store lane can be run on its own: set only the variables above and
`npm run test:db` runs that one file.

## The roles matter

`DATABASE_URL` must be the **least-privileged runtime role** the application
itself uses. The forced-RLS assertions are meaningless against a superuser or a
table owner: `FORCE ROW LEVEL SECURITY` exists precisely so the owner is not
exempt, and `BYPASSRLS` would make every cross-tenant denial test pass for the
wrong reason.

`DATABASE_ADMIN_URL` is the migration/owner role. The lane uses it to seed and
tear down fixtures.

## Which database

Point it at a scratch database, never at production. The lanes create and drop
their own fixture rows, and `tests/classroom-rls.integration.test.js` asserts
denial by attempting cross-tenant reads.

Migrations `0001` through `0017` are applied to the live database;
`0018` through `0029` are not. A scratch database for this lane should have the
full migration set applied, or the newer tables the lanes touch will not exist.

## What this does not cover

Two audit items still need a live database and are not satisfied by this lane:
the `dashboard-creation` G2 (data contract) and G10 (machine diff) gates. Both
are recorded as externally blocked in the audit report.
