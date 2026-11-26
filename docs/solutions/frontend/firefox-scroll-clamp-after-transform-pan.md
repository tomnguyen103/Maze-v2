---
title: Firefox moves a centered element after a transform pan shrinks the scroll area
category: frontend
date: 2026-11-25
trigger: "Atlas Center Current: landmark center 3.6 to 24 px off on X in Firefox only"
delete: the kept scroll offset — Center Current sets scrollLeft and scrollTop to 0, so no stale offset exists to clamp
---

# Firefox moves a centered element after a transform pan shrinks the scroll area

## Symptom

In the Quest Atlas, the test scrolls the viewport, zooms in, and clicks Center Current.
Chromium and WebKit center the current landmark. Firefox leaves it 3.6 to 24 px off on X.
The failure shows only under load: 14 of 18 runs failed with
`--repeat-each=18 --workers=6`. A single run passes.

## What did not work

- Finishing the canvas animations with `getAnimations().finish()` before the measure.
- A style flush before `transition: none`. The miss grew.
- Analytic `offsetLeft` math in place of `getBoundingClientRect()`. It also broke WebKit.

## Root cause

The zoom transform widens the scrollable overflow of the viewport, and the test sets
`scrollLeft` to 120. The pan math reads the rects with that offset in place. The new pan
shrinks the scroll area, so the kept offset goes out of range. Firefox clamps
`scrollLeft` after the click handler, and the landmark shifts by the clamp amount.
The proof: the untransformed landmark moved by exactly the miss (18.28 px).

## Fix

The Center Current handler in `src/game/quest-atlas-view.js:402` sets
`viewport.scrollLeft = 0` and `viewport.scrollTop = 0` before it reads the rects.
The pan alone centers the landmark. After the fix, 36 of 36 runs passed over Firefox,
WebKit, and iPhone at `--repeat-each=12 --workers=6`.

## Prevention

When a transform moves content inside a scroll container, own the scroll offset too.
Reproduce a Firefox-only geometry miss under `--repeat-each` and parallel workers.
