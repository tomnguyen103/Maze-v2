import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import art from "../src/looks/popup/board-art.js";
import pilotArt from "../src/looks/pilot/board-art.js";
import { EXPLORER_FIGURE_STORAGE_KEY, EXPLORER_FIGURES } from "../src/player/explorer-figure.js";

/** @type {string[]} */
let paths = [];

beforeEach(() => {
  paths = [];
  vi.stubGlobal(
    "Path2D",
    class {
      /** @param {string} [d] */
      constructor(d) {
        if (d) paths.push(d);
      }
      ellipse(/** @type {number[]} */ ...a) {
        paths.push(`E${a.slice(0, 4).join(",")}`);
      }
      roundRect(/** @type {number[]} */ ...a) {
        paths.push(`R${a.slice(0, 5).join(",")}`);
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

function stubContext() {
  return {
    fill: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    shadowBlur: 0,
    stroke: vi.fn(),
    translate: vi.fn()
  };
}

/** @param {string} mode @param {boolean} [flat] @param {boolean} [soft] */
function wolf(mode, flat = false, soft = false) {
  paths = [];
  const context = stubContext();
  art.drawFigure(/** @type {never} */ (context), "fangmoor", /** @type {never} */ (mode), 100, flat, soft);
  return { context, signature: paths.join("|") };
}

const OPEN_JAW = { patrol: "M-8 1 Q0 8 8 1 Z", hunt: "M-8 1 Q0 12 8 1 Z", intercept: "M-8 1 Q0 8 8 1 Z", lured: "M-8 1 Q0 5 8 1 Z" };
const TEETH = "M-7 1 l2";
const GLOW_EYE = "M18 -27 Q11 -31";
const CLOSED_EYES = ["M-16 -24 Q-11 -19 -6 -24", "M6 -24 Q11 -19 16 -24"];
const BADGE_ELLIPSE = "E0,0,11,11";
const BADGE_SQUARE = "R-11,-11,22,22,6";

describe("Popup board art", () => {
  it("leaves the Pilot look with no art", () => {
    expect(pilotArt).toBeNull();
  });

  it("draws the Explorer Clover with no throw", () => {
    expect(() => art.drawFigure(/** @type {never} */ (stubContext()), "clover", "idle", 100, false)).not.toThrow();
  });

  /** @param {string} key */
  const draw = (key) => {
    paths = [];
    art.drawFigure(/** @type {never} */ (stubContext()), /** @type {never} */ (key), "idle", 100, false);
    return paths.join("|");
  };

  it("draws each of the five Explorer Figures with a signature of its own", () => {
    const signatures = EXPLORER_FIGURES.map(draw);
    expect(new Set(signatures).size).toBe(5);
  });

  it('draws the stored pick for the key "explorer" and Clover for an unknown key', () => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (/** @type {string} */ k) => store.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v)
    });
    expect(draw("explorer")).toBe(draw("clover"));
    store.set(EXPLORER_FIGURE_STORAGE_KEY, "tuck");
    expect(draw("explorer")).toBe(draw("tuck"));
    expect(draw("explorer")).not.toBe(draw("clover"));
    expect(draw("wolf")).toBe(draw("clover"));
    expect(draw("toString")).toBe(draw("clover"));
  });

  it("draws each Warden Mode with no throw and a Mode badge path of its own", () => {
    const signatures = ["patrol", "hunt", "intercept", "lured"].map((mode) => wolf(mode).signature);
    expect(new Set(signatures).size).toBe(4);
    // Each badge glyph path appears in its own Mode alone.
    const glyph = { hunt: "M-6 4 Q-2 -6", intercept: "M-6 4 Q-2 -6 6 -4", lured: "M-1 5 V-6" };
    expect(signatures[1]).not.toContain(glyph.lured);
    expect(signatures[2]).toContain(glyph.intercept);
    expect(signatures[3]).toContain(glyph.lured);
    expect(signatures[0]).not.toContain(glyph.intercept);
    expect(signatures[0]).not.toContain(glyph.lured);
  });

  it("sets no shadow blur on a flat draw and a blur on a glow draw", () => {
    const blurs = (/** @type {boolean} */ flat) => {
      const context = stubContext();
      const seen = new Set();
      Object.defineProperty(context, "shadowBlur", {
        set: (v) => {
          seen.add(v);
        },
        get: () => 0
      });
      art.drawFigure(/** @type {never} */ (context), "fangmoor", "hunt", 100, flat);
      return seen;
    };
    expect(blurs(true).size).toBe(0);
    expect(blurs(false).size).toBeGreaterThan(0);
  });

  /** @param {string} mode @param {boolean} soft */
  const maxBlur = (mode, soft) => {
    const context = stubContext();
    /** @type {number[]} */
    const seen = [];
    Object.defineProperty(context, "shadowBlur", { set: (v) => { seen.push(v); }, get: () => 0 });
    art.drawFigure(/** @type {never} */ (context), "fangmoor", /** @type {never} */ (mode), 100, false, soft);
    expect(seen.length).toBeGreaterThan(0);
    return Math.max(...seen);
  };

  it("keeps the full open jaw, teeth and glow for each Mode when soft is false or absent", () => {
    for (const mode of ["patrol", "hunt", "intercept", "lured"]) {
      const { signature } = wolf(mode);
      expect(signature).toBe(wolf(mode, false, false).signature);
      expect(signature).toContain(OPEN_JAW[/** @type {keyof typeof OPEN_JAW} */ (mode)]);
      expect(signature).toContain(TEETH);
    }
    for (const mode of ["patrol", "hunt", "intercept"]) expect(wolf(mode).signature).toContain(mode === "hunt" ? "M18 -28 Q11 -32" : GLOW_EYE);
  });

  it("draws the soft Fangmoor with a closed jaw, no teeth and half the eye glow", () => {
    for (const mode of ["patrol", "hunt", "intercept"]) {
      const { signature } = wolf(mode, false, true);
      expect(signature).not.toContain(OPEN_JAW[/** @type {keyof typeof OPEN_JAW} */ (mode)]);
      expect(signature).not.toContain(TEETH);
      expect(signature).toContain("M-7 2 Q0 8 7 2");
      expect(maxBlur(mode, true)).toBeCloseTo(maxBlur(mode, false) / 2);
    }
  });

  it("draws a Lured Fangmoor with closed eyes and a rounded square badge in every level", () => {
    for (const soft of [false, true]) {
      const { signature } = wolf("lured", false, soft);
      for (const eye of CLOSED_EYES) expect(signature).toContain(eye);
      expect(signature).not.toContain("M18 -27 Q11 -31");
      expect(signature).not.toMatch(/E-?[\d.]+,-?[\d.]+,1\.3,/);
      expect(signature).toContain(BADGE_SQUARE);
      expect(signature).not.toContain(BADGE_ELLIPSE);
      expect(signature).toContain("M-1 5 V-6");
    }
    for (const mode of ["patrol", "hunt", "intercept"]) {
      const { signature } = wolf(mode);
      expect(signature).toContain(BADGE_ELLIPSE);
      expect(signature).not.toContain(BADGE_SQUARE);
    }
  });
});
