---
title: The art spike changed the DPR 1 tile fallback and moved the art chunk row to R2
category: intent
trigger: "debrief drift on the R0b fallback and the R0c budget row"
---

# The art spike changed the DPR 1 tile fallback and moved the art chunk row to R2

## Problem

The debrief of PR #308 (merge 685e278) found drift in two places:

- The R0b row of `docs/plans/2026-11-27-popup-ui-implementation.md` gives a 32 px tile and a scroll frame at 375 px as the fallback. The spike note (`docs/research/2026-11-27-popup-art-spike.md`, decision 3) uses max(24, ceil(48 / devicePixelRatio)) instead. At DPR 1 this gives a 48 px tile.
- Section 6 of the plan adds the art chunk row to `scripts/check-bundle-budget.mjs` in R0c. The spike note moves the row to R2.

## Root cause

- The R0b row says "named from a 24 px crop" and does not say what "named" means. The spike reads it as "the badge glyph reads". A cue that is only a colour fails WCAG 1.4.1. Under that rule, 32 px at DPR 1 fails too, so the 32 px fallback breaks the rule it is a fallback for.
- The budget script measures a built chunk. R0c builds no chunk, so a row added in R0c would have no file to measure.

## Fix

- Commit ec22c73 puts the 48 px rule in the risk line of section 13 of the plan. R4 takes the rule when it sizes the tile. The owner can still choose 32 px with a colour cue plus the Trail Compass text instead.
- R2 adds the art chunk row when it makes the chunk. It starts from the 4 KB estimate of the spike.

## Lesson

When a fallback in a plan breaks the pass rule of its own row, the spike records the conflict as a decision, and the plan changes in the same run. A budget row lands in the slice that makes its chunk.
