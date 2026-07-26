import { describe, expect, it } from "vitest";
import {
  clearActiveRunLocator,
  loadActiveRunLocator,
  saveActiveRunLocator
} from "../src/game/active-run-locator.js";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value),
    /** @param {string} key */
    removeItem: (key) => values.delete(key)
  };
}

describe("Active Run Locator", () => {
  it("round-trips exact valid Labyrinth reconstruction metadata", () => {
    const storage = createStorage();
    const locator = {
      version: 1,
      seed: "STONE-VAULT-00",
      levelId: "maze-master",
      labyrinthNumber: 13
    };

    expect(saveActiveRunLocator(locator, storage)).toEqual(locator);
    expect(loadActiveRunLocator(storage)).toEqual(locator);
  });

  it("round-trips the stable access id for an admitted Run", () => {
    const storage = createStorage();
    const locator = {
      version: 2,
      runId: "access_01J1MOSSWATCH",
      pending: true,
      seed: "STONE-VAULT-00",
      levelId: "maze-master",
      labyrinthNumber: 13
    };

    expect(saveActiveRunLocator(locator, storage)).toEqual(locator);
    expect(loadActiveRunLocator(storage)).toEqual(locator);
  });

  it("distinguishes a pending admission from an admitted active Run", () => {
    const storage = createStorage();
    const pending = saveActiveRunLocator(
      {
        version: 2,
        runId: "access_01J1MOSSWATCH",
        pending: true,
        seed: "STONE-VAULT-00",
        levelId: "maze-master",
        labyrinthNumber: 13
      },
      storage
    );
    const admitted = saveActiveRunLocator(
      { ...pending, pending: false },
      storage
    );

    expect(loadActiveRunLocator(storage)).toEqual(admitted);
    expect(admitted.pending).toBe(false);
  });

  it("returns null when no locator was saved", () => {
    expect(loadActiveRunLocator(createStorage())).toBeNull();
  });

  it.each([
    "{broken",
    JSON.stringify({
      version: 3,
      seed: "STONE-VAULT-00",
      levelId: "trail-scout",
      labyrinthNumber: 1
    }),
    JSON.stringify({
      version: 1,
      seed: "STONE-VAULT-00",
      levelId: "trail-scout",
      labyrinthNumber: 21
    })
  ])("rejects and clears incompatible locator data", (storedValue) => {
    const storage = createStorage();
    storage.setItem("echo-maze:active-run:v1", storedValue);

    expect(loadActiveRunLocator(storage)).toBeNull();
    expect(storage.getItem("echo-maze:active-run:v1")).toBeNull();
  });

  it("clears the saved locator without affecting other device state", () => {
    const storage = createStorage();
    storage.setItem("other-key", "preserved");
    saveActiveRunLocator(
      {
        version: 1,
        seed: "EMBER-HOLLOW-48",
        levelId: "bright-start",
        labyrinthNumber: 1
      },
      storage
    );

    clearActiveRunLocator(storage);

    expect(loadActiveRunLocator(storage)).toBeNull();
    expect(storage.getItem("other-key")).toBe("preserved");
  });
});
