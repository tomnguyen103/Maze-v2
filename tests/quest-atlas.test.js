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
    expect(atlas.regions[0].nodes).toEqual([
      expect.objectContaining({
        labyrinthNumber: 1,
        state: "current",
        stateLabel: "Current Labyrinth"
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
