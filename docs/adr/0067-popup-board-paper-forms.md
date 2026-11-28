# 0067: Popup board paper forms

- Status: Accepted
- Date: 2026-11-28

## Context

ADR 0066 gave the board flat forms: a meadow Passage, a hatched Land, an edge walk Coastline, and a Fog with a dot stipple. The owner-approved mock (`docs/design/mockups/2026-11-26-directions/13-popup/scenes.html`) shows paper cards instead. The shipped board does not match the mock.

## Decision

Supersedes rows 1 to 3 of ADR 0066. Rows 4 to 8 of ADR 0066 stay in force.

1. A Passage is a cream paper square (`--color-passage`). The board paints all Passages as one fill and draws no outline per tile.
2. Land is a meadow card with a deep lip (`--color-land`, `--color-land-lip`). Each card has an ink outline. The outline is the Coastline (`--color-coastline`). It carries the 3:1 contrast against a Passage and the Fog. The lip carries no contrast duty.
3. Fog is a sky card on each unknown tile, with a Fog edge stroke (`--color-fog-edge`) and a folded corner (`--color-fog-soft`). The Fog layer clips to the known tiles and draws the chart layer inside them.
4. A tile in Pulse sight shows the chart plus a peeled flap on its top edge. The flap uses `--color-fog-soft` and `--color-fog-edge`. The board reads no `--color-pulse`.
5. The Echo is a coral-deep disc with an ink outline, a dashed paper ring, and a paper digit. It has no halo.
6. Explorer and Warden art draw at 1.2 tile times the mark scale.
7. The renderer reads `--color-fog-edge`, `--color-fog-soft`, and `--color-land-lip` as board tokens. An empty token throws `MissingBoardTokenError`.
8. The hatch, the edge walk, the Fog dot pattern, and the Pulse wash are removed. The tokens `--color-hatch` and `--color-fog-dot` are renamed to `--color-land-lip` and `--color-fog-edge`.

## Consequences

- `tokens.css` and `daylight.css` name each new token in each board mode.
- `tests/canvas-renderer.test.js` pins the card forms, the batched paths, the snap to the device pixel grid, and the token error.
- `tests/popup-contrast.test.js` pins the contrast pairs of the spec.
- The game row gains at most 0.25 KB gzip. Over that cap, the peeled flap becomes a plain triangle.
- Maze geometry, rulesets, and `echo-bridges-v1` stay unchanged.
- In strong contrast and in each palette mode, `--color-land` is paper, the same fill as a Passage. In those modes the Land card reads by its doubled ink outline and its lip, not by its fill.
- The canvas frame is a paper card with a 3 px board-ink edge in each Region. The frame no longer takes a Region Hue tint. The Region Hue stays on the page chrome only.
- The Access preview draws Pulse sight as the same peeled flap. The tokens `--color-pulse` and its palette values are removed.

## Counter-argument

- At the 24 px tile floor, an ink outline on each Land tile makes a wall read as a row of squares, not one wall.
- The Land and Fog fills have near-equal value: their contrast is 1.02:1. The Passage and Land pair is 2.07:1. Only the ink outline separates them, so a reader in grayscale or with deuteranopia depends on one 1 px to 2 px line.
- Per-tile outlines add ink between two adjacent Land tiles, where the ADR 0066 board drew none.
- This is the second reversal of the board forms in two days. ADR 0066 had no frame-time budget, so neither ADR could prove a cost.

## Evidence

- Frame time: a scripted run of 240 keydown repaints on a size 15 board, desktop Chromium, 1280 px viewport. The p95 is 0.90 ms at DPR 1 and 1.10 ms at DPR 2. The ADR 0066 board on main gives 0.90 ms and 1.00 ms. The difference is within run noise.
- Legibility: captures of a large board at 24 px tiles, at DPR 1 and DPR 2, in grayscale and with a deuteranopia filter. A reader can trace a corridor on both boards. The ADR 0066 board tells Land from Fog by texture (hatch against dots). This board tells them apart by form: the lip and ink outline on Land, the fold and light edge on Fog.
- The legend and the Access preview band draw the same forms, so a reader learns one set of marks.

## Mitigations

- The Coastline outline carries the 3:1 pair against a Passage and the Fog in each board mode. `tests/popup-contrast.test.js` pins it.
- The strong mode and forced colours keep their own Coastline tokens.
- The paths snap to the device pixel grid, so a 1 px outline stays sharp at DPR 1.

## Rejected

- Merged-edge outlines (one stroke around each Land region): a clean wall at small tiles, but it needs a region walk per repaint and brings back the edge-walk code that this ADR removes. Revisit if the Wrong if line below holds.

## Wrong if

A capture of a large board at 24 px and DPR 1, in grayscale or with a deuteranopia filter, does not let a reader trace a corridor and tell Land from Fog faster or more accurately than the ADR 0066 board does. Also wrong if the frame time on a large maze regresses on a mid-range phone; the evidence above is from desktop Chromium only.
