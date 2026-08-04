import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isQuestIIQuestId,
  questIdentityMatches
} from "../shared/quest-identity.js";

const root = fileURLToPath(new URL("../", import.meta.url));

const QUEST_I = "quest_abc1234def";
const QUEST_I_OTHER = "quest_zzz9999yyy";
const QUEST_II = "quest_ii_abc1234def";
const QUEST_II_OTHER = "quest_ii_zzz9999yyy";

/**
 * The reconciliation, pinned before the seven copies were deleted. Every one
 * of them agreed on these; the point of writing them down is that any future
 * change to the surviving copy has to be a decision about all three
 * boundaries at once — receipt binding, Active Run Recovery, and Run Access —
 * rather than a change to whichever file someone happened to open.
 */
describe("questIdentityMatches", () => {
  it("matches a Quest against itself", () => {
    expect(questIdentityMatches(QUEST_I, QUEST_I)).toBe(true);
    expect(questIdentityMatches(QUEST_II, QUEST_II)).toBe(true);
  });

  it("refuses two different Quests", () => {
    expect(questIdentityMatches(QUEST_I, QUEST_I_OTHER)).toBe(false);
    expect(questIdentityMatches(QUEST_II, QUEST_II_OTHER)).toBe(false);
    expect(questIdentityMatches(QUEST_I, QUEST_II)).toBe(false);
    expect(questIdentityMatches(QUEST_II, QUEST_I)).toBe(false);
  });

  it("lets a record written before Quest IDs existed match a Quest I Quest", () => {
    // This is what carries an in-progress Run across the upgrade.
    expect(questIdentityMatches(undefined, QUEST_I)).toBe(true);
    expect(questIdentityMatches(QUEST_I, undefined)).toBe(true);
  });

  it("never lets an absent identity match a Quest II Quest", () => {
    // Quest II has no pre-identity history, so an absent side here is
    // unexplained. Binding a receipt or a recovered Run to the wrong Quest is
    // worse than refusing.
    expect(questIdentityMatches(undefined, QUEST_II)).toBe(false);
    expect(questIdentityMatches(QUEST_II, undefined)).toBe(false);
  });

  it("matches when neither side names a Quest", () => {
    expect(questIdentityMatches(undefined, undefined)).toBe(true);
  });

  it("treats null as a value, not as absence", () => {
    // `null` is a stored value that says "no Quest"; `undefined` is a field
    // that was never written. Only the latter is the upgrade path.
    expect(questIdentityMatches(null, null)).toBe(true);
    expect(questIdentityMatches(null, QUEST_I)).toBe(false);
    expect(questIdentityMatches(null, undefined)).toBe(true);
    expect(questIdentityMatches(undefined, null)).toBe(true);
  });

  it("reads a non-string as Quest I rather than throwing", () => {
    for (const value of [null, 0, false, {}, []]) {
      expect(isQuestIIQuestId(value)).toBe(false);
      expect(questIdentityMatches(undefined, value)).toBe(true);
    }
  });

  it("is case-insensitive about the Quest II prefix, as the writer is", () => {
    expect(isQuestIIQuestId("QUEST_II_ABC1234DEF")).toBe(true);
    expect(questIdentityMatches(undefined, "QUEST_II_ABC1234DEF")).toBe(false);
  });

  it("is symmetric", () => {
    const values = [QUEST_I, QUEST_II, undefined, null, "quest_ii_", 7];
    for (const left of values) {
      for (const right of values) {
        expect(questIdentityMatches(left, right)).toBe(
          questIdentityMatches(right, left)
        );
      }
    }
  });
});

describe("Q-64 — one copy, not seven", () => {
  it("leaves no other definition anywhere", () => {
    /** @type {string[]} */
    const definitions = [];
    for (const relative of globSync(
      ["src/**/*.js", "server/**/*.js", "shared/**/*.js", "api/**/*.js"],
      { cwd: root }
    )) {
      const normalized = relative.replaceAll("\\", "/");
      if (normalized === "shared/quest-identity.js") continue;
      const source = readFileSync(root + relative, "utf8");
      if (/function questIdentityMatches\b/.test(source)) {
        definitions.push(normalized);
      }
      if (/function isQuestIIQuestId\b/.test(source)) {
        definitions.push(`${normalized} (isQuestIIQuestId)`);
      }
    }
    expect(definitions).toEqual([]);
  });

  it("is imported by every boundary that compares Quest identity", () => {
    for (const relative of [
      "shared/offline-receipt.js",
      "server/offline-receipt-route.js",
      "src/game/active-run-recovery.js",
      "src/game/offline-continuity-client.js",
      "src/game/offline-continuity-controller.js",
      "src/game/offline-continuity-runtime.js",
      "src/game/run-access.js"
    ]) {
      expect(readFileSync(root + relative, "utf8")).toContain(
        "quest-identity.js"
      );
    }
  });
});
