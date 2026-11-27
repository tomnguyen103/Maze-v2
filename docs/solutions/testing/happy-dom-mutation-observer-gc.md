---
title: A happy-dom MutationObserver stops after a garbage collection
category: testing
trigger: "Test timed out" or a vi.waitFor timeout on a repaint that a data attribute change starts, in one run out of five to ten
---

## Problem

The R1a test "B-89 keeps the cached palette across frames and reads it again on a repaint
attribute" failed in about one run of six. The test sets `data-access-contrast` and waits for
the canvas renderer to repaint. When it failed, the renderer recorded no repaint at all. The
`MutationObserver` in `src/game/canvas-renderer.js` did not call `repaint`.

## What did not work

- A longer `vi.waitFor` timeout. The repaint never arrives, so the test only fails later.
- A strong reference to the observer (a `WeakMap` keyed by the canvas). The failure stayed.

## Root cause

happy-dom 20.11.1 stores the observer callback for each observed node behind a `WeakRef`, in
`node_modules/happy-dom/lib/mutation-observer/MutationObserverListener.js:28-29`. Nothing else
holds the arrow function that the `WeakRef` points to. A garbage collection can free that
function at any time, even while the test holds the observer. After that, the observer is
silent. A scratch script proves it: one attribute change, then `gc()`, then a second change
gives one callback instead of two.

Browsers keep a registered observer alive through the observed node, so production code
is not affected.

## Fix

A test that depends on a `MutationObserver` callback stubs the global with a class that
stores the callback. The test then calls the callback directly after the attribute change.
The test also asserts the `attributeFilter` that the code passes to `observe`. See the B-89
test in `tests/canvas-renderer.test.js`.

delete: none — the observer is the platform API that the renderer needs; the bug is in the test DOM.
