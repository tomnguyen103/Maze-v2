# Product storage snapshots must exclude Clerk bootstrap state

## Problem

The desktop/mobile browser matrix failed the Practice Intention storage case
on desktop while the mobile counterpart passed. The case compared the entire
`localStorage` object before and after rejecting an invalid Quest Level choice
in the `/play` flow (`tests/e2e/game.spec.js:724-760`).

## What did not work

- Comparing every local-storage key treated Clerk's asynchronous
  `__clerk_environment` bootstrap write as Echo Maze state.
- Re-running the full matrix without changing the observation boundary only
  changed whether Clerk finished initializing before the snapshot.

## Root cause

Clerk initializes asynchronously during `/play`. Its development bootstrap can
write `__clerk_environment` after the test captures `beforeRejectedReview`.
The browser also retains the test's `echo-maze:first-light:v1` marker. The
Practice Intention contract concerns product-owned storage only; Clerk-owned
keys are outside that contract (`tests/e2e/game.spec.js:724-760`).

## Fix

The affected browser proofs now snapshot every sorted `localStorage` key except
the known asynchronous Clerk bootstrap key, `__clerk_environment`. The Practice
Intention test uses `readPracticeStorage`
(`tests/e2e/game.spec.js:28-43`) for all rejected Review, Challenge, cancel, and
no-intention assertions (`tests/e2e/game.spec.js:763-823`); the Classroom
privacy proof applies the same boundary while inspecting browser state
(`tests/e2e/classroom.spec.js:347-368`).

## Verification

The original full run reproduced one desktop failure with 247 passed and 20
intentional skips across 268 cases. The focused desktop test passed after the
change. The final desktop/mobile matrix passed 248 cases with 20 intentional
skips and no failures across all 268 cases.

## Transferable lesson

Browser state assertions must observe the ownership boundary of the behavior
under test. Third-party bootstrap state belongs outside product-state snapshots.
