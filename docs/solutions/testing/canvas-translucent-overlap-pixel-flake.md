# Translucent canvas strokes that overlap make pixel comparisons flaky

## Problem

The `[mobile]` case at `tests/e2e/daily.spec.js:282` failed about one run in
three on `feat/journey-b-game`. The case compares `canvas.toDataURL()` before and
after a reload. The same case passed 12 of 12 runs on `main`.

## What did not work

- A redraw on `document.fonts` `loadingdone`. The probe showed that the canvas
  size was the same and that `document.fonts.status` was `loaded` in both frames.
- A check of the region theme. `activeRegionTheme()` returns null for a Daily.

## Root cause

The two frames looked identical. A pixel diff showed 17129 changed pixels, with
a maximum change of 4 per channel. Every changed pixel was on a Fog grid line.

The Journey renderer stroked a rectangle for each Fog tile with the translucent
`--color-fog-grid`. Each shared edge got two alpha blends. Chrome can move a
canvas from the GPU raster path to the CPU path after readbacks, and the two
paths round alpha blends differently. Two blends make that difference visible.

## Fix

`drawFogGrid` in `src/game/canvas-renderer.js` adds every Fog tile rectangle to
one path and strokes the path once. A single stroke blends each pixel once.
The daily case then passed 20 of 20 runs with `--repeat-each=10`.

The regression test "strokes the whole Fog grid as one path" in
`tests/canvas-renderer.test.js` checks that the grid is one path and one stroke.

## Rule

Draw translucent canvas lines that share edges as one path. Do not stroke them
per tile when a test compares canvas pixels.
