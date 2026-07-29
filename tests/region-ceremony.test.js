import { describe, expect, it } from "vitest";
import { claimRegionCeremony } from "../src/game/region-ceremony.js";

/**
 * @returns {{
 *   getItem(key: string): string | null,
 *   setItem(key: string, value: string): void
 * }}
 */
function createMemoryStorage() {
  const values = new Map();
  return {
    /** @param {string} key */
    getItem(key) {
      return values.get(key) ?? null;
    },
    /** @param {string} key @param {string} value */
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

describe("Region Sigil ceremony presentation", () => {
  it("uses the full form once per Region in an active Quest", () => {
    const storage = createMemoryStorage();

    expect(claimRegionCeremony("quest_one", "foundation", storage)).toBe(
      "full"
    );
    expect(claimRegionCeremony("quest_one", "foundation", storage)).toBe(
      "compact"
    );
    expect(claimRegionCeremony("quest_one", "developing", storage)).toBe(
      "full"
    );
    expect(claimRegionCeremony("quest_two", "foundation", storage)).toBe(
      "full"
    );
  });

  it("fails open to the full presentation without changing game state", () => {
    const storage = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      }
    };
    const quest = Object.freeze({ questId: "quest_safe", labyrinthNumber: 5 });

    expect(claimRegionCeremony(quest.questId, "foundation", storage)).toBe(
      "full"
    );
    expect(quest).toEqual({
      questId: "quest_safe",
      labyrinthNumber: 5
    });
  });
});
