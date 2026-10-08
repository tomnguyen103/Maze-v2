---
title: The theme button must not read its state back from storage
category: frontend
trigger: "theme button stuck on light when localStorage writes throw"
---

# The theme button must not read its state back from storage

## Problem

With storage writes blocked, every theme button click applied light. The cycle
never reached dark or system, and the label no longer matched the page.

## What did not work

Taking the current choice from `readThemeChoice()` on each click.
`applyThemeChoice` swallows the write error, so the next read falls back to
`system` every time.

## Root cause

Storage was the only record of the current choice. Storage can refuse writes in
private mode or on a full quota.

## Fix

Hold the choice in memory and seed it from storage once: `src/main.js:1130-1145`.
`tests/e2e/game.spec.js:6797` blocks the theme key and cycles all three choices.
