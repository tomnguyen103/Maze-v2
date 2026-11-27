---
title: A board overlay with inset 0 misses the canvas by the frame padding
category: frontend
trigger: A motion piece sits about 11 px off its tile, down and to the right, at every width.
---

## Problem

The Popup motion layer places each piece at a percentage of the board: `left = (col + 0.5) / size * 100%`.
The layer used `inset: 0` inside `#canvas-frame`. Each piece sat about 11 px off its tile centre at 1280 px.

## What did not work

The unit tests in `tests/popup-motion.test.js` check the percentage values only. They pass with the bug, because happy-dom does no layout.

## Root cause

`.canvas-frame` has padding (`src/daylight.css:499-500`, `--frame-pad: clamp(1.125rem, 2dvh, 1.25rem)`).
The padding holds the coordinate labels. `#maze-canvas` sits inside that padding.
An absolute child with `inset: 0` fills the padding box, not the content box. So the layer is larger than the canvas by twice the padding.

## Fix

The layer insets by the same custom property (`src/looks/popup/surface.css:289-294`): `inset: var(--frame-pad, 0)`.
The layer box now equals the canvas box. A browser check measures the ripple centre at the tile centre within 0.001 tile at 375, 1280 and 1920 px.

## Check

Measure the overlay piece against `#maze-canvas.getBoundingClientRect()` in the browser, not in a DOM unit test.

delete: none — the frame padding holds the coordinate labels, so it stays. The overlay reads the same custom property, so the two cannot drift.
