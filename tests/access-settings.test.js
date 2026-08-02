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
    document.documentElement.removeAttribute("data-access-compass");
    document.documentElement.removeAttribute("data-access-quiet");
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

  it("persists only the versioned presentation contract", () => {
    const storage = createStorage();
    const settings = /** @type {any} */ ({
      version: 1,
      highContrast: true,
      largeMarks: true,
      readerFriendlyQuestions: true,
      reducedEffects: true
    });
    // A version-1 save normalizes to the six-field version-2 record.
    const upgraded = {
      ...settings,
      version: 2,
      trailCompassEnabled: false,
      narrationPace: "standard"
    };

    expect(saveAccessSettings(settings, storage)).toEqual(upgraded);
    expect(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    ).toEqual(upgraded);

    storage.setItem(
      ACCESS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...upgraded,
        highContrast: "yes",
        unrelatedGameRule: 99
      })
    );
    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
  });

  it("applies presentation flags without receiving Run state", () => {
    applyAccessSettings(
      /** @type {any} */ ({
        version: 1,
        highContrast: true,
        largeMarks: true,
        readerFriendlyQuestions: true,
        reducedEffects: true
      }),
      document.documentElement
    );

    expect(document.documentElement.dataset).toMatchObject({
      accessContrast: "strong",
      accessEffects: "reduced",
      accessMarks: "large",
      accessType: "reader",
      accessQuiet: "off"
    });

    applyAccessSettings(DEFAULT_ACCESS_SETTINGS, document.documentElement);
    expect(document.documentElement.dataset).toMatchObject({
      accessContrast: "default",
      accessEffects: "system",
      accessMarks: "default",
      accessType: "default",
      accessQuiet: "off"
    });
  });
});

describe("Explorer Access Settings v2", () => {
  it("upgrades a stored four-field record to Trail Compass Off and Standard pace", () => {
    const storage = createStorage();
    storage.setItem(
      ACCESS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        highContrast: true,
        largeMarks: false,
        readerFriendlyQuestions: true,
        reducedEffects: false
      })
    );
    expect(loadAccessSettings(storage)).toEqual({
      version: 2,
      highContrast: true,
      largeMarks: false,
      readerFriendlyQuestions: true,
      reducedEffects: false,
      trailCompassEnabled: false,
      narrationPace: "standard"
    });
  });

  it("round-trips the six-field record and rejects unknown paces", () => {
    const storage = createStorage();
    const saved = saveAccessSettings(
      {
        version: 2,
        highContrast: false,
        largeMarks: true,
        readerFriendlyQuestions: false,
        reducedEffects: true,
        trailCompassEnabled: true,
        narrationPace: "slower"
      },
      storage
    );
    expect(saved.trailCompassEnabled).toBe(true);
    expect(loadAccessSettings(storage)).toEqual(saved);
    storage.setItem(
      ACCESS_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...saved, narrationPace: "shouting" })
    );
    expect(loadAccessSettings(storage)).toEqual(DEFAULT_ACCESS_SETTINGS);
  });

  it("exposes Trail Compass enablement as presentation dataset state", () => {
    applyAccessSettings(
      {
        ...DEFAULT_ACCESS_SETTINGS,
        trailCompassEnabled: true
      },
      document.documentElement
    );
    expect(document.documentElement.dataset.accessCompass).toBe("trail");
    expect(document.documentElement.dataset.accessQuiet).toBe("off");
    applyAccessSettings(
      {
        ...DEFAULT_ACCESS_SETTINGS,
        readerFriendlyQuestions: true,
        reducedEffects: true,
        trailCompassEnabled: true
      },
      document.documentElement
    );
    expect(document.documentElement.dataset.accessQuiet).toBe("on");
    applyAccessSettings(DEFAULT_ACCESS_SETTINGS, document.documentElement);
    expect(document.documentElement.dataset.accessCompass).toBe("off");
    expect(document.documentElement.dataset.accessQuiet).toBe("off");
  });
});
