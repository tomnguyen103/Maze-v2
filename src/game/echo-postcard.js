import { QUEST_LABYRINTH_COUNT } from "../questions/quest-levels.js";
import { normalizeRunRuleset } from "./run-ruleset.js";

export const ECHO_POSTCARD_VERSION = "1";

const SEED_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const QUEST_LEVEL_IDS = new Set([
  "bright-start",
  "trail-scout",
  "maze-master"
]);

/**
 * @typedef {{
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   ruleset: { atlasRegionId: string, revision: string }
 * }} EchoPostcardInput
 * @typedef {{
 *   version: typeof ECHO_POSTCARD_VERSION,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   rulesetRevision: string
 * }} EchoPostcard
 */

/**
 * @param {EchoPostcardInput} input
 * @returns {EchoPostcard}
 */
export function createEchoPostcard({
  seed,
  levelId,
  labyrinthNumber,
  ruleset
}) {
  if (
    typeof seed !== "string" ||
    seed.length < 1 ||
    seed.length > 24 ||
    !SEED_PATTERN.test(seed)
  ) {
    throw new Error("Echo Postcard seed is invalid.");
  }
  if (typeof levelId !== "string" || !QUEST_LEVEL_IDS.has(levelId)) {
    throw new Error("Echo Postcard Quest Level is invalid.");
  }
  if (
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  ) {
    throw new Error("Echo Postcard Labyrinth is invalid.");
  }
  if (
    !ruleset ||
    typeof ruleset !== "object" ||
    typeof ruleset.atlasRegionId !== "string" ||
    typeof ruleset.revision !== "string"
  ) {
    throw new Error("Echo Postcard ruleset is invalid.");
  }
  const normalizedRuleset = normalizeRunRuleset(
    ruleset,
    labyrinthNumber
  );
  if (
    !normalizedRuleset ||
    normalizedRuleset.atlasRegionId !== ruleset.atlasRegionId ||
    normalizedRuleset.revision !== ruleset.revision
  ) {
    throw new Error("Echo Postcard ruleset is invalid.");
  }
  return Object.freeze({
    version: ECHO_POSTCARD_VERSION,
    seed,
    levelId,
    labyrinthNumber,
    atlasRegionId: normalizedRuleset.atlasRegionId,
    rulesetRevision: normalizedRuleset.revision
  });
}

/**
 * @param {EchoPostcardInput & { origin: string }} input
 */
export function createEchoPostcardUrl({ origin, ...input }) {
  const postcard = createEchoPostcard(input);
  const url = new URL("/play", origin);
  url.searchParams.set("postcard", postcard.version);
  url.searchParams.set("seed", postcard.seed);
  url.searchParams.set("level", postcard.levelId);
  url.searchParams.set("labyrinth", String(postcard.labyrinthNumber));
  url.searchParams.set("region", postcard.atlasRegionId);
  url.searchParams.set("rules", postcard.rulesetRevision);
  return url.toString();
}

/**
 * @param {string | URL} value
 * @returns {EchoPostcard | null}
 */
export function parseEchoPostcard(value) {
  let url;
  try {
    url = value instanceof URL
      ? new URL(value.href)
      : new URL(value, "https://echo-maze.invalid");
  } catch {
    return null;
  }
  if (
    url.pathname !== "/play" ||
    url.searchParams.get("postcard") !== ECHO_POSTCARD_VERSION
  ) {
    return null;
  }
  const seed = url.searchParams.get("seed");
  const levelId = url.searchParams.get("level");
  const labyrinthNumber = Number(url.searchParams.get("labyrinth"));
  const atlasRegionId = url.searchParams.get("region");
  const rulesetRevision = url.searchParams.get("rules");
  if (
    seed === null ||
    levelId === null ||
    atlasRegionId === null ||
    rulesetRevision === null
  ) {
    return null;
  }
  try {
    return createEchoPostcard({
      seed,
      levelId,
      labyrinthNumber,
      ruleset: {
        atlasRegionId,
        revision: rulesetRevision
      }
    });
  } catch {
    return null;
  }
}
