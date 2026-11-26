/* Pilot Chart: hatched land, tinted water, a neatline with grid references. */
window.ART = (function () {
  "use strict";
  const T = 40;
  // [row step, column step, x1, y1, x2, y2] for the tile edge on that side.
  const EDGES = [[-1, 0, 0, 0, T, 0], [1, 0, 0, T, T, T], [0, -1, 0, 0, 0, T], [0, 1, T, 0, T, T]];
  const TURN = { right: 0, down: 90, left: 180, up: 270 };
  const g = (x, y, inner, turn) => `<g transform="translate(${x} ${y})${turn ? ` rotate(${turn})` : ""}">${inner}</g>`;
  const span = `<rect class="pc-span" x="-20" y="-9" width="40" height="18"/>`;
  const rails = (cls) => `<path class="${cls}" d="M-20 -9H20M-20 9H20"/>`;
  const WARDEN = {
    patrol: `<circle class="pc-warden" r="10"/>`,
    hunt: `<path class="pc-warden" d="M0 -13L11 9H-11Z"/>`,
    intercept: `<path class="pc-warden-line" d="M-10 -10L0 1L10 -10M-10 1L0 12L10 1"/>`,
    lured: `<rect class="pc-warden-line" x="-9" y="-9" width="18" height="18"/>`
  };

  return {
    defaultTheme: "light",
    gutter: 28,
    gutterNarrow: 6,
    defs: `<svg class="defs" aria-hidden="true"><defs>
      <pattern id="pc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="pc-hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern>
      <pattern id="pc-stipple" width="8" height="8" patternUnits="userSpaceOnUse"><circle class="pc-dot" cx="2" cy="2" r="0.8"/><circle class="pc-dot" cx="6" cy="6" r="0.8"/></pattern>
    </defs></svg>`,
    base: (N, G, S) => `<rect class="pc-paper" width="${S}" height="${S}"/>`,
    swatchFloor: (x) => `<rect class="pc-paper" x="${x}" width="${T}" height="${T}"/>`,
    tile({ x, y, passage, state, nb }) {
      const box = `x="${x}" y="${y}" width="${T}" height="${T}"`;
      if (state === "fog") return { under: `<rect ${box} fill="url(#pc-stipple)"/>` };
      if (!passage) return { under: `<rect ${box} class="pc-land pc-land--${state}" fill="url(#pc-hatch)"/>` };
      let over = "";
      for (const [dr, dc, x1, y1, x2, y2] of EDGES) {
        if (!nb(dr, dc).passage) over += `<line class="pc-coast" x1="${x + x1}" y1="${y + y1}" x2="${x + x2}" y2="${y + y2}"/>`;
      }
      if (state === "pulse") over += `<rect class="pc-pulse" x="${x + 4}" y="${y + 4}" width="${T - 8}" height="${T - 8}"/>`;
      return { under: `<rect ${box} class="pc-water pc-water--${state}"/>`, over };
    },
    piece(kind, x, y, o) {
      switch (kind) {
        case "explorer": return g(x, y, `<circle class="pc-halo" r="16"/><circle class="pc-explorer-ring" r="13"/><circle class="pc-explorer" r="6.5"/>`);
        case "echo": return g(x, y, `<circle class="pc-echo" r="11"/><text class="pc-num" y="4.5">${o.n}</text>`);
        case "gate": return g(x, y, `<rect class="pc-gate pc-gate--${o.open ? "open" : "sealed"}" x="-10" y="-10" width="20" height="20" transform="rotate(45)"/>${o.open ? "" : `<path class="pc-gate-bar" d="M-7 0H7"/>`}`);
        case "warden": return g(x, y, WARDEN[o.mode]);
        case "danger": return g(x, y, `<path class="pc-danger" d="M-13 0H10M4 -6L11 0L4 6"/>`, TURN[o.direction]);
        case "bell": return g(x, y, `<path class="pc-bell${o.spent ? " pc-bell--spent" : ""}" d="M-9 6H9L6 2V-4A6 6 0 0 0 -6 -4V2ZM-2 9.5a2 2 0 0 0 4 0Z"/>`);
        case "windway": return g(x, y, `<path class="pc-wind" d="M-13 0H11M5 -6L12 0L5 6M-13 -7H-3M-13 7H-3"/>`, TURN[o.direction]);
        case "bridge": return g(x, y, o.open ? span + rails("pc-coast") : rails("pc-sealed"), o.horizontal ? 0 : 90) +
          (o.open ? "" : g(x, y, `<circle class="pc-echo" r="7.5"/><text class="pc-num pc-num--small" y="3.5">${o.n}</text>`));
        case "tide": return g(x, y, span + rails("pc-coast") + (o.open ? `<path class="pc-tide" d="M-12 0q3 -5 6 0t6 0t6 0t6 0"/>` : `<path class="pc-tide-bar" d="M0 -13V13"/>`), o.horizontal ? 0 : 90);
        default: return "";
      }
    },
    frame(N, G, S, narrow) {
      const a = G - 4;
      let out = `<rect class="pc-neat" x="${a}" y="${a}" width="${S - 2 * a}" height="${S - 2 * a}"/>`;
      if (narrow) return out;
      out += `<rect class="pc-neat pc-neat--outer" x="1" y="1" width="${S - 2}" height="${S - 2}"/>`;
      for (let i = 0; i <= N; i += 1) {
        const q = G + i * T;
        out += `<path class="pc-tick" d="M${q} ${a}v-5M${a} ${q}h-5"/>`;
        if (i < N) out += `<text class="pc-ref" x="${q + T / 2}" y="${G - 11}">${String.fromCharCode(65 + i)}</text><text class="pc-ref" x="${G - 15}" y="${q + T / 2 + 3.5}">${i + 1}</text>`;
      }
      return out;
    }
  };
})();
