import {
  createRunAccessId,
  runLocatorMatches,
  withRunAccessId
} from "../src/game/run-access.js";
import { describe, expect, it } from "vitest";

describe("browser Run Access identity", () => {
  it("creates an opaque bounded admission id", () => {
    expect(createRunAccessId(() => "01J1MOSS-WATCH")).toBe(
      "access_01J1MOSS-WATCH"
    );
    expect(createRunAccessId(() => "01J1MOSS-WATCH")).toMatch(
      /^[a-zA-Z0-9_-]{12,128}$/
    );
  });

  it("preserves a locator's id across reload retries", () => {
    const locator = {
      version: 2,
      runId: "access_existing",
      pending: true,
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    };

    expect(withRunAccessId(locator, () => "unused")).toEqual(locator);
  });

  it("upgrades a legacy locator without changing reconstruction facts", () => {
    expect(
      withRunAccessId(
        {
          version: 1,
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        },
        () => "01J1MOSS-WATCH"
      )
    ).toEqual({
      version: 2,
      runId: "access_01J1MOSS-WATCH",
      pending: false,
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    });
  });

  it("matches a direct-link refresh only when every Run fact is identical", () => {
    const locator = {
      version: 2,
      runId: "access_existing",
      pending: false,
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    };

    expect(runLocatorMatches(locator, {
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    })).toBe(true);
    expect(runLocatorMatches(locator, {
      seed: "DIFFERENT-SEED",
      levelId: "trail-scout",
      labyrinthNumber: 4
    })).toBe(false);
  });
});
