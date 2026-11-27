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

/** @param {string} mode @param {boolean} [flat] */
function wolf(mode, flat = false) {
  paths = [];
  const context = stubContext();
  art.drawFigure(/** @type {never} */ (context), "fangmoor", /** @type {never} */ (mode), 100, flat);
  return { context, signature: paths.join("|") };
}

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
});
