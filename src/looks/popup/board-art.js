// The five Explorer Figures and the Fangmoor wolf (Warden), ported from docs/research/popup-art-spike/art.js.
import { explorerFigureForPlay } from "../../player/explorer-figure.js";
/** @typedef {CanvasRenderingContext2D} Ctx */
/** @typedef {"patrol" | "hunt" | "intercept" | "lured"} Mode */
/** @typedef {import("../../player/explorer-figure.js").ExplorerFigure} ExplorerFigure */
const K = "#3a2449", SW = 2.6, CORAL = "#ff5a3c", SUN = "#ffc93c", CREAM = "#fff8e7";

/** @type {(c: Ctx, P: Path2D, f?: string | 0, s?: string | 0, w?: number) => void} */
const fs = (c, P, f, s, w) => {
  if (f) { c.fillStyle = f; c.fill(P); }
  if (s) { c.strokeStyle = s; c.lineWidth = w ?? 1; c.lineJoin = c.lineCap = "round"; c.stroke(P); }
};
/** @type {(c: Ctx, d: string, f?: string | 0, s?: string | 0, w?: number) => void} */
const D = (c, d, ...a) => fs(c, new Path2D(d), ...a);
/** @type {(c: Ctx, x: number, y: number, rx: number, ry: number, f?: string | 0, s?: string | 0, w?: number) => void} */
const E = (c, x, y, rx, ry, ...a) => { const P = new Path2D(); P.ellipse(x, y, rx, ry, 0, 0, 7); fs(c, P, ...a); };
/** @type {(c: Ctx, x: number, y: number, w: number, h: number, r: number, f?: string | 0, s?: string | 0, lw?: number) => void} */
const R = (c, x, y, w, h, r, ...a) => { const P = new Path2D(); P.roundRect(x, y, w, h, r); fs(c, P, ...a); };
/** @type {(c: Ctx, f: () => void) => void} */
const mir = (c, f) => { f(); c.save(); c.scale(-1, 1); f(); c.restore(); };
/** @type {(c: Ctx, a: number, f: () => void) => void} */
const alpha = (c, a, f) => { c.save(); c.globalAlpha = a; f(); c.restore(); };
/** @type {(c: Ctx, x: number, y: number, deg: number, f: () => void) => void} */
const at = (c, x, y, deg, f) => { c.save(); c.translate(x, y); c.rotate(deg * Math.PI / 180); f(); c.restore(); };

/** @type {(c: Ctx, s: number, col: string) => void} */
const arm = (c, s, col) => {
  const d = `M${s * 13} 6 Q${s * 26} 18 ${s * 21} 30`;
  D(c, d, 0, K, 11); D(c, d, 0, col, 6); E(c, s * 21, 30, 5, 5, col, K, SW);
};

/** @type {(c: Ctx, x: number, y: number, s?: number) => void} */
const eyes = (c, x, y, s = 1) => [-1, 1].forEach((dx) => {
  const X = dx * x;
  E(c, X, y, 4.8 * s, 5.8 * s, "#fff", K, 2);
  E(c, X + dx * .8, y + 1, 3 * s, 3 * s, K);
  E(c, X + dx * .8 + 1.2, y - .6, 1.1, 1.1, "#fff");
});
/** @type {(c: Ctx, y: number) => void} */
const mouth = (c, y) => D(c, `M-4.5 ${y} q4.5 4.5 9 0`, 0, K, 2.4);
/** @type {(c: Ctx, x: number, y: number) => void} */
const cheeks = (c, x, y) => alpha(c, .45, () => { E(c, -x, y, 3.6, 3.6, CORAL); E(c, x, y, 3.6, 3.6, CORAL); });
/** @type {(c: Ctx, col: string) => void} */
const scarf = (c, col) => {
  D(c, "M-17 -3 Q0 7 17 -3 L17 5 Q0 15 -17 5Z", col, K, SW);
  D(c, "M7 7 l7 17 l-7 -2 l-4 5 l-1 -18z", col, K, 2.2);
};
/** @type {(c: Ctx, s: number, col: string) => void} */
const wing = (c, s, col) => {
  const hx = s * 40, hy = 4, hx2 = s * 14, my = 16, mx = (hx + hx2) / 2;
  const pull = (/** @type {number[]} */ a, /** @type {number[]} */ b) => { const px = (a[0] + b[0]) / 2, py = (a[1] + b[1]) / 2; return [px - px * .28, py + (10 - py) * .28]; };
  const c1 = pull([hx, hy], [mx, my]), c2 = pull([mx, my], [hx2, 28]);
  D(c, `M${s * 12} 2 L${hx} ${hy} Q${c1} ${mx} ${my} Q${c2} ${hx2} 28 Z`, col, K, SW);
  D(c, `M${s * 12} 2 L${mx} ${my}`, 0, "#5a6bb0", 1.6);
  E(c, hx, hy, 3.6, 3.6, col, K, 2);
};

