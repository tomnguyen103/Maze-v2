import { describe, expect, it } from "vitest";
import {
  QUEST_II_CONTENT_PACK_ID,
  QUEST_II_PACING_BEATS,
  createQuestId,
  getQuestContentPackId,
  getQuestIIRegions,
  getQuestIIStorylet,
  getNextQuestContentPackId
} from "../src/game/quest-content.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import { getQuestIIQuestionSet } from "../src/questions/quest-ii-question-bank.js";
import { createQuestProgress } from "../src/game/quest-progress.js";

const LEVELS = ["bright-start", "trail-scout", "maze-master"];
const QUEST_II_ID = "quest_ii_content_test_123";

describe("Quest II Living Regions content contract", () => {
  it("uses a versioned opaque Quest ID namespace without changing Quest I", () => {
    expect(getQuestContentPackId("quest_existing_123")).toBe("quest-i");
    expect(getQuestContentPackId("legacy_existing_123")).toBe("quest-i");
    expect(getQuestContentPackId(QUEST_II_ID)).toBe(QUEST_II_CONTENT_PACK_ID);
    expect(createQuestId(QUEST_II_CONTENT_PACK_ID)).toMatch(
      /^quest_ii_[a-z0-9_-]{7,92}$/i
    );
    expect(createQuestProgress("trail-scout", 1, QUEST_II_ID).questId).toBe(
      QUEST_II_ID
    );
  });

  it("starts Quest II after a completed Quest I and preserves incomplete pack identity", () => {
    expect(
      getNextQuestContentPackId({ questId: "quest_first_123", complete: true })
    ).toBe(QUEST_II_CONTENT_PACK_ID);
    expect(
      getNextQuestContentPackId({ questId: "quest_first_123", complete: false })
    ).toBe("quest-i");
    expect(
      getNextQuestContentPackId({ questId: QUEST_II_ID, complete: true })
    ).toBe(QUEST_II_CONTENT_PACK_ID);
  });

  it("defines five authored region arcs with four ordered pacing beats", () => {
    const regions = getQuestIIRegions();

    expect(regions).toHaveLength(5);
    expect(regions.map((region) => region.labyrinthNumbers)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
      [17, 18, 19, 20]
    ]);
    expect(
      regions.every((region) =>
        region.storylets.every(
          (storylet) => storylet.gameplayTie && storylet.body
        )
      )
    ).toBe(true);
    expect(
      regions.flatMap((region) => region.storylets.map((storylet) => storylet.beat))
    ).toEqual([...QUEST_II_PACING_BEATS, ...QUEST_II_PACING_BEATS, ...QUEST_II_PACING_BEATS, ...QUEST_II_PACING_BEATS, ...QUEST_II_PACING_BEATS]);
  });

  it("selects exactly one deterministic authored storylet for every Labyrinth", () => {
    const storylets = Array.from({ length: 20 }, (_, offset) =>
      getQuestIIStorylet(offset + 1)
    );

    expect(new Set(storylets.map((storylet) => storylet.id)).size).toBe(20);
    expect(storylets.map((storylet) => storylet.labyrinthNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(storylets.every((storylet) => storylet.body.length <= 240)).toBe(
      true
    );
  });

  it("provides reviewed, unique Quest II Warden cards across Levels and Labyrinths", () => {
    const questions = LEVELS.flatMap((levelId) =>
      Array.from({ length: 20 }, (_, offset) =>
        getBundledQuestion({
          questId: QUEST_II_ID,
          levelId,
          seed: "QUEST-II-COVERAGE",
          wardenId: offset % 4,
          attempt: 0,
          labyrinthNumber: offset + 1,
          questionOrdinal: offset
        })
      )
    );

    expect(questions).toHaveLength(60);
    expect(new Set(questions.map((question) => question.id)).size).toBe(60);
    expect(
      new Set(questions.map((question) => question.reviewedRevisionId)).size
    ).toBe(60);
    expect(questions.every((question) => question.id.startsWith("quest-ii-"))).toBe(
      true
    );
    expect(questions.every((question) => question.prompt.length > 20)).toBe(
      true
    );
  });

  it("escalates authored card difficulty through the existing five bands", () => {
    for (const levelId of LEVELS) {
      const ranks = [1, 5, 9, 13, 17].map((labyrinthNumber) =>
        getBundledQuestion({
          questId: QUEST_II_ID,
          levelId,
          seed: "QUEST-II-BANDS",
          wardenId: 0,
          labyrinthNumber,
          questionOrdinal: labyrinthNumber - 1
        }).difficultyRank
      );

      expect(ranks).toEqual([...
        ranks
      ].sort((a, b) => a - b));
      expect(new Set(ranks).size).toBe(5);
    }
  });

  it("includes one reviewed Gate Warden capstone for every region and Level", () => {
    for (const levelId of LEVELS) {
      const set = getQuestIIQuestionSet(levelId);
      const capstones = set.filter((question) =>
        question.id.startsWith("quest-ii-capstone-")
      );

      expect(set).toHaveLength(25);
      expect(capstones).toHaveLength(5);
      expect(
        capstones.every((question) => question.reviewedRevisionId)
      ).toBe(true);
      expect(new Set(capstones.map((question) => question.id)).size).toBe(5);
    }
  });
});
