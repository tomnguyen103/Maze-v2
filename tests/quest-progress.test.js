import { describe, expect, it } from "vitest";
import {
  advanceQuest,
  createQuestProgress,
  loadQuestProgress,
  normalizeQuestProgress,
  rememberMap,
  rememberQuestion,
  saveQuestProgress
} from "../src/game/quest-progress.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";

const DECKS = Object.fromEntries(
  getPublishedLearningDeckOptions().map((deck) => [deck.deckId, deck])
);

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
    expect(createQuestProgress("maze-master", 1, "quest_test_master")).toEqual({
      version: 2,
      questId: "quest_test_master",
      levelId: "maze-master",
      learningDeckId: "mixed-trail",
      learningDeckRevision: DECKS["mixed-trail"].revisionId,
      labyrinthNumber: 1,
      completedLabyrinths: 0,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    });
  });

  it("locks one exact published Learning Deck into a new Quest", () => {
    const numberTrail = DECKS["number-trail"];
    const progress = createQuestProgress(
      "trail-scout",
      1,
      "quest_number_trail",
      numberTrail
    );
    const advanced = rememberQuestion(
      advanceQuest(progress),
      "scout-developing-8"
    );

    expect(progress).toMatchObject({
      version: 2,
      learningDeckId: "number-trail",
      learningDeckRevision: numberTrail.revisionId
    });
    expect(advanced).toMatchObject({
      learningDeckId: progress.learningDeckId,
      learningDeckRevision: progress.learningDeckRevision
    });
  });

  it("gives each intentionally started Quest a distinct opaque Quest ID", () => {
    const first = createQuestProgress("trail-scout");
    const second = createQuestProgress("trail-scout");

    expect(first.questId).toMatch(/^quest_[a-z0-9-]+$/i);
    expect(second.questId).not.toBe(first.questId);
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

  it("ignores malformed stored Quest Progress", () => {
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
  });

  it("migrates compatible legacy progress to one stable derived Quest ID", () => {
    const storage = createStorage();
    storage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 3,
        completedLabyrinths: 2,
        usedMapFingerprints: ["legacy-map"],
        usedQuestionIds: ["legacy-question"],
        nextQuestionOrdinal: 1,
        complete: false
      })
    );

    const first = loadQuestProgress(storage);
    const second = loadQuestProgress(storage);

    expect(first?.questId).toMatch(/^legacy_[a-z0-9]+$/);
    expect(second?.questId).toBe(first?.questId);
    expect(first).toMatchObject({
      version: 2,
      learningDeckId: "mixed-trail",
      learningDeckRevision: DECKS["mixed-trail"].revisionId,
      labyrinthNumber: 3,
      completedLabyrinths: 2,
      usedMapFingerprints: ["legacy-map"],
      usedQuestionIds: ["legacy-question"],
      nextQuestionOrdinal: 1
    });
  });

  it("rejects unpublished or mismatched version-2 Deck identities", () => {
    const valid = createQuestProgress(
      "bright-start",
      2,
      "quest_exact_deck"
    );

    expect(normalizeQuestProgress({
      ...valid,
      learningDeckId: "draft-trail"
    })).toBeNull();
    expect(normalizeQuestProgress({
      ...valid,
      learningDeckRevision: DECKS["number-trail"].revisionId
    })).toBeNull();
  });

  it("restores completed Quest Progress until a new Quest is started", () => {
    const storage = createStorage();
    const completed = {
      ...createQuestProgress("trail-scout"),
      labyrinthNumber: 20,
      completedLabyrinths: 20,
      complete: true
    };

    saveQuestProgress(completed, storage);

    expect(loadQuestProgress(storage)).toEqual(completed);
  });
});
