---
title: Layout e2e tests measure the canvas frame, not the canvas
category: testing
trigger: "expect(overlapsMaze).toBe(false)"; "maze.y + maze.height" greater than the viewport height
escaped: 06e580d
should-catch: test
---

# Layout e2e tests measure the canvas frame, not the canvas

## Problem

Two desktop e2e tests failed on `main` after #326:

- "keeps event messages outside the playable maze" (`tests/e2e/game.spec.js:3210`): the event ribbon overlapped the maze box.
- "reflows across required widths and keeps the game in the laptop fold" (`tests/e2e/game.spec.js:5872`): the maze bottom was 803.5 px in an 800 px viewport.

## What did not work

Reading the failures as a layout regression. The ribbon sits below the visible board, and the visible board fits in the fold.

## Root cause

Since #326 the play board CSS sets a tile floor from the device pixel ratio (`src/game/canvas-renderer.js:163`).
A size 15 board is then larger than its frame, and the frame scrolls it (`index.html:201`).
`#maze-canvas` reports the full scrolled canvas box, not the part that the player sees.
The e2e suite is not part of `npm run check` or the pre-push gate, so the merge of #326 did not run it.

## Fix

The tests measure `#canvas-frame`, the visible scroll frame (`tests/e2e/game.spec.js:3223`, `:5896`, `:5909`).

delete: none — the e2e suite stays out of the pre-push gate because it takes minutes; the merge checklist runs `npm run test:e2e` for each browser-facing change.
