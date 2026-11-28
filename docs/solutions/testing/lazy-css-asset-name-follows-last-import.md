---
title: The lazy Atlas CSS asset takes the name of its last CSS import
category: testing
trigger: An e2e test that waits for a lazy CSS asset by file name times out after a chunk gets a second CSS import.
---

## Problem

R7b adds `import "@look/atlas.css";` (since R9: `import "../looks/popup/atlas.css";`) after `import "./quest-atlas.css";` in `src/game/quest-atlas-view.js`.
The e2e test "lazy Atlas keeps semantic map and list parity across a URL reload" waits for `quest-atlas-*.css`. The test timed out in both projects.

## Root cause

Vite merges the CSS imports of one chunk into one asset, and the last CSS import names that asset. The asset is now `atlas-<hash>.css` in both looks. The bytes in the Pilot build do not change, because the Pilot `atlas.css` holds a comment only.

## Fix

The test regex in `tests/e2e/game.spec.js` matches `/assets/atlas-<hash>.css`. A comment beside it names the cause.

## Check

When a test matches a built asset by name, check the asset list after each change to the CSS imports of that chunk.
