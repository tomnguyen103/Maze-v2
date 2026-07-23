import { describe, expect, it } from "vitest";
import { loadBestRun, saveBestRun } from "../src/game/storage.js";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value)
  };
}

describe("best run storage", () => {
  it("keeps the faster completed passage", () => {
    const storage = createStorage();
    saveBestRun({ elapsedMs: 80000, moves: 90, seed: "SLOW" }, storage);
    saveBestRun({ elapsedMs: 70000, moves: 120, seed: "FAST" }, storage);
    saveBestRun({ elapsedMs: 90000, moves: 40, seed: "LATE" }, storage);

    expect(loadBestRun(storage)).toEqual({
      elapsedMs: 70000,
      moves: 120,
      seed: "FAST"
    });
  });

  it("ignores malformed stored data", () => {
    const storage = {
      getItem: () => "{broken",
      setItem: () => {}
    };
    expect(loadBestRun(storage)).toBeNull();
  });
});
