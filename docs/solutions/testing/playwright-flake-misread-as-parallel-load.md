# A Playwright flake that was never about parallel load

## Problem

`announces the Mixed Trail continuation once per Quest`
(`tests/e2e/game.spec.js:729`) failed intermittently across Milestone 4 — twice
on the mobile project, once on desktop — roughly one full-suite run in two. It
always passed when run alone. The failure was always the same assertion: the
second `#challenge-dialog` never became visible.

## What did not work

- **Raising the dialog wait 5s → 15s.** Milestone 3 recorded a real
  lazy-chunk-under-load race with sibling dialog waits, so this case was filed
  under the same class and re-timed to match. It failed again at 15 seconds,
  with the locator resolving 33 times to a hidden dialog — the element existed
  the whole time and simply never opened. A wait cannot fix a dialog nothing
  opens.
- **Running the case in isolation to "confirm" the load theory.** Isolation
  passes were read as evidence for load. They were actually seed luck: a single
  isolated run redraws the seed just like a suite run does, and 77.6% of seeds
  — about 8 in 10 — lay out a Labyrinth the case can pass on.

## Root cause

Two independent defects in the test, neither related to worker count.

1. **Plan/position desync.** `milestoneWinningPlan(seed, 1)` returns a
   deterministic action list — moves interleaved with `answer` markers at the
   exact points a challenge fires. The case walked the *whole* list, broke out
   when the first dialog appeared, answered it, then walked the list again
   **from index 0** while the Explorer stood mid-Labyrinth. Those replayed moves
   were already spent, so the second walk wandered a path the plan never
   described and reached a second challenge only by accident.

2. **Random Quest seed.** `createSeed()` (`src/main.js:4423`) names a seed from
   `crypto.getRandomValues`, and starting a Quest redraws until the Labyrinth
   fingerprint is unused (`src/main.js:2228`). Walking all 4200 seeds that
   function can name through `milestoneWinningPlan`, 939 — 22.4% — lay out a
   Labyrinth holding fewer than two challenges: 832 hold one and 107 hold none
   at all. For those seeds the case has no second challenge to reach, so even a
   correctly-walked plan fails.

Defect 1 masked defect 2: the accidental wandering was the only thing that ever
reached a second challenge on a single-challenge seed.

## Fix

- Walk the plan with one cursor that stops at the plan's own `answer` markers
  (`tests/e2e/game.spec.js:781`) — the invariant `completeMilestonePlan`
  already relies on. Position and plan stay in step across the answer.
- Pin the Quest seed by serving `crypto.getRandomValues` from a fixed counter
  (`pinQuestSeed`, `tests/e2e/game.spec.js:581`), asserted against
  `#seed-value` in the case itself. A *counter*, not a constant: the redraw
  loop discards repeats, so a constant draw starves it. The pinned value is the
  seed the Quest settles on, which depends on how many draws the page makes
  before the Quest starts — the on-screen assertion is what makes that
  dependency fail loudly rather than silently re-flake.
- Assert in the case that the pinned plan holds at least two `answer` markers,
  so a Labyrinth-generation change that costs the second challenge fails on
  that line instead of as an unexplained missing dialog.

Seed pinning goes through the draw rather than `?seed=`: a shared seed is only
honoured with `level` and `labyrinth` beside it
(`hasInvalidSharedParameters`, `src/main.js:4472`), and that URL enters a
hydrated Run directly, skipping the Deck picker this case exercises.

Verified at 12 consecutive passes (`--repeat-each=6` × 2 projects), then two
consecutive clean full suites at 218 passed / 18 skipped / 0 failed.

## The transferable lesson

An existing documented flake class is a hypothesis, not a diagnosis. "Passes in
isolation" distinguishes *nothing* when the test draws random inputs — isolation
redraws too. Before re-timing a wait, check whether the thing being waited for
is even reachable on this run's inputs.
