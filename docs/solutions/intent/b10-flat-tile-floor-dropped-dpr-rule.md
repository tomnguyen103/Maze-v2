---
title: The B-10 tile floor dropped the device ratio rule
category: intent
trigger: "debrief drift on #325: a flat 24 px tile floor"
---

# The B-10 tile floor dropped the device ratio rule

## Problem

Decision 3 in `docs/research/2026-11-27-popup-art-spike.md` sets the board tile to at least 48 device px: tile CSS px = max(24, ceil(48 / devicePixelRatio)). Plan §13 repeats the rule.

#325 shipped the B-10 floor in `src/daylight.css` as `calc(var(--board-size, 0) * 24px)`. At DPR 1 a tile was 24 device px, so the Warden Mode badge glyph failed the glyph rule that the spike measured. The plan §14 row then said "a 24 px tile floor" and hid the change.

## Root cause

- The plan ticket line for B-10 names "the 24 px tile rule". The ticket text did not repeat the device ratio part.
- The slice read the ticket line and not the spike decision that closed the R0b risk.
- The reviewers and CodeRabbit checked the diff against the ticket line, so none of them saw the gap. The debrief blind-spot pass read the spike and found it.

## Fix

- `tileFloor(devicePixelRatio)` in `src/game/canvas-renderer.js` returns max(24, ceil(48 / devicePixelRatio)).
- The renderer sets `--tile-floor` on the canvas. The play board rule uses `calc(var(--board-size, 0) * var(--tile-floor, 24px))`.
- The follow key now holds the frame width and height, so a rotation follows the Explorer again.
- `tests/canvas-follow.test.js` checks the floor at DPR 1, 1.5, 2 and 3.

## Lesson

- A ticket line that names a closed risk carries the rule from the closing decision, not a short name for it.
- Before a slice builds a rule from a spike, read the spike decision and test each case it names.
