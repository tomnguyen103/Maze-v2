---
title: Compare scroll size to client size, not to the layout box
category: testing
trigger: "scrollWidth is greater than a fractional box width by less than 1px"
---

# Compare scroll size to client size, not to the layout box

## Problem

Four Region fit checks failed by less than one pixel after the panels gained
rounded borders.

## What did not work

Comparing `scrollWidth` with `getBoundingClientRect().width`.

## Root cause

`scrollWidth` and `clientWidth` are rounded integers. The bounding box is a
fraction and includes the border. An element with no overflow can still have a
`scrollWidth` above its box width.

## Fix

Assert `scrollWidth <= clientWidth` and `scrollHeight <= clientHeight`. Both
sides are then integers from the same box. See the Region 3 and Region 4 fit
checks in `tests/e2e/game.spec.js`.
