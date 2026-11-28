# 0066: Popup board contract

- Status: Accepted
- Date: 2026-11-27

## Context

ADR 0065 sets the Popup identity. ADR 0052 set the Pilot Chart board contract. Each contract row of ADR 0052 carries over to Popup. Only the form of each mark changes. The Popup forms live in `src/looks/popup/tokens.css`, `src/looks/popup/board-art.js`, and `src/game/canvas-renderer.js`.

## Decision

Supersedes ADR 0052. Each row below keeps the ADR 0052 rule and names the Popup form.

1. Passages are meadow tiles on Land that is a darker hedge. The board paints all Passages as one meadow fill (`--color-passage`) and draws no outline per tile.
2. The Coastline is the ink edge where a Passage meets Land (`--color-coastline`). It carries the 3:1 contrast. The Land texture carries none.
3. Fog is a flat sky fill with a dot stipple (`--color-fog`, `--color-fog-dot`). The Fog layer clips to the known tiles and draws the chart layer inside them. Only the Fog layer reaches the visible canvas.
4. Stitch proposes, and `design.md` decides. Each Popup slice records a stitch-pipeline receipt, and the local preview of the board marks is the reference for the board.
5. The shell has no Menu disclosure. A header tab strip names the routes.
6. The board draws no trail. The Run holds no trail field, so the renderer has nothing to draw.
7. `design.md` section "Chart devices" keeps each device name as the name of what the part does: the Neatline, the Grid reference, the Title block, the Scale bar, the Ruled ledger, the Stamps, and the Compass rose. Section "Popup look" holds the Popup forms.
8. The renderer reads each board token from the look. An empty token throws `MissingBoardTokenError`. The renderer has no silent fallback palette. This row records the re-scope of the reserved ADR 0057: the R1 token read amends this ADR, not ADR 0052.

## Consequences

- `tokens.css` holds one row per board mark. The Popup board keeps its light role primitives in Night.
- `tests/canvas-renderer.test.js` pins the empty token error and the Pilot 3:1 pairs. No test pins a Popup board 3:1 pair yet.
- Maze geometry, rulesets, and `echo-bridges-v1` stay unchanged.
- Slice R9 removes the Pilot Chart board tokens.
