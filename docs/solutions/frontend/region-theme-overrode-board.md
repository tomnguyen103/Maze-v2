---
title: Region theme overrode the board frame border
category: frontend
trigger: "The canvas frame keeps the old Region border after the board-ink frame change"
---

# Region theme overrode the board frame border

## Problem

ADR 0067 gives the canvas frame a 3 px board-ink edge. In the capture, the frame kept the old Region border. The unit tests passed.

The edge is an inset `box-shadow`, not a `border`. A 3 px border moves the board and the Neatline by 3 px and grows the frame by 6 px. Four e2e layout tests caught that change.

The shadow sits on the sticky `.neatline-canvas`, not on the `.canvas-frame` scroll container. A scroll container paints its own inset shadow below its content, so a board wider than the frame covered the bottom and right edges.

## What did not work

The tests read the `.canvas-frame` rule in `src/daylight.css` only. They found the new border and passed.

## Root cause

`[LOGIC/BOUNDARY]` `src/game/region-theme.css` had its own `.canvas-frame` border rule on the Region scope. The Region scope rule had a higher specificity, so it beat the base rule. This is the second time that a Region theme rule silently overrode a board style. The first time was the Passage token (`region-theme-overrode-passage-token.md`).

## Fix

Delete the `.canvas-frame` rule from `src/game/region-theme.css`. The Region theme now sets only the Region Hue values.

## Prevention

The class occurred twice, so it has a guard. The test "US-03.2 keeps the board-ink frame border, so no Region theme restyles the canvas frame" in `tests/canvas-renderer.test.js` fails when `region-theme.css` targets `.canvas-frame` or `#maze-canvas`, or sets a board token (`--color-board-*`, `--color-passage`, `--color-land*`, `--color-fog*`, `--color-coastline`, `--color-pulse`).

delete: the Region scope board rules | the Region theme keeps only the Region Hue values, so it has no board rule to override.
