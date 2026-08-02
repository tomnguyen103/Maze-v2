# Quest identity must survive active-run recovery

## Problem

Quest II startup began rejecting an otherwise valid active-run locator after
the recovery identity was extended with `questId`. The browser failure surfaced
on reload and resume paths, including the Campfire milestone checks in
`tests/e2e/milestone-1.spec.js:137-144` and `tests/e2e/milestone-1.spec.js:342-349`.

## What did not work

The first implementation added `questId` to the locator produced by the main
startup flow, but treated the recovery identity as an exact fixed-key record.
That made `controller.begin(locator)` reject the new identity before the run
could be persisted. A focused gameplay check also passed before the full
desktop/mobile matrix exposed the reload-only failure, so the isolated check
was insufficient evidence.

## Root cause

`normalizeIdentity` in `src/game/active-run-recovery.js:760-805` accepted only
the legacy v2 key set or the complete v3 key set. The new Quest identity was
optional for older stored records, but the validator had no valid v3 shape for
the required fields plus `questId` until the fix. Separately, reload startup
needed to put the current Quest identity back on the locator before recovery
comparison; that propagation is in `src/main.js:2421-2501`.

## Fix

The recovery validator now accepts both backward-compatible v3 identities and
v3 identities with a validated `questId`, while `sameIdentity` compares the
optional Quest field when present (`src/game/active-run-recovery.js:770-873`).
Fresh and shared startup locators carry the active progress Quest identity
before authorization and recovery (`src/main.js:2430-2501`). Regression
coverage records the identity and rejects a mismatched Quest (`tests/active-run-recovery.test.js:470-493`).

## Verification

- Focused desktop recovery checks: 2 passed.
- Focused mobile recovery checks: 2 passed.
- The full matrix is rerun as part of the final browser gate.

## Transferable lesson

When an identity record gains an optional binding field, update three seams
together: storage validation, equality comparison, and every reload/start path
that reconstructs the identity. A unit test for the stored record should be
paired with a browser reload test because persistence can strip fields that
are present in the in-memory locator.
