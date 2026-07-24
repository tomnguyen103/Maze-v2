import {
  computeRunScore,
  validateProfileInput,
  validateScoreInput
} from "../server/player-validation.js";
import { describe, expect, it } from "vitest";

describe("player validation", () => {
  it("normalizes a valid profile", () => {
    expect(
      validateProfileInput({
        username: "  Moss   Runner  ",
        explorerPalette: "sunset",
        playgroundPalette: "twilight"
      })
    ).toEqual({
      username: "Moss Runner",
      usernameKey: "moss runner",
      explorerPalette: "sunset",
      playgroundPalette: "twilight"
    });
  });

  it.each([
    ["ab", "Username"],
    ["Moss<script>", "Username"],
    ["Moss Runner", "Explorer color", "unknown", "twilight"],
    ["Moss Runner", "Playground color", "sunset", "unknown"]
  ])(
    "rejects an invalid profile value",
    (username, message, explorerPalette = "sunset", playgroundPalette = "twilight") => {
      expect(() =>
        validateProfileInput({
          username,
          explorerPalette,
          playgroundPalette
        })
      ).toThrow(message);
    }
  );

  it("validates an escaped run and computes score on the server", () => {
    const run = validateScoreInput({
      idempotencyKey: "run_01J1MOSSWATCH",
      levelId: "trail-scout",
      labyrinthNumber: 4,
      seed: "MOSS-WATCH-11",
      wardensDefeated: 2,
      echoesCollected: 3,
      moves: 81,
      elapsedMs: 92000,
      escaped: true,
      score: 999999
    });

    expect(run).toEqual({
      idempotencyKey: "run_01J1MOSSWATCH",
      levelId: "trail-scout",
      labyrinthNumber: 4,
      seed: "MOSS-WATCH-11",
      wardensDefeated: 2,
      echoesCollected: 3,
      moves: 81,
      elapsedMs: 92000,
      escaped: true,
      score: 850
    });
  });

  it("rejects unfinished and out-of-bounds runs", () => {
    const base = {
      idempotencyKey: "run_01J1MOSSWATCH",
      levelId: "trail-scout",
      labyrinthNumber: 4,
      seed: "MOSS-WATCH-11",
      wardensDefeated: 2,
      echoesCollected: 3,
      moves: 81,
      elapsedMs: 92000,
      escaped: true
    };

    expect(() => validateScoreInput({ ...base, escaped: false })).toThrow(
      "Only escaped runs"
    );
    expect(() =>
      validateScoreInput({ ...base, labyrinthNumber: 21 })
    ).toThrow("Labyrinth");
    expect(() => validateScoreInput({ ...base, moves: 0 })).toThrow("Moves");
    expect(() =>
      validateScoreInput({ ...base, echoesCollected: 20 })
    ).toThrow("Echo count");
    expect(() =>
      validateScoreInput({ ...base, wardensDefeated: 20 })
    ).toThrow("Warden count");
  });

  it("uses the documented score formula", () => {
    expect(
      computeRunScore({
        wardensDefeated: 2,
        echoesCollected: 3,
        escaped: true
      })
    ).toBe(850);
  });
});
