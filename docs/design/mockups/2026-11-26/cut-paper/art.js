/* Cut Paper: a tabletop tray. Walls are raised blocks, pieces are thick card tokens. */
window.ART = (function () {
  "use strict";
  const T = 40;
  const LIFT = 6; // how far a block stands above the floor
  const TURN = { right: 0, down: 90, left: 180, up: 270 };
  const g = (x, y, inner, turn) => `<g transform="translate(${x} ${y})${turn ? ` rotate(${turn})` : ""}">${inner}</g>`;
  // A token is its shape drawn twice: the side, then the top.
  const token = (shape, depth) => `<g class="cp-under" transform="translate(0 ${depth || 4})">${shape}</g>${shape}`;
  const plank = `<rect class="cp-plank" x="-22" y="-9" width="44" height="18" rx="3"/>`;
  const WARDEN = {
    patrol: `<rect class="cp-warden" x="-10" y="-12" width="20" height="20" rx="5"/>`,
    hunt: `<path class="cp-warden" d="M0 -16L4 -6L13 -2L4 2L0 12L-4 2L-13 -2L-4 -6Z"/>`,
    intercept: `<path class="cp-warden cp-line" d="M-9 -9L0 0L9 -9"/>`,
    lured: `<path class="cp-warden cp-line" d="M-8 -10V0A8 8 0 0 0 8 0V-10"/>`
  };

  return {
    defaultTheme: "light",
    gutter: 14,
    gutterNarrow: 9,
    defs: "",
    base: (N, G, S) => `<rect class="cp-tray" width="${S}" height="${S}" rx="12"/>`,
    swatchFloor: (x) => `<rect class="cp-tray" x="${x}" width="${T}" height="${T}"/>`,
    tile({ x, y, passage, state }) {
      if (state === "fog") return { under: `<rect class="cp-fog" x="${x + 1.5}" y="${y + 1.5}" width="${T - 3}" height="${T - 3}" rx="4"/>` };
      const floor = `<rect class="cp-floor cp-floor--${state}" x="${x}" y="${y}" width="${T}" height="${T}"/>`;
      if (passage) return { under: floor + (state === "pulse" ? `<rect class="cp-pulse" x="${x + 5}" y="${y + 5}" width="${T - 10}" height="${T - 10}" rx="4"/>` : "") };
      return {
        under: floor,
        over: `<rect class="cp-block-side cp-block-side--${state}" x="${x}" y="${y}" width="${T}" height="${T}" rx="5"/>` +
          `<rect class="cp-block cp-block--${state}" x="${x}" y="${y - LIFT}" width="${T}" height="${T}" rx="5"/>`
      };
    },
    piece(kind, x, y, o) {
      switch (kind) {
        case "explorer": return g(x, y, token(`<circle class="cp-explorer" cy="-2" r="12"/>`) + `<circle class="cp-explorer-eye" cy="-2" r="4.5"/>`);
        case "echo": return g(x, y, token(`<path class="cp-echo" d="M0 -14L10.4 -8V4L0 10L-10.4 4V-8Z"/>`, 3) + `<text class="cp-num" y="2.5">${o.n}</text>`);
        case "gate": return g(x, y, token(`<path class="cp-gate" fill-rule="evenodd" d="M-11 10V-4A11 11 0 0 1 11 -4V10Z${o.open ? "M-5 10V-3A5 5 0 0 1 5 -3V10Z" : ""}"/>`) + (o.open ? "" : `<path class="cp-gate-bar" d="M-6 1H6"/>`));
        case "warden": return g(x, y, token(WARDEN[o.mode]));
        case "danger": return g(x, y, `<path class="cp-danger" d="M-13 0H10M4 -6L11 0L4 6"/>`, TURN[o.direction]);
        case "bell": return g(x, y, o.spent ? `<path class="cp-spent" d="M-9 6H9L6 2V-4A6 6 0 0 0 -6 -4V2Z"/>` : token(`<path class="cp-bell" d="M-10 5H10L7 1V-6A7 7 0 0 0 -7 -6V1Z"/>`, 3));
        case "windway": return g(x, y, `<path class="cp-wind" d="M-13 -4H2V-10L13 0L2 10V4H-13Z"/>`, TURN[o.direction]);
        case "bridge": return g(x, y, o.open ? token(plank + `<path class="cp-slat" d="M-11 -9V9M0 -9V9M11 -9V9"/>`, 3) : `<rect class="cp-ghost" x="-21" y="-9" width="42" height="18" rx="3"/>`, o.horizontal ? 0 : 90) +
          (o.open ? "" : g(x, y, `<circle class="cp-echo" r="8"/><text class="cp-num cp-num--small" y="3.5">${o.n}</text>`));
        case "tide": return g(x, y, o.open
          ? `<rect class="cp-tide-open" x="-20" y="-10" width="40" height="20" rx="3"/><path class="cp-ripple" d="M-12 0q3 -5 6 0t6 0t6 0t6 0"/>`
          : token(`<rect class="cp-tide" x="-20" y="-13" width="40" height="20" rx="4"/>`, 5), o.horizontal ? 0 : 90);
        default: return "";
      }
    },
    frame: (N, G, S) => `<rect class="cp-rim" x="3" y="3" width="${S - 6}" height="${S - 6}" rx="10"/>`
  };
})();
