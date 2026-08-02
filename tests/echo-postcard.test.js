import { describe, expect, it } from "vitest";
import {
  ECHO_POSTCARD_VERSION,
  createEchoPostcard,
  createEchoPostcardUrl,
  parseEchoPostcard
} from "../src/game/echo-postcard.js";

const POSTCARD_INPUT = {
  seed: "MOSS-VAULT-17",
  levelId: "trail-scout",
  labyrinthNumber: 9,
  ruleset: {
    atlasRegionId: "capable",
    revision: "echo-bridges-v1"
  }
};

describe("Echo Postcard contract", () => {
  it("creates a stable seed-only URL with the exact deterministic ruleset", () => {
    const url = new URL(
      createEchoPostcardUrl({
        origin: "https://echo-maze.test",
        ...POSTCARD_INPUT
      })
    );

    expect(url.pathname).toBe("/play");
    expect(url.search).toBe(
      "?postcard=1&seed=MOSS-VAULT-17&level=trail-scout&labyrinth=9&region=capable&rules=echo-bridges-v1"
    );
    expect(parseEchoPostcard(url)).toEqual({
      version: ECHO_POSTCARD_VERSION,
      seed: "MOSS-VAULT-17",
      levelId: "trail-scout",
      labyrinthNumber: 9,
      atlasRegionId: "capable",
      rulesetRevision: "echo-bridges-v1"
    });
  });

  it("keeps only the invitation contract and never exposes personal or replay fields", () => {
    const postcard = createEchoPostcard(POSTCARD_INPUT);

    expect(Object.keys(postcard).sort()).toEqual([
      "atlasRegionId",
      "labyrinthNumber",
      "levelId",
      "rulesetRevision",
      "seed",
      "version"
    ]);
    expect(JSON.stringify(postcard)).not.toMatch(
      /identity|profile|score|route|action|answer|prompt|timestamp|runId|replay|token|user/i
    );
  });

  it("accepts Classic Rules when its Atlas Region matches the Labyrinth", () => {
    expect(
      parseEchoPostcard(
        "https://echo-maze.test/play?postcard=1&seed=ASH-KEEP-04&level=bright-start&labyrinth=4&region=foundation&rules=classic-v1"
      )
    ).toEqual({
      version: ECHO_POSTCARD_VERSION,
      seed: "ASH-KEEP-04",
      levelId: "bright-start",
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      rulesetRevision: "classic-v1"
    });
  });

  it("returns null for missing or mismatched Postcard fields", () => {
    const valid =
      "https://echo-maze.test/play?postcard=1&seed=ASH-KEEP-04&level=bright-start&labyrinth=4&region=foundation&rules=echo-hush-v1";
    expect(parseEchoPostcard(valid.replace("postcard=1&", ""))).toBeNull();
    expect(parseEchoPostcard(valid.replace("postcard=1", "postcard=2"))).toBeNull();
    expect(parseEchoPostcard(valid.replace("region=foundation", "region=capable"))).toBeNull();
    expect(parseEchoPostcard(valid.replace("labyrinth=4", "labyrinth=21"))).toBeNull();
    expect(parseEchoPostcard(valid.replace("seed=ASH-KEEP-04", "seed=not safe"))).toBeNull();
  });

  it("ignores unrelated query data without copying it into the parsed contract", () => {
    const parsed = parseEchoPostcard(
      "https://echo-maze.test/play?postcard=1&seed=MOSS-VAULT-17&level=trail-scout&labyrinth=9&region=capable&rules=echo-bridges-v1&score=500&userId=user_1&route=secret"
    );

    expect(parsed).toEqual({
      version: ECHO_POSTCARD_VERSION,
      seed: "MOSS-VAULT-17",
      levelId: "trail-scout",
      labyrinthNumber: 9,
      atlasRegionId: "capable",
      rulesetRevision: "echo-bridges-v1"
    });
    expect(Object.keys(parsed ?? {})).not.toEqual(
      expect.arrayContaining(["score", "userId", "route"])
    );
  });

  it("rejects invalid values when creating a Postcard", () => {
    expect(() =>
      createEchoPostcard({
        ...POSTCARD_INPUT,
        seed: "not safe"
      })
    ).toThrow("Echo Postcard seed is invalid.");
    expect(() =>
      createEchoPostcard({
        ...POSTCARD_INPUT,
        labyrinthNumber: 8
      })
    ).toThrow("Echo Postcard ruleset is invalid.");
  });
});
