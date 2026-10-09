---
title: Why the impeccable detector config suppresses one rule
category: frontend
trigger: "detector reports flat-type-hierarchy"
---

# Why the impeccable detector config suppresses two rules

## Problem

The detector flagged the type hierarchy in `index.html`.

## Root cause

- `index.html` holds both the landing and the game templates. The detector reads
  them as one flat page, so it cannot see the hierarchy of each surface.

## Fix

`.impeccable/config.json` suppresses only this rule, for one file. Remove the
suppression when `index.html` stops matching the reason above.

The Field Journal ground has no grid paper, so the `codex-grid-background`
suppression no longer exists.
