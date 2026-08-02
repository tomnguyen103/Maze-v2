import { describe, expect, it } from "vitest";
import {
  ECHO_FOSSIL_VERSION,
  MAX_FOSSILS_PER_QUEST,
  addEchoFossil,
  createEchoFossil,
  createFossilCollection,
  getReviewedFossilCatalog,
  mergeEchoFossilCollections,
  normalizeEchoFossil,
  normalizeFossilCollection
} from "../src/game/quest-fossils.js";
import { projectQuestAtlas } from "../src/game/quest-atlas.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";

const QUEST_ID = "quest_fossil_spec_123";
const FOSSIL_ID = "fossil_00000000-0000-4000-8000-000000000001";

/**
 * @param {Partial<{
 *   questId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   outcome: "escaped" | "defeated",
 *   fossilId: string
 * }>} overrides
 * @returns {{
 *   questId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   outcome: "escaped" | "defeated",
 *   fossilId: string
 * }}
 */
function fossilInput(overrides = {}) {
  return {
    questId: QUEST_ID,
    labyrinthNumber: 4,
    atlasRegionId: "foundation",
    outcome: "escaped",
    fossilId: FOSSIL_ID,
    ...overrides
  };
}

describe("Echo Fossil contract", () => {
  it("creates a reviewed, coarse fossil for a terminal outcome", () => {
    const fossil = createEchoFossil(fossilInput());

    expect(fossil).toEqual({
      version: ECHO_FOSSIL_VERSION,
      fossilId: FOSSIL_ID,
      questId: QUEST_ID,
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      regionMotif: "Lantern moss and quiet stone",
      journeyState: "gate-milestone",
      wardenOutcome: "escaped-the-wardens",
      fieldNoteId: "foundation-escaped-v1",
      fieldNote: "The first Gate Warden yields to a steady trail.",
      visualStampId: "foundation-lantern-mark"
    });
  });

  it("covers every Region and terminal outcome with reviewed catalog data", () => {
    const catalog = getReviewedFossilCatalog();

    expect(catalog).toHaveLength(10);
    expect(new Set(catalog.map((entry) => entry.atlasRegionId))).toEqual(
      new Set(["foundation", "developing", "capable", "advanced", "mastery"])
    );
    expect(new Set(catalog.map((entry) => entry.outcome))).toEqual(
      new Set(["escaped", "defeated"])
    );
  });

  it("rejects altered reviewed content and forbidden player data", () => {
    const fossil = createEchoFossil(fossilInput());

    expect(normalizeEchoFossil({ ...fossil, fieldNote: "player text" }))
      .toBeNull();
    expect(normalizeEchoFossil({ ...fossil, selectedAnswerId: "answer-1" }))
      .toBeNull();
    expect(normalizeEchoFossil({ ...fossil, labyrinthNumber: 21 }))
      .toBeNull();
  });

  it("unions collections by fossil ID and keeps the collection bounded", () => {
    let collection = createFossilCollection(QUEST_ID);
    for (let index = 0; index < MAX_FOSSILS_PER_QUEST; index += 1) {
      const labyrinthNumber = (index % 20) + 1;
      collection = addEchoFossil(
        collection,
        createEchoFossil(fossilInput({
          fossilId: `fossil_00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
          labyrinthNumber,
          atlasRegionId: [
            "foundation",
            "developing",
            "capable",
            "advanced",
            "mastery"
          ][Math.floor((labyrinthNumber - 1) / 4)],
          outcome: index % 2 === 0 ? "escaped" : "defeated"
        }))
      );
    }

    expect(collection.fossils).toHaveLength(MAX_FOSSILS_PER_QUEST);
    expect(
      mergeEchoFossilCollections(collection, {
        ...collection,
        fossils: [collection.fossils[0]]
      }).fossils
    ).toHaveLength(MAX_FOSSILS_PER_QUEST);
    expect(normalizeFossilCollection(collection)).toEqual(collection);
  });

  it("adds fossil stamps only to matching completed Atlas landmarks", () => {
    const progress = advanceQuest(
      createQuestProgress("trail-scout", 4, QUEST_ID)
    );
    const fossil = createEchoFossil(fossilInput());
    const atlas = projectQuestAtlas(progress, {
      fossilCollection: addEchoFossil(
        createFossilCollection(QUEST_ID),
        fossil
      )
    });

    expect(atlas.regions[0].nodes[3].fossils).toEqual([fossil]);
    expect(atlas.regions[0].nodes[3].fossilCount).toBe(1);
    expect(atlas.regions[0].nodes[0].fossils).toEqual([]);
    expect(atlas.regions[1].nodes[0].fossils).toEqual([]);
    expect(progress.completedLabyrinths).toBe(4);
  });
});
