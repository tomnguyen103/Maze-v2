// Clover (Explorer) and the Fangmoor wolf (Warden), ported from docs/research/popup-art-spike/art.js.
/** @typedef {CanvasRenderingContext2D} Ctx */
/** @typedef {"patrol" | "hunt" | "intercept" | "lured"} Mode */
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
  for (const dx of [-1, 1]) {
    E(c, dx * 8, -23, 4.8, 5.8, "#fff", K, 2);
    E(c, dx * 8 + dx * .8, -22, 3, 3, K);
    E(c, dx * 8 + dx * .8 + 1.2, -23.6, 1.1, 1.1, "#fff");
  }
  alpha(c, .45, () => { E(c, -13, -13, 3.6, 3.6, CORAL); E(c, 13, -13, 3.6, 3.6, CORAL); });
  D(c, "M-3 -15 h6 l-3 3.5z", "#ff6f91", K, 1.4); D(c, "M-4.5 -10 q4.5 4.5 9 0", 0, K, 2.4);
  R(c, -2.6, -8.5, 5.2, 4.5, 1, "#fff", K, 1.2);
  alpha(c, .7, () => D(c, "M-9 -13 l-11 -2 M-9 -10 l-11 2 M9 -13 l11 -2 M9 -10 l11 2", 0, K, 1.3));
  D(c, "M-17 -3 Q0 7 17 -3 L17 5 Q0 15 -17 5Z", "#4db8ff", K, SW);
  D(c, "M7 7 l7 17 l-7 -2 l-4 5 l-1 -18z", "#4db8ff", K, 2.2);
  arm(c, 1, P);
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

export default {
  /**
   * Fills a square tile of `size` canvas pixels with one figure.
   * @param {CanvasRenderingContext2D} ctx
   * @param {"clover" | "fangmoor"} key
   * @param {Mode | "idle"} mode The Warden Mode; ignored for Clover.
   * @param {number} size
   * @param {boolean} flat True skips the glow.
   */
  drawFigure(ctx, key, mode, size, flat) {
    const warden = key === "fangmoor", side = warden ? 124 : 130;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / side, size / side);
    ctx.translate(0, warden ? 7 : 14);
    if (warden) wolf(ctx, /** @type {Mode} */ (mode), size / side, flat); else clover(ctx);
    ctx.restore();
  }
};
