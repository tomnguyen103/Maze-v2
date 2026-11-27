---
title: A layer cache key survives a pass that throws
category: frontend
trigger: A renderer caches an offscreen canvas layer behind a key and skips the repaint when the key matches.
---

# A layer cache key survives a pass that throws

## Problem

The R1b canvas renderer keeps a chart layer and a Fog layer. Each layer has a
key, and a frame with the same key reuses the layer. CodeRabbit found this case
on PR 317:

1. Frame A paints both layers and stores key A.
2. The Fog pass of frame B throws. The size write in `onLayer` has already
   cleared the Fog layer, so the layer is half painted.
3. A Replay step goes back to frame A. The key still says A, so the renderer
   blits the half-painted layer and does not repaint it.

## What did not work

The chart key was already stored last, after both passes. That order protects
a new key from a failed pass, but the old key still describes a layer that the
failed pass cleared.

## Root cause

A size write on a canvas resets its bitmap even when the size does not change.
The layer content changes before the pass can fail, but the key changes only
after the pass succeeds.

## Fix

Clear each key before its pass writes the layer (`chartKey = []`,
`fogKey = ""`), and store the new key after the pass succeeds. A frame after a
failed pass then finds no matching key and repaints the layer
(`paint` in `src/game/canvas-renderer.js`).

The two "PR 317" tests in `tests/canvas-renderer.test.js` make one pass throw,
go back to the last good frame, and check that the layer repaints.
