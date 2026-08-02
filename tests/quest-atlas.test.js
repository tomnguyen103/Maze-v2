import { describe, expect, it } from "vitest";
import { projectQuestAtlas } from "../src/game/quest-atlas.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";
import {
  addEchoFossil,
  createEchoFossil,
  createFossilCollection
} from "../src/game/quest-fossils.js";
import { getRegionTheme } from "../src/game/region-theme.js";
import { getQuestIIRegions } from "../src/game/quest-content.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";

const NUMBER_TRAIL = getPublishedLearningDeckOptions().find(
  ({ deckId }) => deckId === "number-trail"
);

describe("Echo Atlas projection", () => {
  it("does not project fossil memories from another Quest", () => {
    const progress = createQuestProgress(
      "trail-scout",
      5,
      "quest_current_atlas"
    );
    const otherQuestFossil = createEchoFossil({
      questId: "quest_other_atlas",
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      outcome: "escaped",
      fossilId: "fossil_00000000-0000-4000-8000-000000000102"
    });
    const otherQuestCollection = addEchoFossil(
      createFossilCollection("quest_other_atlas"),
      otherQuestFossil
    );

    const atlas = projectQuestAtlas(progress, {
      fossilCollection: otherQuestCollection
    });

    expect(atlas.fossilCount).toBe(0);
    expect(atlas.regions[0].nodes[3].fossils).toEqual([]);
  });

  it("projects five regions and twenty non-color-only node states", () => {
    const progress = createQuestProgress("trail-scout");
    const atlas = projectQuestAtlas(progress);

    expect(atlas.regions).toHaveLength(5);
    expect(atlas).toMatchObject({
      learningDeckId: "mixed-trail",
      learningDeckLabel: "Mixed Trail"
    });
    expect(atlas.regions.flatMap((region) => region.nodes)).toHaveLength(20);
    expect(atlas.regions.map((region) => region.label)).toEqual([
      "Foundation",
      "Developing",
      "Capable",
      "Advanced",
      "Mastery"
    ]);
    expect(atlas.nextMilestoneNumber).toBe(4);
    expect(atlas.labyrinthsToNextMilestone).toBe(3);
    expect(atlas.regions[0].sigilLabel).toBe(
      "First Echo Sigil restores at Labyrinth 4"
    );
    expect(atlas.regions[1]).toMatchObject({
      id: "developing",
      themeName: "Windcall Ridge",
      wardenGuild: "Kitewatch Guild",
      motif: "Rising wind and bright trail ribbons",
      sigilLabel: "Rising Wind Sigil restores at Labyrinth 8"
    });
    expect(atlas.regions[1].nodes[0].fieldNote).toContain(
      "Windway source"
    );
    expect(atlas.regions[2]).toMatchObject({
      id: "capable",
      themeName: "Sunspan Crossing",
      wardenGuild: "Spanwatch Guild",
      motif: "Joined arches and clear blue spans",
      sigilLabel: "Joined Path Sigil restores at Labyrinth 12"
    });
    expect(atlas.regions[2].nodes[0].fieldNote).toContain(
      "sealed Echo Bridge"
    );
    expect(atlas.regions[3]).toMatchObject({
      id: "advanced",
      themeName: "Tideglass Reach",
      wardenGuild: "Currentwatch Guild",
      motif: "Sea-glass channels and alternating tide marks",
      sigilLabel: "Turning Tide Sigil restores at Labyrinth 16"
    });
    expect(atlas.regions[3].nodes[0].fieldNote).toContain(
      "Visible Tide Doors"
    );
    expect(atlas.regions[4]).toMatchObject({
      id: "mastery",
      themeName: "Bellroot Summit",
      wardenGuild: "Chimewatch Guild",
      motif: "Beacon bells and resonant stone",
      sigilLabel: "Last Light Sigil restores at Labyrinth 20"
    });
    expect(atlas.regions[4].nodes[0].fieldNote).toContain("Signal Bells");
    expect(atlas.regions[0].nodes).toEqual([
      expect.objectContaining({
        id: "foundation-1",
        labyrinthNumber: 1,
        state: "current",
        stateLabel: "Current Labyrinth",
        difficultyBand: "Foundation",
        fieldNote: expect.any(String),
        learningFocus: expect.stringContaining("multiplication")
      }),
      expect.objectContaining({
        labyrinthNumber: 2,
        state: "ahead",
        stateLabel: "Ahead"
      }),
      expect.objectContaining({
        labyrinthNumber: 3,
        state: "ahead",
        stateLabel: "Ahead"
      }),
      expect.objectContaining({
        labyrinthNumber: 4,
        milestone: true,
        state: "milestone",
        stateLabel: "Gate Warden milestone ahead"
      })
    ]);
    expect(
      atlas.regions.flatMap((region) => region.nodes)
        .map((node) => node.id)
    ).toEqual([
      "foundation-1",
      "foundation-2",
      "foundation-3",
      "foundation-4",
      "developing-5",
      "developing-6",
      "developing-7",
      "developing-8",
      "capable-9",
      "capable-10",
      "capable-11",
      "capable-12",
      "advanced-13",
      "advanced-14",
      "advanced-15",
      "advanced-16",
      "mastery-17",
      "mastery-18",
      "mastery-19",
      "mastery-20"
    ]);
    expect(
      atlas.regions.flatMap((region) => region.nodes)
        .every((node) => node.fieldNote.length > 0)
    ).toBe(true);
  });

  it("projects Quest II arcs and semantic storylets into every Atlas node", () => {
    const atlas = projectQuestAtlas(
      createQuestProgress("trail-scout", 6, "quest_ii_atlas_contract")
    );

    expect(atlas).toMatchObject({
      contentPackId: "quest-ii",
      contentPackLabel: "Quest II · Living Regions"
    });
    expect(atlas.regions[1]).toMatchObject({
      arcName: "Windthread Steps",
      learningMove: "Compare movement choices",
      trailTwistRevision: "windways-v1"
    });
    expect(atlas.regions[1].nodes[1]).toMatchObject({
      labyrinthNumber: 6,
      fieldNote: expect.stringContaining("Windway can carry"),
      storylet: {
        id: "quest-ii-developing-6",
        beat: "variation",
        title: "A longer step",
        gameplayTie: "windways-v1:windway-used"
      }
    });
    const questIIRegions = getQuestIIRegions();
    expect(atlas.regions.map((region) => region.motif)).toEqual(
      questIIRegions.map((region) => region.motif)
    );
    expect(atlas.regions.map((region) => getRegionTheme(region.id)?.motif)).toEqual(
      questIIRegions.map((region) => region.motif)
    );
    expect(
      atlas.regions.flatMap((region) => region.nodes)
        .every((node) => node.storylet?.id)
    ).toBe(true);
  });

  it("projects the selected immutable Learning Deck without changing Region rules", () => {
    if (!NUMBER_TRAIL) {
      throw new Error("Published Number Trail fixture is missing.");
    }
    const atlas = projectQuestAtlas(
      createQuestProgress(
        "trail-scout",
        9,
        "quest_number_atlas",
        NUMBER_TRAIL
      )
    );

    expect(atlas).toMatchObject({
      learningDeckId: "number-trail",
      learningDeckRevision: NUMBER_TRAIL.revisionId,
      learningDeckLabel: "Number Trail",
      currentLabyrinthNumber: 9
    });
    expect(atlas.regions[2].id).toBe("capable");
  });

  it("derives restored sigils and current milestones without mutating progress", () => {
    const progress = advanceQuest(
      advanceQuest(
        advanceQuest(createQuestProgress("bright-start"))
      )
    );
    const before = structuredClone(progress);
    const atlas = projectQuestAtlas(progress);

    expect(atlas.currentLabyrinthNumber).toBe(4);
    expect(atlas.nextMilestoneNumber).toBe(4);
    expect(atlas.labyrinthsToNextMilestone).toBe(0);
    expect(atlas.restoredSigils).toBe(0);
    expect(atlas.regions[0].nodes[3]).toMatchObject({
      current: true,
      milestone: true,
      state: "milestone",
      stateLabel: "Current Gate Warden milestone"
    });
    expect(progress).toEqual(before);
  });

  it("restores one cosmetic sigil after each completed milestone", () => {
    const atlas = projectQuestAtlas(
      createQuestProgress("maze-master", 5)
    );

    expect(atlas.restoredSigils).toBe(1);
    expect(atlas.regions[0].sigilRestored).toBe(true);
    expect(atlas.regions[0].nodes[3]).toMatchObject({
      state: "completed-milestone",
      stateLabel: "Gate Warden milestone completed"
    });
    expect(atlas.regions[1].nodes[0]).toMatchObject({
      state: "current",
      labyrinthNumber: 5
    });
  });

  it("derives Watch Trail capability only from approved retained memory", () => {
    const progress = createQuestProgress("maze-master", 5);
    const atlas = projectQuestAtlas(progress, {
      watchTrailLandmarkIds: new Set(["foundation-3", "developing-5"])
    });

    expect(atlas.regions[0].nodes[2]).toMatchObject({
      id: "foundation-3",
      completed: true,
      watchTrailAvailable: true
    });
    expect(atlas.regions[1].nodes[0]).toMatchObject({
      id: "developing-5",
      current: true,
      watchTrailAvailable: false
    });
  });

  it("projects the final current milestone and a completed Quest", () => {
    const finalAtlas = projectQuestAtlas(
      createQuestProgress("trail-scout", 20)
    );
    expect(finalAtlas.regions[4].nodes[3]).toMatchObject({
      current: true,
      milestone: true,
      state: "milestone"
    });

    const completedAtlas = projectQuestAtlas({
      ...createQuestProgress("trail-scout", 20),
      completedLabyrinths: 20,
      complete: true
    });
    expect(completedAtlas.complete).toBe(true);
    expect(completedAtlas.restoredSigils).toBe(5);
    expect(completedAtlas.nextMilestoneNumber).toBeNull();
    expect(completedAtlas.labyrinthsToNextMilestone).toBeNull();
    expect(
      completedAtlas.regions.flatMap((region) => region.nodes)
        .filter((node) => node.state === "completed-milestone")
    ).toHaveLength(5);
    expect(
      completedAtlas.regions.flatMap((region) => region.nodes)
        .some((node) => node.state === "current")
    ).toBe(false);
  });
});
