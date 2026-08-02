# Workshop overflow at 200 percent text

## Problem

The desktop Playwright project reproduced horizontal overflow in the Lantern
Trail Workshop at the 200 percent text-size profile. The isolated test passed,
but the complete desktop/mobile matrix reproduced a 67px overflow in the
Workshop dialog. The assertion lives at
`tests/e2e/game.spec.js:3878-3891`.

## What did not work

Running the focused test alone was not enough evidence: it passed because the
mobile project and the isolated desktop run did not reproduce the same layout
conditions. Treating the result as parallel flakiness would have left the
desktop 200 percent text path broken.

## Root cause

The global button rule kept button content on one line. At the desktop
project's 390px viewport, the 200 percent text media rule changed the
`.practice-objective` grid to `1fr`, but the grid item still honored its
min-content width. The question label therefore forced a roughly 333px track
inside a 250px button, while the Workshop dialog was only 314px wide.

The affected rule is in `src/learning/lantern-trail.css:113-117`; the dialog's
overflow contract is exercised by `tests/e2e/game.spec.js:3878-3891`.

## Fix

The narrow-screen rule now uses `minmax(0, 1fr)` and restores normal wrapping
for the objective grid (`src/learning/lantern-trail.css:113-117`). This lets
the track shrink to the available button width while preserving readable
200 percent text.

## Verification

- Focused desktop/mobile Workshop test: 2 passed.
- Full desktop/mobile Playwright matrix: 230 passed, 20 intentional skips.
- Full local gate: lint, typecheck, Vitest, build, and bundle budget passed.

## Transferable lesson

When an accessibility layout assertion passes in isolation but fails under a
matrix, inspect the computed grid track and min-content constraints before
adding waits or quarantining the test. Parallel execution can expose a real
responsive defect even when the failure is project-specific.
