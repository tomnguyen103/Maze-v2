---
title: Night paper chroma moved from ticket 01 to ticket 09
category: intent
trigger: "debrief drift on --color-paper in Night"
---

# Night paper chroma moved from ticket 01 to ticket 09

## Problem

The batch A debrief reported drift. Scenario US-01.1 asks for a blue-tinted Night
paper. Batch A merged with the old Night `--color-paper` value.

## Root cause

- Ticket 01 owned the palette token in `tokens.css`. The Night paper also feeds the
  browser bar colour in three copies: the `theme-color` meta in `index.html`,
  `public/theme-boot.js`, and `THEME_COLORS` in `src/player/theme.js`.
- Ticket 01 could not write the three copies, so it left the token alone.
- ADR 0052 lets a token change move to the ticket that owns every copy.

## Fix

Ticket 09 (batch B) sets Night `--color-paper` to `oklch(21% 0.03 250)` and changes
the token and the three copies in one commit. `tests/theme.test.js` pins that the copies agree.

## Lesson

A token that has copies outside the CSS belongs to the ticket that can write
every copy. Put that ticket in the scenario's Oracle line at `/to-tickets`.
