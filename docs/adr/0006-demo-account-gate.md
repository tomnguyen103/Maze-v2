# 0006: Require an account after one guest demo Run

## Status

Accepted

## Context

ADR 0005 allows guest play when Clerk is unavailable or an Explorer declines to
sign in. Echo Maze now needs a one-Run demo conversion boundary while keeping
authentication outside deterministic gameplay.

## Decision

- A guest Explorer may finish one active Labyrinth Run, including after a
  browser reload.
- When that Run ends through escape or defeat, store a versioned browser-local
  demo-complete record with no Clerk data or deterministic Run data.
- Starting any later Labyrinth as a guest requires Clerk account creation.
  This includes Quest continuation, retry, a new Quest, Run Record replay,
  direct play links, and returning to `/play`.
- While Clerk authentication resolves for a completed guest demo, gameplay
  input and timer updates remain blocked. If Clerk is unavailable, the
  Explorer remains at the account-creation gate.
- A signed-in Explorer is not restricted by the local guest demo record.

## Consequences

- This supersedes ADR 0005's guest-play fallback only after the first completed
  guest Run.
- Maze generation, Warden behavior, Questions, score calculation, and Quest
  Progress stay independent of identity and the demo record.
- Clearing browser storage resets the browser-local demo state; server-side
  entitlement enforcement is outside this change.
