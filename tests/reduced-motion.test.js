// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { motionReduced } from "../src/game/reduced-motion.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.accessEffects;
});

describe("motionReduced", () => {
  it("returns true when the system asks for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(motionReduced()).toBe(true);
  });

  it("returns true when the Explorer reduces effects", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.documentElement.dataset.accessEffects = "reduced";
    expect(motionReduced()).toBe(true);
  });

  it("returns false when neither source asks", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.documentElement.dataset.accessEffects = "system";
    expect(motionReduced()).toBe(false);
  });

  it("returns false without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(motionReduced()).toBe(false);
  });
});