/** @param {Ctx} c */
function clover(c) {
  const P = "#ffb3c7", ear = (/** @type {number} */ x, /** @type {number} */ r) => at(c, x, -36, r, () => {
    D(c, "M0 2 C-11 -6 -11 -36 0 -40 C11 -36 11 -6 0 2Z", P, K, SW);
    D(c, "M0 -4 C-5 -10 -5 -28 0 -33 C5 -28 5 -10 0 -4Z", "#ff6f91");
  });
  ear(-9, -14); ear(9, 12);
  E(c, -17, 32, 7, 7, "#fff", K, 2.2);
  arm(c, -1, P);
  D(c, "M-16 2 Q-22 38 -10 44 H10 Q22 38 16 2 Q0 -6 -16 2Z", P, K, SW);
  E(c, 0, 25, 9, 12, CREAM);
  E(c, -9, 45, 9, 4.5, CREAM, K, 2); E(c, 9, 45, 9, 4.5, CREAM, K, 2);
  E(c, 0, -20, 21, 21, P, K, SW); E(c, 0, -11, 10, 7, CREAM);
  eyes(c, 8, -23); cheeks(c, 13, -13);
  D(c, "M-3 -15 h6 l-3 3.5z", "#ff6f91", K, 1.4); mouth(c, -10);
  R(c, -2.6, -8.5, 5.2, 4.5, 1, "#fff", K, 1.2);
  alpha(c, .7, () => D(c, "M-9 -13 l-11 -2 M-9 -10 l-11 2 M9 -13 l11 -2 M9 -10 l11 2", 0, K, 1.3));
  scarf(c, "#4db8ff"); arm(c, 1, P);
}

/** @param {Ctx} c */
function pip(c) {
  const B = "#2f3d7a";
  mir(c, () => {
    D(c, "M-19 -32 Q-42 -42 -40 -60 Q-22 -58 -6 -42Z", B, K, SW);
    alpha(c, .85, () => D(c, "M-18 -37 Q-34 -44 -34 -54 Q-22 -52 -11 -43Z", CORAL));
  });
  wing(c, -1, B); wing(c, 1, B);
  D(c, "M-15 2 Q-19 36 -10 44 H10 Q19 36 15 2 Q0 -6 -15 2Z", B, K, SW);
  alpha(c, .9, () => E(c, 0, 24, 9, 12, "#e9e1ff"));
  E(c, -7, 45, 6, 3.5, B, K, 2); E(c, 7, 45, 6, 3.5, B, K, 2);
  E(c, 0, -22, 22, 22, B, K, SW);
  D(c, "M-16 -22 Q-16 -36 -6 -32 Q0 -30 6 -32 Q16 -36 16 -22 Q16 -6 0 -5 Q-16 -6 -16 -22Z", CREAM);
  D(c, "M-2 -40 q2 -8 6 -9 q-1 6 -2 9z", B, K, 2);
  eyes(c, 7.5, -23); cheeks(c, 12, -14); mouth(c, -13);
  D(c, "M2 -12.5 l1.5 3 l1.5 -3z", "#fff", K, 1);
  scarf(c, CORAL);
}

/** @param {Ctx} c */
function lumi(c) {
  arm(c, -1, SUN);
  D(c, "M-15 0 L-21 40 Q0 46 21 40 L15 0Z", SUN, K, SW);
  D(c, "M0 4 V40", 0, K, 1.8); E(c, -4, 14, 1.8, 1.8, K); E(c, -4, 26, 1.8, 1.8, K);
  R(c, 5, 22, 9, 8, 2, 0, K, 1.8);
  R(c, -14, 39, 11, 9, 3, CORAL, K, 2); R(c, 3, 39, 11, 9, 3, CORAL, K, 2);
  E(c, 0, -24, 25, 25, SUN, K, SW); E(c, 0, -21, 17.5, 17.5, "#f2c39b", K, 2);
  D(c, "M-16 -26 Q-8 -18 -2 -30 Q4 -19 16 -26 Q12 -40 0 -40 Q-12 -40 -16 -26Z", "#4a2c22");
  D(c, "M-26 -28 Q0 -62 26 -28 Q0 -44 -26 -28Z", SUN, K, SW);
  eyes(c, 7, -21, .92); cheeks(c, 11, -13); mouth(c, -12);
  scarf(c, "#4db8ff"); arm(c, 1, SUN);
  c.save(); c.translate(25, 42);
  alpha(c, .35, () => E(c, 0, 0, 14, 14, SUN));
  D(c, "M-4 -16 q4 -7 8 0", 0, K, 2);
  R(c, -8, -12, 16, 20, 7, CORAL, K, 2.2);
  D(c, "M-4 -11 v18 M4 -11 v18", 0, "#c23a24", 1.5);
  R(c, -5, -14, 10, 3, 1, K); R(c, -5, 7, 10, 3, 1, K);
  c.restore();
}

