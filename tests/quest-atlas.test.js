import { describe, expect, it } from "vitest";
import { projectQuestAtlas } from "../src/game/quest-atlas.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";

describe("Echo Atlas projection", () => {
  it("projects five regions and twenty non-color-only node states", () => {
    const progress = createQuestProgress("trail-scout");
    const atlas = projectQuestAtlas(progress);

    expect(atlas.regions).toHaveLength(5);
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
