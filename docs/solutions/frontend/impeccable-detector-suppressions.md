---
title: Why the impeccable detector config suppresses two rules
category: frontend
trigger: "detector reports codex-grid-background or flat-type-hierarchy"
---

# Why the impeccable detector config suppresses two rules

## Problem

The detector flagged the grid-paper ground in `src/daylight.css` and the type
hierarchy in `index.html`.

## Root cause

- The 24px grid paper is the Journey ground that `design.md` requires. The
  `codex-grid-background` rule cannot tell a designed grid from a default one.
- `index.html` holds both the landing and the game templates. The detector reads
  them as one flat page, so it cannot see the hierarchy of each surface.

## Fix

`.impeccable/config.json` suppresses only these two rules, each for one file.
Remove a suppression when its file stops matching the reason above.
