# Ticket: Echo Fossil account continuity and privacy boundary

Spec: #159  
PR batch: D  
Blocked by: #160

## Slice

Persist the normalized Fossil Collection in account-scoped local storage and a
separate server store. Add the migration, personal GET/PUT route, boundary
queue/retry, account isolation, export, deletion verification, and honest
non-blocking failure status.

## Acceptance

- Guest and account keys are isolated; guest data migrates once on account
  selection and sign-out changes the read scope.
- Server input is re-normalized, account-bound, idempotent, capped, and unions
  distinct fossil IDs without accepting client-authored reviewed text.
- Cloud writes happen only from a terminal Quest boundary; reload and retry do
  not duplicate records or change Quest conflict behavior.
- Export includes Fossil Collection data and deletion verifies no fossils remain.
- Storage/network failures preserve playable local state and report status.
- Unit, route/store, migration, export, deletion, and account-switch tests pass.

## Verification receipt

Before implementation, record the observed failing test name and failure line
in the commit body or ticket comment. The first green receipt must be recorded
after the continuity and privacy tests pass.

Red receipt (2026-08-02, before implementation):
`tests/fossil-continuity.test.js` failed at line 2 because
`../src/game/quest-fossils.js` did not exist (`Cannot find module`).

Green receipt (2026-08-02):
`npx vitest run tests/echo-fossil-migration.test.js tests/echo-fossil-route.test.js tests/echo-fossil-store.test.js tests/fossil-continuity.test.js tests/data-export.test.js tests/delete-user-data.test.js tests/player-client.test.js tests/user-deletion-store.test.js tests/vercel-functions.test.js`
passed: 9 files, 60 tests.
