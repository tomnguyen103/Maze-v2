---
title: The browser bar ignores a stored Theme Choice
category: frontend
trigger: The page renders dark, but the mobile browser bar stays light (or the reverse).
---

## Problem

The page has two `theme-color` metas, one for each `prefers-color-scheme` media query (`index.html:16-17`). A Theme Choice of `light` or `dark` changes the page colours, but the browser picks the meta from the operating system scheme. An Explorer who chooses dark on a light system gets a dark page under a light browser bar.

## What did not work

- One meta without a `media` attribute. The `system` choice then cannot follow the operating system with no script.
- A change of the `media` attribute. Browsers re-evaluate the attribute inconsistently, and the `system` choice must restore both original queries.

## Root cause

The `media` attribute on each meta follows the operating system scheme, not the Theme Choice. No code wrote the meta `content` when the choice changed.

## Fix

Keep both metas and their `media` attributes. Write the `content` of each meta from the choice:

- `light` or `dark`: both metas take the colour of that choice.
- `system`: each meta takes back the colour of its own media query.

`THEME_COLORS` holds the two colours (`src/player/theme.js:19`). `applyThemeChoice` paints the metas (`src/player/theme.js:105-118`). The boot script paints them before the first frame from the stored choice (`public/theme-boot.js:22-24`), so no light flash shows. The boot script cannot import the module under `script-src 'self'` with no bundler step, so it repeats the two colours. Its comment names `THEME_COLORS` as the source.

The e2e test "paints the browser bar with the stored Theme Choice and gives it back for System" in `tests/e2e/game.spec.js` covers the boot path and the full cycle.
