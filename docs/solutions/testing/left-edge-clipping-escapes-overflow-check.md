---
title: A layout breakpoint move clipped the left column and the overflow check missed it
category: testing
trigger: "breakpoint change; content cut off at the left edge between 768 and 928 pixels"
---

# A layout breakpoint move clipped the left column and the overflow check missed it

[LOGIC/BOUNDARY]

## Problem

A ticket moved the shared single-column collapse from 58rem to 48rem to match the
768px design rule. The three-column play grid then rendered at 800 to 844 pixels.
It needs about 58rem. The status deck sat 26 to 48 pixels past the left edge.

## Root cause

- The grid centers a fixed minimum width. Extra width leaves on both sides, so the
  left side goes negative.
- `scrollWidth - clientWidth` only measures overflow to the right. Content past the
  left edge cannot scroll, so the check passed.

## Fix

- The collapse stays at 58rem. Only the portrait phone board block uses 48rem.
- `tests/e2e/layout-redesign.spec.js` now fails when `.play-grid` or a direct child
  has `left < -1`. The test was proven red with the 48rem rule.
- `design.md` explains why the layout breakpoint differs from the phone breakpoint.

## Prevention

A breakpoint move needs a left-edge check at each edge viewport, not only a
horizontal scroll check.
