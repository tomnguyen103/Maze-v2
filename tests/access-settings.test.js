// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_SETTINGS_STORAGE_KEY,
  DEFAULT_ACCESS_SETTINGS,
  applyAccessSettings,
  loadAccessSettings,
  saveAccessSettings
} from "../src/player/access-settings.js";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key */
    removeItem: (key) => values.delete(key),
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value)
  };
}

describe("Explorer Access Settings", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-access-contrast");
    document.documentElement.removeAttribute("data-access-effects");
    document.documentElement.removeAttribute("data-access-marks");
    document.documentElement.removeAttribute("data-access-type");
  });

  it("uses the locked design defaults for absent or corrupted storage", () => {
    const storage = createStorage();

    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
    storage.setItem(ACCESS_SETTINGS_STORAGE_KEY, "{broken");
    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
    storage.setItem(
      ACCESS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        highContrast: true,
        largeMarks: true,
        readerFriendlyQuestions: true,
        reducedEffects: true
      })
    );
    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
  });

  it("keeps defaults when the browser denies access to localStorage", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage denied.", "SecurityError");
      }
    });

    try {
      expect(loadAccessSettings()).toEqual(DEFAULT_ACCESS_SETTINGS);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "localStorage", descriptor);
      }
    }
  });

  it("persists only the versioned boolean presentation contract", () => {
    const storage = createStorage();
    const settings =
      /** @type {Parameters<typeof saveAccessSettings>[0]} */ ({
      version: 1,
      highContrast: true,
      largeMarks: true,
      readerFriendlyQuestions: true,
      reducedEffects: true
      });

    expect(saveAccessSettings(settings, storage)).toEqual(settings);
    expect(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    ).toEqual(settings);

    storage.setItem(
      ACCESS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...settings,
        highContrast: "yes",
        unrelatedGameRule: 99
      })
    );
    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
  });

  it("applies presentation flags without receiving Run state", () => {
    applyAccessSettings(
      {
        version: 1,
        highContrast: true,
        largeMarks: true,
        readerFriendlyQuestions: true,
        reducedEffects: true
      },
      document.documentElement
    );

    expect(document.documentElement.dataset).toMatchObject({
      accessContrast: "strong",
      accessEffects: "reduced",
      accessMarks: "large",
      accessType: "reader"
    });

    applyAccessSettings(DEFAULT_ACCESS_SETTINGS, document.documentElement);
    expect(document.documentElement.dataset).toMatchObject({
      accessContrast: "default",
      accessEffects: "system",
      accessMarks: "default",
      accessType: "default"
    });
  });
});
