---
title: The Pilot Chart painted passages as land
category: frontend
trigger: "Labyrinth passages render as land and walls render as water"
escaped: b5d6777
should-catch: test
---

# The Pilot Chart painted passages as land

## Problem

PR #274 (`b5d6777`) moved the board to the Pilot Chart look. The renderer
collected each passage cell (1) into the land fill. ADR 0052 item 1 says that a
passage is water and a wall is land. The board showed the inverse map.

## What did not work

The renderer tests. They asserted the land fill on passage cells, so they encoded
the inversion and passed.

## Root cause

The test oracle came from the implementation, not from ADR 0052. A test that
copies the code's output cannot catch a wrong rule.

## Fix

`src/game/canvas-renderer.js:182` now collects the wall cells (0) as land, with an
ADR 0052 comment at `src/game/canvas-renderer.js:187`. The tests at
`tests/canvas-renderer.test.js:1010` and `tests/canvas-renderer.test.js:1038`
assert that a passage is water and a wall is land, coastline included. Each changed
assertion cites ADR 0052.

delete: none — the land collection is the one path; the ADR citation in the test
is the oracle.
