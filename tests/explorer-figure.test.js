import { describe, expect, it } from "vitest";
import { CLASS_EXPEDITION_ACTIVE_KEY } from "../src/classroom/class-expedition-selection.js";
import { saveSelectedClassroom } from "../src/classroom/classroom-selection.js";
import {
  EXPLORER_FIGURE_STORAGE_KEY,
  EXPLORER_FIGURES,
  explorerFigureForPlay,
  loadExplorerFigure,
  saveExplorerFigure
} from "../src/player/explorer-figure.js";

/** @param {Record<string, string>} [initial] */
function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (/** @type {string} */ key) => values.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => void values.set(key, value),
    removeItem: (/** @type {string} */ key) => void values.delete(key),
    key: (/** @type {number} */ index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    }
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  }
};

describe("Explorer Figure storage", () => {
  it("gives Clover on a new device", () => {
    expect(loadExplorerFigure(createStorage())).toBe("clover");
    expect(EXPLORER_FIGURES[0]).toBe("clover");
  });

  it("loads a saved pick back", () => {
    const storage = createStorage();
    for (const figure of EXPLORER_FIGURES) {
      expect(saveExplorerFigure(figure, storage)).toBe(figure);
      expect(loadExplorerFigure(storage)).toBe(figure);
    }
  });

  it.each(["wolf", "", '"pip"', "{}"])("gives Clover for the bad stored value %j", (value) => {
    expect(loadExplorerFigure(createStorage({ [EXPLORER_FIGURE_STORAGE_KEY]: value }))).toBe("clover");
  });

  it("gives Clover from a storage that throws, and never throws on load", () => {
    expect(loadExplorerFigure(throwing)).toBe("clover");
    expect(explorerFigureForPlay(throwing)).toBe("clover");
  });

  it("lets a save error reach the caller", () => {
    expect(() => saveExplorerFigure("pip", throwing)).toThrow("blocked");
  });

  it("gives Clover in Class Play while a pick is saved", () => {
    const storage = createStorage();
    saveExplorerFigure("fen", storage);
    expect(explorerFigureForPlay(storage)).toBe("fen");
    storage.setItem(CLASS_EXPEDITION_ACTIVE_KEY, "true");
    expect(explorerFigureForPlay(storage)).toBe("clover");
  });

  it("gives Clover in plain Class Play, which sets no Class Expedition flag", () => {
    const storage = createStorage();
    saveExplorerFigure("tuck", storage);
    expect(saveSelectedClassroom("org_class123", storage, "user_student1")).toBe(true);
    expect(storage.getItem(CLASS_EXPEDITION_ACTIVE_KEY)).toBeNull();
    expect(explorerFigureForPlay(storage)).toBe("clover");
    expect(loadExplorerFigure(storage)).toBe("tuck");
  });

  it("saves Clover for a figure outside the list", () => {
    const storage = createStorage();
    expect(saveExplorerFigure("bad", storage)).toBe("clover");
    expect(storage.getItem(EXPLORER_FIGURE_STORAGE_KEY)).toBe("clover");
  });
});
