import { describe, expect, it } from "vitest";
import {
  ACTIVE_RUN_RECOVERY_KEY,
  scrubActiveRunRecovery
} from "../src/game/local-recovery-scrub.js";

/**
 * @param {string | null} [value]
 * @returns {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem: (key: string) => void
 * }}
 */
function createStorage(value = "sensitive-challenge") {
  let stored = /** @type {string | null} */ (value);
  return {
    getItem: (key) =>
      key === ACTIVE_RUN_RECOVERY_KEY ? stored : null,
    setItem: (key, nextValue) => {
      if (key === ACTIVE_RUN_RECOVERY_KEY) {
        stored = nextValue;
      }
    },
    removeItem: (key) => {
      if (key === ACTIVE_RUN_RECOVERY_KEY) {
        stored = null;
      }
    }
  };
}

describe("active Run recovery storage scrub", () => {
  it("removes recovery without loading the optional recovery controller", () => {
    const storage = createStorage();

    expect(scrubActiveRunRecovery(storage)).toBe(true);
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it("overwrites sensitive content when deletion is denied", () => {
    const storage = {
      ...createStorage(),
      removeItem: () => {
        throw new DOMException("Denied.", "SecurityError");
      }
    };

    expect(scrubActiveRunRecovery(storage)).toBe(true);
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBe("");
  });

  it("reports failure only when neither deletion nor overwrite can scrub", () => {
    const storage = {
      getItem: () => "sensitive-challenge",
      setItem: () => {
        throw new DOMException("Denied.", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("Denied.", "SecurityError");
      }
    };

    expect(scrubActiveRunRecovery(storage)).toBe(false);
  });
});
