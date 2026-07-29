import { describe, expect, it } from "vitest";
import {
  CLASSIC_RULESET_REVISION,
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeRunRuleset
} from "../src/game/run-ruleset.js";

describe("Run ruleset identity", () => {
  it("maps every Atlas Region to its one fixed Trail Twist revision", () => {
    expect(
      [1, 5, 9, 13, 17].map((labyrinthNumber) =>
        getQuestRunRuleset(labyrinthNumber)
      )
    ).toEqual([
      {
        atlasRegionId: "foundation",
        revision: "echo-hush-v1",
        label: "Echo Hush"
      },
      {
        atlasRegionId: "developing",
        revision: "windways-v1",
        label: "Windways"
      },
      {
        atlasRegionId: "capable",
        revision: "echo-bridges-v1",
        label: "Echo Bridges"
      },
      {
        atlasRegionId: "advanced",
        revision: "tide-doors-v1",
        label: "Tide Doors"
      },
      {
        atlasRegionId: "mastery",
        revision: "warden-bells-v1",
        label: "Warden Bells"
      }
    ]);
  });

  it("keeps legacy data on Classic Rules in its derived Atlas Region", () => {
    expect(getClassicRunRuleset(10)).toEqual({
      atlasRegionId: "capable",
      revision: CLASSIC_RULESET_REVISION,
      label: "Classic Rules"
    });
    expect(normalizeRunRuleset(undefined, 10)).toEqual(
      getClassicRunRuleset(10)
    );
  });

  it("rejects unknown and mismatched Region revisions", () => {
    expect(
      normalizeRunRuleset(
        {
          atlasRegionId: "foundation",
          revision: "windways-v1"
        },
        1
      )
    ).toBeNull();
    expect(
      normalizeRunRuleset(
        {
          atlasRegionId: "foundation",
          revision: "unknown-v1"
        },
        1
      )
    ).toBeNull();
    expect(
      normalizeRunRuleset(
        {
          atlasRegionId: "developing",
          revision: CLASSIC_RULESET_REVISION
        },
        1
      )
    ).toBeNull();
  });
});
