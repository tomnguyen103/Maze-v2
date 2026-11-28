# 0052: Pilot Chart board contract

- Status: Accepted. Superseded by ADR 0066 when slice R9 sets the default look.
- Date: 2026-11-25

## Context

ADR 0051 set the Pilot Chart identity. The board still draws ivory passages on dark
walls. The wall edge reaches 3:1 only through a tint, and the Fog hides the reading
order of the board. The premium UI rebuild plan (docs/plans/premium-ui-rebuild.md)
moves the board to a printed chart.

## Decision

1. Passages are water passages on hatched land. The board paints one water shape.
2. The Coastline carries the 3:1 contrast. The hatch is texture and carries none.
3. The v2 boards skip a Stitch comp (plan D3). The canvas artboards in the plan are
   the comps.
4. The shell has no Menu disclosure. A header tab strip names the routes.
5. The board draws no trail. The Run holds no trail field, so the renderer has
   nothing to draw.
6. `design.md` section "Chart devices" defines the Neatline, the Grid reference, the
   Title block, the Scale bar, the Ruled ledger, the Stamps, and the compass rose.

## Consequences

- `tokens.css` holds one row per board mark. The two Night blocks stay identical.
- `tests/canvas-renderer.test.js` pins the 3:1 pairs in light and Night.
- Night `--color-paper` stays `oklch(21% 0.012 250)`: the I2 bar-colour copies pin it.
  Night land and Fog use `oklch(21% 0.03 250)`. Ticket 09 closes the gap.
- Maze geometry, rulesets, and `echo-bridges-v1` stay unchanged.
