# Play-screen mockup scorecard

Date: 2026-11-26

## Result

The adopted direction is **pilot-chart**, the finished form of the Pilot Chart of `design.md`.

Pilot-chart and sounding tie at 69 points. The tie rule selects the lower build cost. Pilot-chart has 14 build-cost points and sounding has 13.

The owner selects a different direction with one reply: `Adopt sounding` or `Adopt cut-paper`.

## Directions

| Direction | Idea | Folder |
| --- | --- | --- |
| pilot-chart | A printed pilot chart: ink on paper, hatched land, stippled Fog, one Signal magenta | `pilot-chart/` |
| sounding | A depth-sounding instrument: range rings, depth bands, a numeral column | `sounding/` |
| cut-paper | A paper tray on a cutting mat: raised blocks and tokens with a visible side | `cut-paper/` |

Each direction draws one real Labyrinth: `createRun("PILOT-CHART")`, revision `warden-bells-v1`, size 13. The file `board-data.js` holds the Run. Each direction has a Light theme and a Night theme.

Each folder holds `index.html`, `art.js`, `style.css`, and `captures/` at 375, 1280, and 1920 px for the two themes. The command `node docs/design/mockups/2026-11-26/capture.mjs` makes the captures again.

The impeccable detector exits 0 on the folder `docs/design/mockups/2026-11-26`. The file `.impeccable/config.json` holds one suppression for this folder: rule `overused-font`, value Geist Mono, file `shared/base.css`. Geist Mono is the numeral face of `design.md`.

## Scores

Three critics with fresh context score each direction from 1 to 5 on six criteria. A higher build-cost score means a lower cost.

| Criterion | pilot-chart (A, B, C) | sounding (A, B, C) | cut-paper (A, B, C) |
| --- | --- | --- | --- |
| 1 Board legibility at 375 px | 3, 4, 4 | 4, 3, 3 | 3, 3, 3 |
| 2 Distinct identity | 4, 4, 4 | 4, 4, 4 | 4, 2, 3 |
| 3 Contrast and nonvisual parity | 3, 4, 4 | 4, 3, 3 | 2, 2, 2 |
| 4 Motion and feedback potential | 3, 3, 3 | 5, 5, 5 | 4, 4, 4 |
| 5 Fit with research Q1 | 4, 4, 4 | 3, 3, 3 | 3, 3, 3 |
| 6 Build cost | 5, 4, 5 | 4, 5, 4 | 2, 3, 2 |
| Total by critic | 22, 23, 24 | 24, 23, 22 | 18, 17, 17 |
| **Total** | **69** | **69** | **52** |

The critics score the captures before the defect fixes of the next section.

## Defects and fixes

| Defect | Direction | Severity | Status |
| --- | --- | --- | --- |
| No direction draws the next Move of a Warden | all | high | Fixed: a dashed arrow mark and a legend row |
| The depth tone uses distance through Fog and can show a hidden route | sounding (shared model) | high | Fixed: the distance uses known tiles only |
| The Lured Warden and the Explorer share one shape | pilot-chart, cut-paper | high | Fixed: a square outline (pilot-chart), an open cup (cut-paper) |
| Light theme: Echo 1.54:1, Signal Bell 2.65:1, remembered wall 1.17:1 against Fog | cut-paper | high | Fixed in part: darker tokens and walls. No new measurement |
| The Fog dot is 2.21:1 in Light and 2.85:1 in Night | pilot-chart | medium | Fixed: opacity 0.5 |
| A wall has no edge against Fog; Light range rings are below 2:1 | sounding | medium | Fixed: a wall edge line and a full-strength ring |
| The depth bands change colour on each Move, against research Q1 property 4 | sounding | medium | Open: a cost of the direction |
| `drop-shadow`, rounded walls, and double-drawn tokens raise Canvas cost | cut-paper | medium | Open: a cost of the direction |
| A passage in sight differs from a remembered passage by tint only | all | low | Open: the plan carries it to the `design.md` amendment |
| The Echo digit is about 9 px at 375 px | all | low | Open: the plan carries it to the `design.md` amendment |
| The narrow frame drops the Grid references and the ticks | pilot-chart | low | Open: the plan carries it to the `design.md` amendment |

## What the adoption carries

- Pilot-chart scores 3 for motion. The plan takes the range ring of sounding as the Pulse feedback.
- The Warden telegraph mark becomes a board mark of `design.md`.
