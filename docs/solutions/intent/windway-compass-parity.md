---
title: The Trail Compass named a Windway only when its source was known
category: intent
trigger: "screen reader text omits a Windway that the board draws"
---

# The Trail Compass named a Windway only when its source was known

## Problem

The board draws a Windway when either end is known (rule B-83). The Trail Compass text
named a Windway only when the source was known. A player who knew only the destination saw
the Windway on the board, but the Compass text did not mention it.

## Root cause

The renderer rule B-83 widened to "either end known" in R1a (`src/game/canvas-renderer.js:245-249`).
The Compass loop kept the older "source known" check and no test compared the two surfaces.

## Fix

`src/game/trail-compass.js:240-250` now picks the known end, source first. It names the Windway
when that end is known and the destination is a passage. "Seen by Pulse" uses the same known end.
The engine rule "the destination must be a passage" stays.
Two tests in `tests/trail-compass.test.js` cover a destination-only Windway and a Windway with
neither end known.

delete: none — the two surfaces keep separate code, and the parity tests guard the rule.
