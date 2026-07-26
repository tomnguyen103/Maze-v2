import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_BANDS,
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  getLabyrinthConfig,
  getQuestLevel,
  isGateWardenMilestone
} from "../src/questions/quest-levels.js";

describe("Quest Level progression", () => {
  it("maps twenty Labyrinths into five four-Labyrinth Difficulty Bands", () => {
    expect(QUEST_LABYRINTH_COUNT).toBe(20);
    expect(DIFFICULTY_BANDS).toEqual([
      "foundation",
      "developing",
      "capable",
      "advanced",
      "mastery"
    ]);
    expect(getDifficultyBand(1)).toEqual({
      id: "foundation",
      index: 0,
      label: "Foundation"
    });
    expect(getDifficultyBand(4).id).toBe("foundation");
    expect(getDifficultyBand(5).id).toBe("developing");
    expect(getDifficultyBand(16).id).toBe("advanced");
    expect(getDifficultyBand(17).id).toBe("mastery");
    expect(getDifficultyBand(20).id).toBe("mastery");
  });

  it("classifies only every fourth Labyrinth as a Gate Warden milestone", () => {
    expect(
      Array.from({ length: QUEST_LABYRINTH_COUNT }, (_, index) => index + 1)
        .filter(isGateWardenMilestone)
    ).toEqual([4, 8, 12, 16, 20]);
    expect(getLabyrinthConfig("trail-scout", 4)).toMatchObject({
      gateWarden: true,
      wardenCount: 2
    });
    expect(getLabyrinthConfig("trail-scout", 5)).not.toHaveProperty(
      "gateWarden"
    );
  });

  it("scales each Quest Level through the approved Labyrinth ranges", () => {
    expect(getLabyrinthConfig("bright-start", 1)).toMatchObject({
      size: 11,
      echoCount: 2,
      wardenCount: 1
    });
    expect(getLabyrinthConfig("bright-start", 20)).toMatchObject({
      size: 15,
      echoCount: 4,
      wardenCount: 3
    });
    expect(getLabyrinthConfig("trail-scout", 1)).toMatchObject({
      size: 13,
      echoCount: 3,
      wardenCount: 2
    });
    expect(getLabyrinthConfig("trail-scout", 20)).toMatchObject({
      size: 19,
      echoCount: 6,
      wardenCount: 4
    });
    expect(getLabyrinthConfig("maze-master", 1)).toMatchObject({
      size: 15,
      echoCount: 4,
      wardenCount: 3
    });
    expect(getLabyrinthConfig("maze-master", 20)).toMatchObject({
      size: 23,
      echoCount: 8,
      wardenCount: 6
    });
  });

  it("keeps Vitality and Pulses fixed while later bands grow", () => {
    const first = getLabyrinthConfig("trail-scout", 1);
    const last = getLabyrinthConfig("trail-scout", 20);

    expect(first.vitality).toBe(3);
    expect(last.vitality).toBe(3);
    expect(first.pulses).toBe(2);
    expect(last.pulses).toBe(2);
    expect(last.size).toBeGreaterThan(first.size);
    expect(last.echoCount).toBeGreaterThan(first.echoCount);
    expect(last.wardenCount).toBeGreaterThan(first.wardenCount);
  });

  it("exposes explicit numbered Quest Level labels", () => {
    expect(getQuestLevel("bright-start").number).toBe(1);
    expect(getQuestLevel("trail-scout").number).toBe(2);
    expect(getQuestLevel("maze-master").number).toBe(3);
  });
});
