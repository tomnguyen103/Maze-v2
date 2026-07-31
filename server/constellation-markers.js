/**
 * Derives Daily Trail Constellation markers from a Run as it replays.
 *
 * The Labyrinth is a wall grid: a position with both coordinates odd is a
 * cell, anything else is the passage between two cells. That is the whole
 * derivation — no ordering, no timing, and no answer is kept, so the marker
 * set the aggregate receives cannot be walked back into a path.
 *
 * @typedef {{ kind: "cell" | "passage" | "pulse", x: number, y: number }} TrailMarker
 */

// Mirrors the `grid_x`/`grid_y BETWEEN 0 AND 63` CHECK constraints in
// migration 0023. Dropping an out-of-range position here means a caller
// bug never becomes a failed aggregation on a Run that was otherwise
// verified; the constraint remains the authority.
const MAX_GRID_COORDINATE = 63;

export function collectTrailMarkers() {
  /** @type {Map<string, TrailMarker>} */
  const markers = new Map();

  return {
    /**
     * @param {{ explorer?: { row: number, col: number } }} run
     * @param {{ type: string } | null} [action]
     */
    observe(run, action = null) {
      const explorer = run?.explorer;
      if (!explorer) {
        return;
      }
      const { row, col } = explorer;
      if (!inBounds(row) || !inBounds(col)) {
        return;
      }
      add(row % 2 === 1 && col % 2 === 1 ? "cell" : "passage", col, row);
      if (action?.type === "pulse") {
        add("pulse", col, row);
      }
    },
    /** @returns {TrailMarker[]} */
    collected: () => [...markers.values()]
  };

  /** @param {TrailMarker["kind"]} kind @param {number} x @param {number} y */
  function add(kind, x, y) {
    const key = `${kind}:${x}:${y}`;
    if (!markers.has(key)) {
      markers.set(key, { kind, x, y });
    }
  }
}

/** @param {number} value */
function inBounds(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_GRID_COORDINATE;
}
