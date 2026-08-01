# Offline Continuity identity boundaries must finish before reuse

## Problem

Two retry and shared-device boundaries could report success too early. A
duplicate offline submission exposed the stored score but not whether the
stored ledger row had been accepted, and identity cleanup started the durable
service-worker scrub without waiting for it to finish.

## What did not work

The submission service treated every duplicate with no pending cloud apply as
accepted. That was correct for an accepted ledger row, but it also converted a
durably rejected replay into a verified retry. A duplicate whose key belonged
to another Run was likewise reported as accepted even though the migration
deliberately returned no outcome for that Run.

Identity cleanup had the same ordering flaw at a different boundary: the
browser-side local scrub ran synchronously, but the worker `signOut` call was
fire-and-forget. The player controller could therefore reduce to the next
Clerk identity and notify the app before durable account-scoped worker state
had been cleared.

## Root cause

The migration's duplicate result carried `state` and the four stored result
fields, but omitted `offline_pending_submissions.accepted`. The service could
not distinguish an accepted ledger row from a rejected replay. The identity
callback contract was synchronous, and `syncAuthenticatedPlayer` invoked it
without awaiting the cleanup promise.

## Fix and proof

`db/migrations/0024_offline_run_continuity.sql:290-410` now returns
`recorded_accepted`, and `server/offline-submission-store.js:80-94` preserves
it. `server/offline-submission.js:312-333` fails closed for an unreadable
cross-Run duplicate and returns a durable rejection as `rejected` without a
cloud write. The regression cases are in
`tests/offline-submission.test.js:279-319`, with adapter and migration shape
coverage in `tests/offline-submission-store.test.js:29-103` and
`tests/offline-migration.test.js:84-103`.

`src/player/player-controller.js:34-38,87-101,447-464` now accepts an async
identity cleanup callback, awaits `onIdentityEnd`, and reports authentication
only after cleanup resolves. `src/player/clerk-browser.js:68-72` adopts that
callback promise for explicit sign-out. `src/main.js:3091-3108` awaits the
bridge's worker scrub, while `src/game/offline-continuity-bridge.js:82-89,142-152`
announces a failure instead of swallowing it. The existing player-controller
regression at `tests/player-controller.test.js:335-361` holds the identity
cleanup promise open and proves the app still reports the old identity until
cleanup completes.
