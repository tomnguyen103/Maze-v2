// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import motion from "../src/looks/popup/motion.js";
import { createMotionPlayer } from "../src/game/motion-player.js";

const run = {
  labyrinth: new Array(10).fill(0),
  explorer: { row: 2, col: 3 },
  gate: { row: 9, col: 9, open: true }
};

/** @type {Array<{ target: Element, keyframes: Keyframe[], options: any, settle: (ok: boolean) => void }>} */
let calls;
const original = Element.prototype.animate;

beforeEach(() => {
  document.body.innerHTML = '<div id="frame"></div>';
  calls = [];
  Element.prototype.animate = /** @type {any} */ (function (
    /** @type {Keyframe[]} */ keyframes,
    /** @type {any} */ options
  ) {
    /** @type {(ok: boolean) => void} */
    let settle = () => {};
    const finished = new Promise((resolve, reject) => {
      settle = (ok) => (ok ? resolve(undefined) : reject(new Error("cancel")));
    });
    // @ts-expect-error the stub reads the element it runs on
    calls.push({ target: this, keyframes, options, settle });
    return { finished };
  });
});

afterEach(() => {
  Element.prototype.animate = original;
});

const frame = () => /** @type {HTMLElement} */ (document.getElementById("frame"));
const flush = () => new Promise((resolve) => setTimeout(resolve));

/** @type {Array<[string, () => void]>} */
const boardMotions = [
  ["flapRipple", () => motion.flapRipple(frame(), run)],
  ["gatePopUp", () => motion.gatePopUp(frame(), run)],
  ["paperConfetti", () => motion.paperConfetti(frame(), run)]
];

describe("Popup motion", () => {
  it.each(boardMotions)("%s makes hidden elements with a plain one-shot animation", (_name, start) => {
    start();
    expect(calls.length).toBeGreaterThan(0);
    for (const { target, keyframes, options } of calls) {
      expect(target.getAttribute("aria-hidden")).toBe("true");
      expect(target.className).toMatch(/^motion-/);
      expect(target.parentElement?.className).toBe("motion-layer");
      for (const key of keyframes.flatMap((step) => Object.keys(step))) {
        expect(["transform", "opacity", "offset"]).toContain(key);
      }
      expect(options.duration).toBeGreaterThanOrEqual(120);
      expect(options.duration).toBeLessThanOrEqual(300);
      expect(options.easing).toBe("ease-out");
      expect(options.iterations).toBe(1);
      expect(options).not.toHaveProperty("fill");
    }
  });

  it.each(boardMotions)("%s removes each element on finish and on cancel", async (_name, start) => {
    start();
    const targets = calls.map((call) => call.target);
    calls.forEach((call, index) => call.settle(index % 2 === 0));
    await flush();
    for (const target of targets) {
      expect(target.isConnected).toBe(false);
    }
  });

  it("places the ripple on the Explorer tile and the tab on the Gate tile", () => {
    motion.flapRipple(frame(), run);
    motion.gatePopUp(frame(), run);
    const [ripple, tab] = /** @type {HTMLElement[]} */ (calls.map((call) => call.target));
    expect(ripple.style.left).toBe("35%");
    expect(ripple.style.top).toBe("25%");
    expect(tab.style.left).toBe("95%");
    // The tab stands on the bottom edge of the Gate tile.
    expect(tab.style.top).toBe("100%");
    expect(calls[1].keyframes[0].transform).toContain("scaleY(0)");
  });

  it("makes exactly 12 confetti pieces and one layer", () => {
    motion.paperConfetti(frame(), run);
    expect(calls).toHaveLength(12);
    motion.flapRipple(frame(), run);
    expect(frame().querySelectorAll(".motion-layer")).toHaveLength(1);
  });

  it("pops the ceremony panel up from the bottom edge", async () => {
    const panel = document.createElement("div");
    document.body.append(panel);
    motion.ceremonyPopUp(panel);
    expect(calls[0].keyframes[0].transform).toBe("perspective(600px) rotateX(60deg)");
    expect(calls[0].keyframes[1].transform).toBe("none");
    expect(calls[0].options.duration).toBe(300);
    expect(calls[0].options).not.toHaveProperty("fill");
    expect(panel.style.transformOrigin).toBe("bottom");
    calls[0].settle(true);
    await flush();
    expect(panel.style.transformOrigin).toBe("");
  });

  it("makes nothing and throws nothing without Element.animate", () => {
    // @ts-expect-error the test removes the method on purpose
    delete Element.prototype.animate;
    for (const [, start] of boardMotions) {
      expect(start).not.toThrow();
    }
    expect(() => motion.ceremonyPopUp(frame())).not.toThrow();
    expect(frame().children).toHaveLength(0);
  });
});

describe("motion player", () => {
  afterEach(() => {
    delete document.documentElement.dataset.accessEffects;
  });

  it("never loads the chunk under reduced effects", () => {
    document.documentElement.dataset.accessEffects = "reduced";
    const load = vi.fn();
    createMotionPlayer(load)("flapRipple");
    expect(load).not.toHaveBeenCalled();
  });

  it("skips a queued motion when reduced effects turn on during the load", async () => {
    const flapRipple = vi.fn();
    const play = createMotionPlayer(async () => ({ default: { flapRipple } }));
    play("flapRipple");
    document.documentElement.dataset.accessEffects = "reduced";
    await flush();
    expect(flapRipple).not.toHaveBeenCalled();
  });

  it("loads once and calls the named motion", async () => {
    const flapRipple = vi.fn();
    const load = vi.fn(async () => ({ default: { flapRipple } }));
    const play = createMotionPlayer(load);
    play("flapRipple", 1);
    play("flapRipple", 2);
    play("missing");
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(flapRipple.mock.calls).toEqual([[1], [2]]);
  });

  it("does nothing for a null module and swallows a throwing motion", async () => {
    const nullPlay = createMotionPlayer(async () => ({ default: null }));
    expect(() => nullPlay("flapRipple")).not.toThrow();
    const throwing = createMotionPlayer(async () => ({
      default: {
        flapRipple: () => {
          throw new Error("x");
        }
      }
    }));
    expect(() => throwing("flapRipple")).not.toThrow();
    await flush();
  });

  it("retries after one rejection and stops after the second", async () => {
    const load = vi.fn(async () => {
      throw new Error("offline");
    });
    const play = createMotionPlayer(load);
    play("a");
    await flush();
    play("a");
    await flush();
    play("a");
    play("a");
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
