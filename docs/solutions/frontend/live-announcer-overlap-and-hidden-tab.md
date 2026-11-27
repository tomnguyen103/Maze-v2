---
title: A deferred live region write lands after a newer call, and stops in a hidden tab
category: frontend
date: 2026-11-27
trigger: "Debrief pass on PR 313: two announceInto calls less than two frames apart write the old message"
delete: the call counter and the timer path, when announceInto writes the text in one synchronous step
---

# A deferred live region write lands after a newer call, and stops in a hidden tab

## Symptom

`announceInto` clears the region, moves it one frame later, and writes the text one more frame later.
Call A runs, frame 1 runs, then call B starts. Frame 2 runs the second step of call A.
That step writes the old message of call A over the clear of call B.
In a hidden tab, `requestAnimationFrame` does not fire, so the move and the write wait until the tab shows.

## Root cause

Each call scheduled its frames with no link to later calls.
The animation frame queue is first in, first out, so an older step always runs first.

## Fix

- A per-region call counter in a `WeakMap`. Each deferred step returns early when a newer call started.
- A local `frame` helper uses `setTimeout(cb, 0)` when `document.hidden` is true, else `requestAnimationFrame`.

Regression tests: `tests/live-announcer.test.js`, the overlapping call test and the hidden tab timer test.
Both fail on the old code.
