---
title: A one-way Windway trapped the Explorer in a pocket
category: game-logic
trigger: "The Explorer cannot move after a Windway hop; the Gate is unreachable"
escaped: 713d742
should-catch: test
---

# A one-way Windway trapped the Explorer in a pocket

## Problem

Seed `WINDWAY-TRAP-7` at Bright Start Labyrinth 5 (windways-v1) carries the
Explorer over a Windway into a pocket. No move from the pocket reaches the Gate.
The screenshot is `docs/playtests/screenshots/2026-11-25-windway-soft-lock.png`.

## What did not work

The windways-v1 placement check `protectedTilesRemainMutuallyReachable`
in `src/game/game-session.js`. It proves that the protected tiles reach each
other. It does not test the tiles that a one-way hop makes reachable. A pocket
tile is not protected, so the check accepts the trap.

## Root cause

A one-way move breaks the symmetry of the move graph. "The start reaches the Gate"
no longer implies "each reachable tile reaches the Gate". A placement check for a
directed edge must test each reachable tile, not only the endpoints.

## Fix

One shared check, `everyReachableTileReachesObjectives`
in `src/game/game-session.js`. A forward search from the start runs on the
graph with every crossing open (Over). A reverse search from each objective runs
on the base graph plus the Windways (Under). A crossing only adds a move, so the
check holds for each Echo Bridge state and each Tide Door phase (ADR 0053).

- windways-v2 placement calls it in `createRun`.
- Echo Bridge and Tide Door placement call it through `selectShortcutEdges`
  in `src/game/game-session.js`.
- windways-v1 keeps the legacy check, so each v1 seed replays exactly (ADR 0002).

The US-01.1/US-01.2 sweep in `tests/no-soft-lock.test.js` runs an exact search over position and mechanism
state for each ruleset and board size, with at least 300 seeds per group. It also
pins the trap under v1 and its absence under v2 (the US-01.3 tests).
`tests/twist-generation-golden.test.js` pins the placement of the other Twist
revisions, so the shared check cannot change a seed silently.

delete: none — the legacy check stays for windways-v1 replay; new Twist moves call
the shared check (ADR 0053 Consequences).
