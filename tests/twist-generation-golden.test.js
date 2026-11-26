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
 * before windways-v2 (ADR 0053). The windways-v2 values pin the revision that
 * new Runs start on. A known revision must replay the same Labyrinth and Twist
 * placement (ADR 0002, ADR 0026).
 */
const EXPECTED = Object.freeze({
  "echo-hush-v1:bright-start": "c43a4bf23b009af3",
  "echo-hush-v1:trail-scout": "a393e23e28ac1dd2",
  "echo-hush-v1:maze-master": "9901b7d8d1c4ca1c",
  "windways-v1:bright-start": "4e2ed614533bd405",
  "windways-v1:trail-scout": "4dc8d6d54bfe0500",
  "windways-v1:maze-master": "394d60e3664617ac",
  "windways-v2:bright-start": "5cfd60aa4e87085a",
  "windways-v2:trail-scout": "f3e5178138e7df73",
  "windways-v2:maze-master": "24e3ef262a2b97a5",
  "echo-bridges-v1:bright-start": "4bbd5507848f2bf6",
  "echo-bridges-v1:trail-scout": "fa16073545301c77",
  "echo-bridges-v1:maze-master": "577f09ac202ed143",
  "tide-doors-v1:bright-start": "06a728e4328a98b3",
  "tide-doors-v1:trail-scout": "08aded5038cfbd20",
  "tide-doors-v1:maze-master": "cff4d8bf3237c53d",
  "warden-bells-v1:bright-start": "7ecc2a2ddf150edd",
  "warden-bells-v1:trail-scout": "da36453f26a5fe99",
  "warden-bells-v1:maze-master": "b796fe62bce1b952",
  "classic-v1:bright-start": "358b4452d2164d6b",
  "classic-v1:trail-scout": "14e956ebe38e612c",
  "classic-v1:maze-master": "1f0ba803633dce81"
});

/** @param {number} labyrinthNumber */
function legacyRuleset(labyrinthNumber) {
  const ruleset = getQuestRunRuleset(labyrinthNumber);
  return ruleset.atlasRegionId === "developing"
    ? normalizeKnownRunRuleset({ atlasRegionId: "developing", revision: "windways-v1" })
    : ruleset;
}

/** @param {(labyrinthNumber: number) => any} rulesetFor */
function fingerprints(rulesetFor) {
  /** @type {Record<string, import("node:crypto").Hash>} */
  const hashes = {};
  for (let labyrinthNumber = 1; labyrinthNumber <= LABYRINTH_COUNT; labyrinthNumber += 1) {
    const ruleset = rulesetFor(labyrinthNumber);
    for (const level of QUEST_LEVELS) {
      const config = getLabyrinthConfig(level.id, labyrinthNumber);
      const key = `${ruleset.revision}:${level.id}`;
      hashes[key] ??= createHash("sha256");
      for (let seedIndex = 0; seedIndex < SEEDS; seedIndex += 1) {
        const run = createRun(`GOLDEN-${level.id}-${labyrinthNumber}-${seedIndex}`, {
          ...config,
          ruleset
        });
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
  return Object.fromEntries(
    Object.entries(hashes).map(([key, hash]) => [key, hash.digest("hex").slice(0, 16)])
  );
}

export const captureFingerprints = () => ({
  ...fingerprints(getQuestRunRuleset),
  ...fingerprints(legacyRuleset),
  ...fingerprints(getClassicRunRuleset)
});

describe("US-01.4 replay exactness for known revisions", () => {
  it("keeps the Labyrinth and Twist placement of every known revision and Classic Rules", () => {
    expect(captureFingerprints()).toEqual(EXPECTED);
  });
});
