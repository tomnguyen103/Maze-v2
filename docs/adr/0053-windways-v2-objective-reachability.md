# 0053: Windways v2 and Objective Reachability

- Status: Accepted
- Date: 2026-11-25

## Context

A Windway is a one-way hop. The windways-v1 placement check proves only that the
protected tiles reach each other. It does not prove that every tile the Explorer can
reach still reaches the Gate and each Echo. Seed `WINDWAY-TRAP-7` at Bright Start
Labyrinth 5 carries the Explorer into a pocket with no way back to the Gate. The
screenshot `docs/playtests/screenshots/2026-11-25-windway-soft-lock.png` shows it.

A fix changes the Labyrinth of some existing seeds. ADR 0002 makes a seed replay
exact, and ADR 0026 carries each Trail Twist revision through the active-run identity,
Active Run Recovery, Run Records, shared links, and replay.

## Decision

1. Generation holds Objective Reachability (GLOSSARY.md). From each tile that the
   Explorer can reach, the Gate and each Echo stay reachable.
2. One shared check, `everyReachableTileReachesObjectives` in
   `src/game/game-session.js`, proves it. The check builds two move graphs:
   - Under: the base passages plus the Windways.
   - Over: Under plus every Echo Bridge and Tide Door crossing open.
   A forward search from the start runs on Over. A reverse search from each objective
   runs on Under. The check accepts when each tile of the forward search reaches each
   objective on Under. A crossing only adds a move, so the check holds for each Echo
   Bridge state and each Tide Door phase.
3. Windway, Echo Bridge, and Tide Door placement call the check. A Signal Bell adds
   no move, so Warden Bells place no new edge and need no call.
4. The Developing Region revision becomes `windways-v2`. New Runs start on v2.
5. `windways-v1` stays known for replay, Active Run Recovery, Run Records, offline
   receipts, and shared links. Its generation keeps the legacy check, so each v1 seed
   replays exactly.
6. `classic-v1`, `echo-hush-v1`, `echo-bridges-v1`, `tide-doors-v1`, and
   `warden-bells-v1` keep their revision. The check never rejects a placement in these
   rulesets on the measured seeds. `tests/twist-generation-golden.test.js` pins their
   placement fingerprints, so a change fails the suite.
7. Migration 0037 adds `windways-v2` to `score_entries_ruleset_partition_check`. The
   v1 and v2 scores keep separate partitions (ADR 0037).
8. `design.md` invariant I3 names the v2 revision.

## Consequences

- Yield is unchanged. v1 and v2 each place 2 Windways on 100% of 3600 measured
  boards: Labyrinths 5 to 8, every Quest Level, 300 seeds each.
- `tests/no-soft-lock.test.js` runs an exact search over position and mechanism state
  for every ruleset and board size, at least 300 seeds per group. It also pins the
  `WINDWAY-TRAP-7` trap under v1 and its absence under v2.
- Apply migration 0037 before a release that starts v2 Runs. Until then, each
  escaped v2 score insert fails the check.
- The Tactics Lab drill for Windways uses `windways-v2`. The drill holds no persisted
  state.
- The `windways-v1:*` gameplay tie keys in `src/game/quest-content.js` stay. They are
  persisted Learning keys, not a ruleset identity.
- A later Twist revision that adds a move calls the same check.