/** @param {Ctx} c */
function fen(c) {
  const O = "#ff8a3d", BR = "#4a2c22", RU = "#c9601f";
  D(c, "M-12 32 L-44 20 L-36 2 L-18 14Z", O, K, SW);
  D(c, "M-44 20 L-36 2 L-42 8Z", CREAM, K, 2);
  arm(c, -1, O);
  D(c, "M-14 0 L-18 42 L18 42 L14 0Z", O, K, SW);
  D(c, "M-10 2 L0 30 L10 2Z", CREAM, K, 1.8);
  D(c, "M-16 22 L-6 42 M16 22 L6 42", 0, RU, 1.6);
  E(c, -8, 44, 6.5, 3.5, BR, K, 2); E(c, 8, 44, 6.5, 3.5, BR, K, 2);
  mir(c, () => {
    D(c, "M-24 -30 L-21 -60 L-7 -38Z", O, K, SW);
    D(c, "M-20 -34 L-19 -52 L-11 -39Z", BR);
  });
  D(c, "M-26 -30 L-12 -40 L0 -36 L12 -40 L26 -30 L0 -2Z", O, K, SW);
  mir(c, () => D(c, "M-26 -30 L0 -2 L-4 -20Z", CREAM, K, 1.8));
  D(c, "M0 -36 L0 -14", 0, RU, 1.6); D(c, "M-3.5 -7 h7 l-3.5 5z", K);
  eyes(c, 9.5, -24, .9);
  scarf(c, "#6cc24a"); arm(c, 1, O);
  at(c, 23, 28, 70, () => { R(c, -4, -12, 8, 24, 3, CREAM, K, 2); R(c, -6, -13, 12, 4, 2, CORAL, K, 1.6); });
}

/** @param {Ctx} c */
function tuck(c) {
  const T = "#f0c987", BR = "#9b5b2e";
  arm(c, -1, T);
  E(c, 0, 22, 18, 22, T, K, SW);
  alpha(c, .8, () => E(c, 0, 26, 10, 12, CREAM));
  E(c, -8, 45, 6, 3.5, BR, K, 2); E(c, 8, 45, 6, 3.5, BR, K, 2);
  E(c, 0, -19, 19, 19, "#f6d7a8", K, SW);
  D(c, "M-25 -24 Q0 -60 25 -24 Q0 -32 -25 -24Z", BR, K, SW);
  D(c, "M-16 -32 l6 -8 M-6 -35 l6 -9 M4 -35 l6 -8 M14 -31 l4 -6", 0, "#6e3c1b", 1.8);
  D(c, "M0 -43 q1 -10 -2 -16", 0, "#3f7f2a", 3);
  D(c, "M-2 -58 q-14 -6 -16 4 q10 4 16 -4z", "#6cc24a", K, 2);
  D(c, "M-1 -56 q12 -10 16 0 q-8 6 -16 0z", "#6cc24a", K, 2);
  eyes(c, 7, -18, .9); cheeks(c, 11, -10); mouth(c, -9);
  scarf(c, CORAL); arm(c, 1, T);
  c.save(); c.translate(24, 39);
  D(c, "M-8 6 Q-8 -8 0 -9 Q8 -8 8 6 L10 9 H-10Z", SUN, K, 2.2);
  E(c, 0, 11, 2.6, 2.6, K); E(c, 0, -11, 2, 2, 0, K, 1.8);
  c.restore();
}

// The Mode sets the eye glow, the eye look, and the badge colour and glyph.
const DARK = "#2b1747", MID = "#4a2a85", VOID = "#140a22", BONE = "#efe4c8";
/** @type {Record<Mode, number[]>} */
const LOOK = { patrol: [1.5, 0], hunt: [2.5, .5], intercept: [2.5, -.5], lured: [-1, -1.5] };
/** @type {Record<Mode, string>} */
const GLOW = { patrol: "#ffd23c", hunt: CORAL, intercept: "#ffd23c", lured: "#4db8ff" };
/** @type {Record<Mode, string>} */
const BADGE = { patrol: "#fff", hunt: CORAL, intercept: SUN, lured: "#4db8ff" };

