---
title: The R9 look flip also carried a Popup contrast and layout tune
category: intent
trigger: "debrief drift on R9: visual changes in a deletion slice"
---

# The R9 look flip also carried a Popup contrast and layout tune

## Problem

The R9 row in `docs/plans/2026-11-27-popup-ui-implementation.md` asks for a flip and a delete only. The R9 merge (#324) also changed how Popup looks:

- contrast token values in `src/looks/popup/tokens.css` (coral-deep, the pulse colours, the fog dot, the access passage, two Region hues);
- an ink outline under the Warden danger ring, and the band fill `palette.casing`, in `src/game/canvas-renderer.js`;
- a list-view rule in `src/looks/popup/atlas.css` and a phone `.labyrinth-panel` rule in `src/looks/popup/surface.css`;
- the glowing-band opacity in `src/game/daily-constellation.css`.

## Root cause

- Before R9, the accessibility and contrast tests ran against the Pilot look in the default build.
- The flip pointed those tests at Popup. Some Popup pairs then failed the AA floor, and two e2e layout checks failed.
- The slice fixed each failure in place, because the gate must pass before the push.
- The commit message named the token and canvas changes. It did not name the atlas, panel and opacity changes.

## Fix

The changes stay. The gate (`npm run check`), the e2e suite and the capture receipt at 375, 1280 and 1920 px passed on the merged head. The R0a captures that the owner approved show the earlier token values.

## Lesson

- A flip slice moves every test that ran on the old default onto the new look. Run those tests against the new look in the slice before the flip, so the flip slice deletes only.
- Name each visual change in the commit message, also when a failed test forces it.
