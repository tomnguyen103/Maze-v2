import { describe, expect, it } from "vitest";
import {
  advanceQuest,
  createQuestProgress,
  loadQuestProgress,
  rememberMap,
  rememberQuestion,
  saveQuestProgress
} from "../src/game/quest-progress.js";

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

describe("Quest Progress", () => {
  it("starts a twenty-Labyrinth Quest at the selected Quest Level", () => {
    expect(createQuestProgress("maze-master")).toEqual({
      version: 1,
      levelId: "maze-master",
      labyrinthNumber: 1,
      completedLabyrinths: 0,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    });
  });

  it("remembers every generated map and rejects Quest repeats", () => {
    const progress = rememberMap(
      createQuestProgress("trail-scout"),
      "111/101/111"
    );

    expect(progress.usedMapFingerprints).toEqual(["111/101/111"]);
    expect(() => rememberMap(progress, "111/101/111")).toThrow(/repeat/i);
  });

  it("advances after escape and marks Labyrinth 20 complete", () => {
    const firstWin = advanceQuest(createQuestProgress("trail-scout"));
    expect(firstWin).toMatchObject({
      labyrinthNumber: 2,
      completedLabyrinths: 1,
      complete: false
    });

    const finalWin = advanceQuest({
      ...firstWin,
      labyrinthNumber: 20,
      completedLabyrinths: 19
    });
    expect(finalWin).toMatchObject({
      labyrinthNumber: 20,
      completedLabyrinths: 20,
      complete: true
    });
  });

  it("remembers each accepted Question and rejects repetition", () => {
    const progress = rememberQuestion(
      createQuestProgress("bright-start"),
      "bright-foundation-0"
    );

    expect(progress.usedQuestionIds).toEqual(["bright-foundation-0"]);
    expect(progress.nextQuestionOrdinal).toBe(1);
    expect(() =>
      rememberQuestion(progress, "bright-foundation-0")
    ).toThrow(/repeat/i);
  });

  it("advances past the accepted Question ordinal", () => {
    const progress = rememberQuestion(
      createQuestProgress("trail-scout"),
      "scout-foundation-7",
      7
    );

    expect(progress.usedQuestionIds).toEqual(["scout-foundation-7"]);
    expect(progress.nextQuestionOrdinal).toBe(8);
  });

  it("persists and restores active Quest Progress defensively", () => {
    const storage = createStorage();
    const progress = rememberQuestion(
      advanceQuest(createQuestProgress("maze-master")),
      "master-developing-0"
    );

    saveQuestProgress(progress, storage);
    const restored = loadQuestProgress(storage);

    expect(restored).toEqual(progress);
    restored?.usedQuestionIds.push("mutated");
    expect(loadQuestProgress(storage)?.usedQuestionIds).toEqual([
      "master-developing-0"
    ]);
  });

  it("ignores malformed or completed stored Quest Progress", () => {
    const storage = createStorage();
    storage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 21,
        completedLabyrinths: 20,
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: false
      })
    );
    expect(loadQuestProgress(storage)).toBeNull();

    saveQuestProgress(
      {
        ...createQuestProgress("trail-scout"),
        labyrinthNumber: 20,
        completedLabyrinths: 20,
        complete: true
      },
      storage
    );
    expect(loadQuestProgress(storage)).toBeNull();
  });
});
