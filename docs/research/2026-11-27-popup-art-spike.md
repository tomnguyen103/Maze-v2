# Popup art spike: tile size and art form (R0b, R0c)
Date: 2026-11-27

## Scope

This spike answers two questions of the Popup UI plan (`docs/plans/2026-11-27-popup-ui-implementation.md`):

- R0b: Do Clover and each Warden Mode of Fangmoor read on a 24 px tile, at DPR 1, 2, and 3?
- R0c: Which art form is smaller: canvas paths or a WebP sprite sheet? The answer sets the art chunk budget row (D11).

The spike is not shipped code. Nothing in `src/` changes.

## Method

- `popup-art-spike/art.js` ports the approved mockup art (`13-popup/explorer.html`, `13-popup/wardens.html`) to canvas paths. It draws Clover, Pip, Lumi, Fen, Tuck, and Fangmoor in the Modes patrol, hunt, intercept, lured, and down.
- `popup-art-spike/index.html` draws each figure on the Popup Passage colour (`--color-passage`) at 24 px and 32 px, at DPR 1, 2, and 3. Each canvas has a backing store of size × DPR.
- `popup-art-spike/capture.mjs` captures each column with Playwright at its own device scale factor. The crops are in `popup-art-spike/crops/`.
- Pass rule: a Mode passes when its badge glyph reads in the crop, not only its badge colour. A colour-only cue fails WCAG 1.4.1. In the crops, the glyph reads from 48 device px a tile and up.
- A pixel count compares pairs of Modes on the same tile, as supporting data. A pixel counts as different when the RGB sum of differences is above 60. The count alone sets no verdict.
- `popup-art-spike/measure.mjs` minifies `art.js` with rolldown (a dependency of Vite, not a direct dependency) and gzips it at level 9. The page encodes a sprite sheet of all figures at 32 px × DPR 3 as WebP (quality 0.9) and PNG, and prints both sizes.

To run the page: `npx vite docs/research/popup-art-spike --port 5199`.

## Results: R0b tile legibility

Pixels that differ between two Modes of Fangmoor:

| Tile | Device px | Patrol / Intercept | Patrol / Hunt | Patrol / Lured | Intercept / Lured |
| --- | --- | --- | --- | --- | --- |
| 24 px, DPR 1 | 576 | 18 | 52 | 29 | 32 |
| 24 px, DPR 2 | 2304 | 55 | 152 | 93 | 100 |
| 24 px, DPR 3 | 5184 | 116 | 335 | 208 | 210 |
| 32 px, DPR 1 | 1024 | 36 | 88 | 51 | 53 |
| 32 px, DPR 2 | 4096 | 94 | 272 | 163 | 164 |
| 32 px, DPR 3 | 9216 | 207 | 563 | 381 | 379 |

Verdict for each figure (device px a tile in brackets):

| Figure | 24 px DPR 1 (24) | 32 px DPR 1 (32) | 24 px DPR 2 (48) | 24 px DPR 3 (72) |
| --- | --- | --- | --- | --- |
| Clover | Pass: the ear shape | Pass | Pass | Pass |
| Fangmoor, hunt | Colour only: red eyes and badge | Colour only | Pass: the "!" glyph reads | Pass |
| Fangmoor, lured | Colour only: blue eyes and badge | Colour only | Pass: the note glyph reads | Pass |
| Fangmoor, down | Pass: the low pose | Pass | Pass | Pass |
| Fangmoor, patrol | Fail: the badge glyph is 2 to 3 device px | Fail: the glyph is about 5 device px | Pass: the two footprint marks read | Pass |
| Fangmoor, intercept | Fail: same reason | Fail: same reason | Pass: the arrow glyph reads | Pass |

The Mode badge carries the Mode. Below 48 device px a tile, the badge has no room for a glyph, and patrol and intercept differ by badge colour only. Clover is the only Explorer that the plan tests. The other Explorers are drawn but not compared with each other.

Crops: `crops/column-<size>px-dpr<n>.png` for each column, and `crops/<figure>-<mode>-24px-dpr<n>.png` for Clover and each Mode at 24 px.

## Results: R0c art form

| Form | Bytes |
| --- | --- |
| Canvas paths, `art.js` raw | 9,807 |
| Canvas paths, minified | 6,566 |
| Canvas paths, minified and gzip | 2,960 |
| WebP sprite sheet, 32 px × DPR 3, quality 0.9 | 22,526 |
| PNG sprite sheet, same sheet | 44,666 |

Canvas paths are 7.6 times smaller than the WebP sheet. The paths draw at each DPR from one source; a sprite sheet needs one sheet for each DPR or a downscale. The spike did not measure downscale sharpness.

## Decisions

1. D11 holds: the art chunk uses canvas paths. The WebP sprite sheet is not used.
2. The art chunk budget row starts at 4 KB gzip. The spike measures 2.96 KB. The 1 KB margin is an estimate for the parts the spike did not port: the paper-cut outline, the Fangmoor trail and streak effects, the "z" glyph on the down badge, and the poses other than idle. R2 measures the real chunk and sets the final row.
3. A board tile has at least 48 device px: tile CSS px = max(24, ceil(48 / devicePixelRatio)). At DPR 2 or more this gives 24 px. At DPR 1 it gives 48 px. A fractional DPR, such as 1.5, gives 32 px. The plan fallback names 32 px at DPR 1; the spike shows that 32 px at DPR 1 fails the glyph rule, so the fallback becomes 48 px. Where the frame is too narrow for the board, the frame scrolls (B-10).
4. The Mode stays in text too. The Trail Compass names the Warden Mode (R5), so no Mode depends on the badge alone.

## Not ported

- The paper-cut outline filter (white edge and drop shadow).
- The Fangmoor streak, trail, and sparkle effects.
- The "z" glyph on the down badge.
- The SVG eye glow. The spike uses `shadowBlur`.
- Explorer poses other than idle.

These parts add bytes and change edge contrast. The spike did not measure their effect on the verdicts. The failing pair fails on badge glyph size, which these parts do not change. R2 captures the full art at each tile size again.

## Follow-up for later slices

- R2 adds the art chunk row (4 KB) to `scripts/check-bundle-budget.mjs` when the chunk exists. The row has no file to measure before R2.
- R4 picks the tile size from `devicePixelRatio` with the rule in decision 3, and updates the plan risk line that names 32 px.
