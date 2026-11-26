/* Sounding: a depth-sounding instrument. Passage tone tells the distance from the Explorer. */
window.ART = (function () {
  "use strict";
  const T = 40;
  const EDGES = [[-1, 0, 0, 0, T, 0], [1, 0, 0, T, T, T], [0, -1, 0, 0, 0, T], [0, 1, T, 0, T, T]];
  const TURN = { right: 0, down: 90, left: 180, up: 270 };
  const g = (x, y, inner, turn) => `<g transform="translate(${x} ${y})${turn ? ` rotate(${turn})` : ""}">${inner}</g>`;
  const band = (dist) => (dist <= 3 ? 1 : dist <= 7 ? 2 : 3);
  const span = `<rect class="so-d so-d2" x="-20" y="-9" width="40" height="18"/>`;
  const rails = (cls) => `<path class="${cls}" d="M-20 -9H20M-20 9H20"/>`;
  const WARDEN = {
    patrol: `<path class="so-warden" d="M0 -12L12 0L0 12L-12 0Z"/>`,
    hunt: `<path class="so-warden" d="M0 -13L12 10H-12Z"/>`,
    intercept: `<path class="so-warden-line" d="M-11 -9L0 2L11 -9M-11 1L0 12L11 1"/>`,
    lured: `<path class="so-warden-line so-warden-line--thin" d="M0 -12L12 0L0 12L-12 0Z"/><circle class="so-warden" r="3"/>`
  };

  return {
    defaultTheme: "night",
    gutter: 14,
    gutterNarrow: 4,
    defs: "",
    base: (N, G, S) => `<rect class="so-abyss" width="${S}" height="${S}"/>`,
    swatchFloor: (x) => `<rect class="so-abyss" x="${x}" width="${T}" height="${T}"/>`,
    tile({ x, y, passage, state, dist, nb }) {
      const box = `x="${x}" y="${y}" width="${T}" height="${T}"`;
      if (state === "fog") return { under: `<circle class="so-dot" cx="${x}" cy="${y}" r="1"/>` };
      if (!passage) return { under: `<rect ${box} class="so-rock so-rock--${state}"/>` };
      let over = "";
      for (const [dr, dc, x1, y1, x2, y2] of EDGES) {
        if (!nb(dr, dc).passage) over += `<line class="so-edge" x1="${x + x1}" y1="${y + y1}" x2="${x + x2}" y2="${y + y2}"/>`;
      }
      if (state === "pulse") over += `<rect class="so-pulse" x="${x + 4}" y="${y + 4}" width="${T - 8}" height="${T - 8}"/>`;
      return { under: `<rect ${box} class="so-d so-d${band(dist)} so-d--${state}"/>`, over };
    },
    // A Pulse draws range rings around the Explorer.
    overlay(m, at) {
      if (!m.run.pulseVisible || !m.run.pulseVisible.length) return "";
      const [x, y] = at(m.run.explorer);
      return [1.5, 2.5, 3.5].map((r) => `<circle class="so-ring" cx="${x}" cy="${y}" r="${r * T}"/>`).join("");
    },
    piece(kind, x, y, o) {
      switch (kind) {
        case "explorer": return g(x, y, `<circle class="so-explorer" r="7"/><circle class="so-explorer-line" r="11.5"/><path class="so-explorer-line" d="M0 -17V-11.5M0 11.5V17M-17 0H-11.5M11.5 0H17"/>`);
        case "echo": return g(x, y, `<circle class="so-echo" r="11"/><text class="so-num" y="4.5">${o.n}</text>`);
        case "gate": return g(x, y, o.open ? `<path class="so-gate-line" d="M-9 -11V11M9 -11V11"/>` : `<rect class="so-gate" x="-10" y="-10" width="20" height="20"/>`);
        case "warden": return g(x, y, WARDEN[o.mode]);
        case "danger": return g(x, y, `<path class="so-danger" d="M-13 0H10M4 -6L11 0L4 6"/>`, TURN[o.direction]);
        case "bell": return g(x, y, o.spent ? `<circle class="so-spent" cy="4" r="4"/>` : `<circle class="so-bell" cy="4" r="4"/><path class="so-bell-line" d="M-7 -3A9 9 0 0 1 7 -3M-11 -7A14 14 0 0 1 11 -7"/>`);
        case "windway": return g(x, y, `<path class="so-explorer-line" d="M-11 -7L-4 0L-11 7M-2 -7L5 0L-2 7M7 -7L14 0L7 7"/>`, TURN[o.direction]);
        case "bridge": return g(x, y, o.open ? span + rails("so-edge") : rails("so-sealed"), o.horizontal ? 0 : 90) +
          (o.open ? "" : g(x, y, `<circle class="so-echo" r="8"/><text class="so-num so-num--small" y="3.5">${o.n}</text>`));
        case "tide": return g(x, y, span + rails("so-edge") + (o.open ? `<path class="so-explorer-line" d="M-12 0q3 -5 6 0t6 0t6 0t6 0"/>` : `<path class="so-tide-bar" d="M0 -13V13"/>`), o.horizontal ? 0 : 90);
        default: return "";
      }
    },
    frame(N, G, S, narrow) {
      const a = G - 2;
      let out = `<rect class="so-frame" x="${a}" y="${a}" width="${S - 2 * a}" height="${S - 2 * a}"/>`;
      if (narrow) return out;
      for (let i = 0; i <= N; i += 1) {
        const q = G + i * T, long = i % 5 === 0 ? 9 : 5;
        out += `<path class="so-frame" d="M${q} ${a}v-${long}M${a} ${q}h-${long}M${q} ${S - a}v${long}M${S - a} ${q}h${long}"/>`;
      }
      return out;
    }
  };
})();
