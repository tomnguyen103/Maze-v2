---
title: Two database lane tests went stale after a migration and an ADR changed
category: testing
trigger: The player-store or classroom-rls integration test fails in `npm run test:db` while the unit gate is green.
---

# Two database lane tests went stale after a migration and an ADR changed

## Problem

The database lane runs only on request, so two tests failed without notice.

- The player-store test ran migration 0019 inside `BEGIN` and `ROLLBACK`.
  Migration 0019 commits inside its backfill and builds an index
  `CONCURRENTLY`, so it cannot run inside a transaction block.
- The classroom-rls test expected `registerDomain` to arm auto-join. ADR 0023
  and migration 0030 make auto-join opt-in, so the default is `false`.

## Root cause

The tests encoded behavior from before the migration and the ADR. The unit
gate does not run them, so no push caught the drift.

## Fix

- The player-store test runs 0019 one top-level statement at a time on a
  session temp table, with no outer transaction. It drops the temp table in
  `finally`, and it drops the session when the test fails. Migration 0019
  stays unchanged.
- The classroom-rls test asserts the default `false`, then registers again
  with `true`, so the later auto-join checks hold.

## How to recognise it again

A migration with `COMMIT` in a `DO` block or with `CONCURRENTLY` cannot run
inside a test transaction. Run `npm run test:db` on a scratch cluster after a
change to a migration or to an ADR that a lane test encodes.