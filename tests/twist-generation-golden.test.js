import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/game-session.js";
import {
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeKnownRunRuleset
} from "../src/game/run-ruleset.js";
import { QUEST_LEVELS, getLabyrinthConfig } from "../src/questions/quest-levels.js";

const SEEDS = 20;
const LABYRINTH_COUNT = 20;

/**
 * Fingerprints of each known revision. The v1 and Classic values come from main
 * at a0f037b, before windways-v2 (ADR 0053). The windways-v2 values pin the
 * revision that new Runs start on. A known revision must replay the same
 * Labyrinth and Twist placement (ADR 0002, ADR 0026).
 */
const EXPECTED = Object.freeze({
  "echo-hush-v1:bright-start": "d72072aa3de4bd2f",
  "echo-hush-v1:trail-scout": "11f296d6285be550",
  "echo-hush-v1:maze-master": "12378ab35cade390",
  "windways-v1:bright-start": "9a780edf3277a7aa",
  "windways-v1:trail-scout": "8a074e258d7350ec",
  "windways-v1:maze-master": "a576ed019b30f9a0",
  "windways-v2:bright-start": "0f46a10adcce2392",
  "windways-v2:trail-scout": "85a64d095386d138",
  "windways-v2:maze-master": "ec1d692de3d67d59",
  "echo-bridges-v1:bright-start": "1ea5877f4811fe92",
  "echo-bridges-v1:trail-scout": "3e4943edec5b5d55",
  "echo-bridges-v1:maze-master": "4ecfb5a85b1b2afc",
  "tide-doors-v1:bright-start": "ca35fb15ef992e3d",
  "tide-doors-v1:trail-scout": "61fbde533a4ce0b1",
  "tide-doors-v1:maze-master": "cf6bc724e7282263",
  "warden-bells-v1:bright-start": "2b03fc4bd8fabc9c",
  "warden-bells-v1:trail-scout": "b3f07be1eb26a655",
  "warden-bells-v1:maze-master": "34db1d522032752d",
  "classic-v1:bright-start": "491cd1a0103b9153",
  "classic-v1:trail-scout": "66f118478e6bc60b",
  "classic-v1:maze-master": "41052d611dd3a868"
});

/**
 * Only the Developing Labyrinths play windways-v1. The Quest pass already covers the others.
 * @param {number} labyrinthNumber
 */
function legacyRuleset(labyrinthNumber) {
  return getQuestRunRuleset(labyrinthNumber).atlasRegionId === "developing"
    ? normalizeKnownRunRuleset({ atlasRegionId: "developing", revision: "windways-v1" })
    : null;
}

/** @param {(labyrinthNumber: number) => any} rulesetFor A null ruleset skips that Labyrinth. */
function fingerprints(rulesetFor) {
  /** @type {Record<string, import("node:crypto").Hash>} */
  const hashes = {};
  // normalizeSeed keeps 24 characters, so each sample must stay distinct after it.
  const seeds = new Set();
  let samples = 0;
  for (let labyrinthNumber = 1; labyrinthNumber <= LABYRINTH_COUNT; labyrinthNumber += 1) {
    const ruleset = rulesetFor(labyrinthNumber);
    if (!ruleset) continue;
    for (const level of QUEST_LEVELS) {
      const config = getLabyrinthConfig(level.id, labyrinthNumber);
      const key = `${ruleset.revision}:${level.id}`;
      hashes[key] ??= createHash("sha256");
      for (let seedIndex = 0; seedIndex < SEEDS; seedIndex += 1) {
        const run = createRun(`G-${level.id}-${labyrinthNumber}-${seedIndex}`, {
          ...config,
          ruleset
        });
        seeds.add(run.seed);
        samples += 1;
        hashes[key].update(
          JSON.stringify([
            run.labyrinth,
            run.echoes,
            run.wardens,
            run.gate,
            run.windways,
            run.echoBridges,
            run.tideDoors,
            run.signalBells
          ])
        );
      }
    }
  }
  expect(samples).toBeGreaterThan(0);
  expect(seeds.size).toBe(samples);
  return Object.fromEntries(
    Object.entries(hashes).map(([key, hash]) => [key, hash.digest("hex").slice(0, 16)])
  );
}

const captureFingerprints = () => ({
  ...fingerprints(getQuestRunRuleset),
  ...fingerprints(legacyRuleset),
  ...fingerprints(getClassicRunRuleset)
});

describe("US-01.4 replay exactness for known revisions", () => {
  it("keeps the Labyrinth and Twist placement of every known revision and Classic Rules", () => {
    expect(captureFingerprints()).toEqual(EXPECTED);
  });
});