/** @param {Ctx} c @param {Mode} m @param {number} k @param {boolean} flat */
function wolf(c, m, k, flat) {
  const hunt = m === "hunt";
  const ear = hunt ? "M-22 -22 L-38 -46 L-12 -36Z" : "M-22 -24 L-30 -60 L-10 -38Z";
  D(c, "M-22 4 L-30 44 L-22 38 L-16 48 L-8 40 L0 48 L8 40 L16 48 L22 38 L30 44 L22 4 Z", DARK, K, SW);
  D(c, "M-12 6 L-8 26 L-4 18 L0 30 L4 18 L8 26 L12 6Z", MID);
  D(c, "M-18 46 l-3 6 M-14 46 l0 7 M-10 46 l3 6 M10 46 l-3 6 M14 46 l0 7 M18 46 l3 6", 0, BONE, 2.6);
  mir(c, () => {
    D(c, ear, DARK, K, SW);
    c.save(); c.translate(-2, 4); c.scale(.6, .6); D(c, ear, MID); c.restore();
  });
  D(c, "M-24 -20 Q-26 -40 0 -42 Q26 -40 24 -20 Q24 -2 12 6 L0 14 L-12 6 Q-24 -2 -24 -20Z", DARK, K, SW);
  mir(c, () => D(c, "M-24 -14 L-32 -8 L-24 -6 L-30 0 L-20 0Z", DARK, K, SW));
  D(c, "M-10 -14 Q0 -18 10 -14 L7 4 Q0 9 -7 4Z", MID);
  const [dx, dy] = LOOK[m], o = hunt ? 4 : 3, x = 11, y = -24, w = 7;
  for (const s of [-1, 1]) {
    c.save();
    // High contrast and forced colours skip the eye glow.
    if (!flat) { c.shadowColor = GLOW[m]; c.shadowBlur = 4.8 * k; }
    const d = `M${s * (x + w)} ${y - o} Q${s * x} ${y - o - 4} ${s * (x - w)} ${y + 2} Q${s * x} ${y + 3} ${s * (x + w)} ${y - o}Z`;
    D(c, d, GLOW[m]); D(c, d, GLOW[m]);
    c.restore();
    E(c, s * x + dx, y - 1 + dy, 1.3, hunt ? 3.4 : 2.6, VOID);
  }
  D(c, "M-4 -12 Q0 -14 4 -12 L0 -7Z", VOID);
  const j = hunt ? 10 : m === "lured" ? 3 : 6;
  D(c, `M-8 1 Q0 ${2 + j} 8 1 Z`, VOID);
  D(c, `M-7 1 l2 ${j * .7} l2 ${-j * .7} M3 1 l2 ${j * .7} l2 ${-j * .7}`, BONE, BONE, 1);
  // The Mode badge keeps a shape cue, so the Mode never rests on colour alone.
  c.save(); c.translate(30, -44);
  E(c, 0, 0, 11, 11, BADGE[m], K, 2.4);
  if (m === "patrol") { E(c, -3.5, 2, 2.6, 3.6, K); E(c, 3.5, -2.5, 2.6, 3.6, K); }
  if (hunt) { R(c, -1.8, -7, 3.6, 9, 1.8, "#fff"); E(c, 0, 5.2, 2, 2, "#fff"); }
  if (m === "intercept") D(c, "M-6 4 Q-2 -6 6 -4 M6 -4 l-4 -3 M6 -4 l-3 4", 0, K, 2.4);
  if (m === "lured") { D(c, "M-1 5 V-6 l6 -2 v9", 0, K, 2.2); E(c, -3, 5, 2.6, 2.6, K); E(c, 3, 2, 2.6, 2.6, K); }
  c.restore();
}

/** @type {Record<string, (c: Ctx) => void>} */
const FIGURES = { clover, pip, lumi, fen, tuck };

export default {
  /**
   * Fills a square tile of `size` canvas pixels with one figure.
   * @param {CanvasRenderingContext2D} ctx
   * @param {"fangmoor" | "explorer" | ExplorerFigure} key "explorer" draws the saved pick; an unknown key draws Clover.
   * @param {Mode | "idle"} mode The Warden Mode; ignored for the Explorer Figures.
   * @param {number} size
   * @param {boolean} flat True skips the glow.
   */
  drawFigure(ctx, key, mode, size, flat) {
    const warden = key === "fangmoor", side = warden ? 124 : 130;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / side, size / side);
    ctx.translate(0, warden ? 7 : 14);
    if (warden) wolf(ctx, /** @type {Mode} */ (mode), size / side, flat);
    else {
      const name = key === "explorer" ? explorerFigureForPlay() : key;
      (Object.hasOwn(FIGURES, name) ? FIGURES[name] : clover)(ctx);
    }
    ctx.restore();
  }
};
