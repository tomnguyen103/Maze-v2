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
- Playwright captures each column at its own device scale factor (`.scratch` capture script, not committed). The crops are in `popup-art-spike/crops/`.
- A pixel count compares each pair of Modes on the same tile. A pixel counts as different when the RGB sum of differences is above 60.
- `popup-art-spike/measure.mjs` minifies `art.js` with rolldown and gzips it at level 9. The page encodes a sprite sheet of all figures at 32 px × DPR 3 as WebP (quality 0.9) and PNG.

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

Verdict for each figure:

| Figure | 24 px DPR 1 | 24 px DPR 2 | 24 px DPR 3 |
| --- | --- | --- | --- |
| Clover (and each Explorer) | Pass: the ear shape names Clover | Pass | Pass |
| Fangmoor, hunt | Pass: red eyes and red badge | Pass | Pass |
| Fangmoor, lured | Pass: blue eyes and blue badge | Pass | Pass |
| Fangmoor, down | Pass: the low pose | Pass | Pass |
| Fangmoor, patrol | Fail: the badge glyph is 2 to 3 device px; only its colour differs from intercept | Pass: the "?" glyph reads | Pass |
| Fangmoor, intercept | Fail: same reason | Pass: the arrow glyph reads | Pass |

The Mode badge carries the Mode. At DPR 1 the badge has no room for a glyph, so patrol and intercept differ by badge colour only. Colour alone fails WCAG 1.4.1.

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
2. The art chunk budget row is 4 KB gzip. The spike measures 2.96 KB. The difference pays for the parts the spike did not port: the paper-cut outline, the Fangmoor trail and streak effects, the "z" glyph on the down badge, and the poses other than idle.
3. The 24 px tile is allowed only at DPR 2 or more. At DPR 1 the board keeps 32 px tiles, and the 375 px frame scrolls (plan risk line, B-10). Most phones at 375 px have a DPR of 2 or 3, so they get the 24 px tile.
4. The Mode stays in text too. The Trail Compass names the Warden Mode (R5), so no Mode depends on the badge colour alone.

## Not ported

- The paper-cut outline filter (white edge and drop shadow).
- The Fangmoor streak, trail, and sparkle effects.
- The "z" glyph on the down badge.
- The SVG eye glow. The spike uses `shadowBlur`.
- Explorer poses other than idle.

These parts add bytes and detail. They do not change the verdicts: each one adds to a figure, and the failing pair at DPR 1 fails on badge size, not on missing detail.

## Follow-up for later slices

- R2 adds the art chunk row (4 KB) to `scripts/check-bundle-budget.mjs` when the chunk exists. The row has no file to measure before R2.
- R4 picks the tile size from `devicePixelRatio`: 24 px at DPR 2 or more, else 32 px.
