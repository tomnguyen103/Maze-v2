---
title: An author display rule overrides the hidden attribute
category: frontend
trigger: An element has the hidden attribute in the DOM, but it still shows on the page as an empty box.
---

## Problem

The First Light and Daily result cards set `#result-atlas` to `hidden`, because those runs have no Atlas line.
The empty Atlas box still showed on the card as a bordered strip with no text.

## What did not work

The e2e tests read the `hidden` property, and the property was true. A property check passes with the bug, because the bug is in the cascade, not in the DOM.

## Root cause

The user-agent rule for `[hidden]` is `display: none`. An author rule beats every user-agent rule.
`.result-atlas` sets `display: grid` (`src/game/game-dialogs.css:795`). So the author rule wins and the box renders.

## Fix

A rule with higher specificity restores the hidden state (`src/game/game-dialogs.css:805-807`): `.result-atlas[hidden] { display: none; }`.
The repro test in `tests/e2e/entry.spec.js` asserts `toBeHidden()` on `#result-atlas` after a First Light completion. Playwright checks the computed visibility, so the test fails with the bug.

## Check

When a rule sets `display` on an element that the code hides with the `hidden` attribute, add a `[hidden]` rule beside it. The codebase uses this pattern already, for example `.explorer-figure-picker[hidden]` in `src/looks/popup/surface.css`.
Test the visibility in a browser (`toBeHidden()`), not the `hidden` property.

delete: none — the grid layout holds the Atlas line, so it stays.
