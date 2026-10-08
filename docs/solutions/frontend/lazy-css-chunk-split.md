---
title: Split CSS out of the shared sheet without losing it
category: frontend
trigger: "check:bundle over 13 KB, SyntaxError on a .css import in Playwright, or an unstyled error state after a chunk fails"
---

# Split CSS out of the shared sheet without losing it

## Problem

The Journey restyle pushed the shared CSS past the 13 KB gzip budget. Game-only
rules had to leave `src/daylight.css` and load later.

## What did not work

- An `import "./first-light.css"` inside `src/game/first-light.js` broke the e2e
  run. Playwright specs import some `src/game/*.js` modules in Node, and Node
  cannot parse a CSS import.
- An import inside `src/game/daily-constellation-view.js` put the rules in their
  own chunk. When that view chunk fails to load, the error status and the retry
  button render with no styles.

## Root cause

Vite gives each dynamic-import boundary its own CSS chunk. The CSS loads only
when that chunk loads, so a failed chunk takes its rules with it. A module that
Node also imports must stay free of CSS imports.

## Fix

Import the split sheets from the lazy game entry, `src/main.js:1-2`. The rules
then load with the game chunk, after `src/daylight.css`, so they win at equal
specificity. The view module itself has no CSS import.

The split must not hide weight from the gate. The "game styles" budget in
`scripts/check-bundle-budget.mjs` measures `main-*.css`.

## Verification

`tests/e2e/game.spec.js:6674` aborts any `daily-constellation-*.css` request.
The test fails on the old import and passes with the fix.
