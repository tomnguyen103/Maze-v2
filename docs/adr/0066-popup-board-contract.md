# 0066: Popup board contract

- Status: Accepted
- Date: 2026-11-27

## Context

ADR 0065 sets the Popup identity. ADR 0052 set the Pilot Chart board contract. Each contract row of ADR 0052 carries over to Popup. Only the form of each mark changes. The Popup forms live in `src/looks/popup/tokens.css`, `src/looks/popup/board-art.js`, and `src/game/canvas-renderer.js`.

## Decision

Supersedes ADR 0052. Each row below keeps the ADR 0052 rule and names the Popup form.

1. Passages are meadow Passage tiles with an ink outline, set on Land that is a darker hedge. The board paints one Passage fill (`--color-passage`).
2. The Coastline is the ink edge where a Passage meets Land (`--color-coastline`). It carries the 3:1 contrast. The Land texture carries none.
3. Fog is a field of sky flaps (`--color-fog`). The renderer paints the Fog layer over the chart layer and clips the known tiles out of it.
4. The Popup boards skip a Stitch comp. The local preview of the board marks is the comp (plan D3 of the Popup plan).
5. The shell has no Menu disclosure. A header tab strip names the routes.
6. The board draws no trail. The Run holds no trail field, so the renderer has nothing to draw.
7. `design.md` section "Chart devices" keeps the Neatline, the Grid reference, and the Title block as names of what each part does. Section "Popup look" holds the Popup forms.
8. The renderer reads each board token from the look. An empty token throws `MissingBoardTokenError`. The renderer has no silent fallback palette. This row records the re-scope of the reserved ADR 0057: the R1 token read amends this ADR, not ADR 0052.

## Consequences

- `tokens.css` holds one row per board mark. The Popup board keeps its light role primitives in Night.
- `tests/canvas-renderer.test.js` pins the 3:1 pairs and the empty token error.
- Maze geometry, rulesets, and `echo-bridges-v1` stay unchanged.
- Slice R9 removes the Pilot Chart board tokens.
