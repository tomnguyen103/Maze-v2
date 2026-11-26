import { describe, expect, it } from "vitest";
import {
  CLASSIC_RULESET_REVISION,
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeKnownRunRuleset,
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
        revision: "windways-v2",
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

  it("starts new Developing runs on windways-v2 (ADR 0053)", () => {
    expect(getQuestRunRuleset(5).revision).toBe("windways-v2");
  });

  it("keeps windways-v1 known for replay and recovery (ADR 0053)", () => {
    expect(
      normalizeRunRuleset(
        { atlasRegionId: "developing", revision: "windways-v1" },
        5
      )
    ).toEqual({
      atlasRegionId: "developing",
      revision: "windways-v1",
      label: "Windways"
    });
    expect(
      normalizeKnownRunRuleset({
        atlasRegionId: "developing",
        revision: "windways-v1"
      })?.revision
    ).toBe("windways-v1");
  });

  it("rejects a Windways revision outside its Region or not yet defined", () => {
    expect(
      normalizeRunRuleset(
        { atlasRegionId: "foundation", revision: "windways-v2" },
        1
      )
    ).toBeNull();
    expect(
      normalizeKnownRunRuleset({
        atlasRegionId: "developing",
        revision: "windways-v3"
      })
    ).toBeNull();
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
