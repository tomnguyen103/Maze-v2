---
title: Coastline contrast and the integer device-pixel pattern tile
category: frontend
trigger: "board hatch shimmers or the coastline fades against land or water"
---

# Coastline contrast and the integer device-pixel pattern tile

## Problem

The Labyrinth board has three grounds: Passage water, Land, and Fog. The coastline
faded against the Land in Night and in strong contrast mode. The hatch and the Fog
stipple also shimmered on some screens.

## What did not work

- A coastline in a muted ink. It fell below 3:1 against the Passage or the Land.
- A hatch pitch scaled by the device ratio. A ratio such as 1.25 put lines on half
  pixels, so the lines blurred and moved between paints.
- A tile with a translucent dot on a GPU canvas. A GPU tile and a CPU tile round
  translucent dots in a different way, so the Fog differed after a reload.

## Root cause

A contrast rule applied to the hatch, but the hatch is texture. Only the coastline marks
the land edge. A pattern tile that does not use whole device pixels samples between
pixels, so its lines change with the screen.

## Fix

- The coastline is one ink line. It reaches 3:1 against the Passage and against the Land,
  in light, Night, and strong mode. The hatch carries no contrast duty.
- The hatch tile is 6 backing-store pixels square. It has one 1px line at 45 degrees and
  no device ratio factor, so the pitch is about 4 device pixels at every ratio.
- The Fog tile is 8 by 8 pixels. Each dot is `unit` pixels square, where `unit` is the
  device ratio rounded to a whole number and at least 1.
- Each tile draws on a software canvas (`willReadFrequently: true`), so the dots round
  the same way on every screen.
- The pattern cache key holds the colours and `unit`, so a change of theme or ratio
  builds a new tile.

## Prevention

- Check a new board colour against the Passage and the Land at 3:1 in light, Night, and
  strong mode. The `tests/canvas-renderer.test.js` matrix covers each pair.
- Size every pattern tile in whole device pixels.
- The rule lives in `design.md` under Contrast and Labyrinth canvas.
