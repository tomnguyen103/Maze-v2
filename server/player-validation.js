import { QUEST_LEVELS } from "../src/questions/quest-levels.js";

/** @type {Set<string>} */
const LEVEL_IDS = new Set(QUEST_LEVELS.map((level) => level.id));
const EXPLORER_PALETTES = new Set(["teal", "sunset", "violet", "gold"]);
const PLAYGROUND_PALETTES = new Set([
  "daylight",
  "twilight",
  "sea-glass",
  "dusk"
]);
const USERNAME_PATTERN = /^[\p{L}\p{N} _-]+$/u;
const SEED_PATTERN = /^[a-z0-9-]{1,32}$/i;
const IDEMPOTENCY_PATTERN = /^[a-z0-9_-]{12,128}$/i;

export class InputError extends Error {}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Request body must be a JSON object.");
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {Record<string, unknown>} input
 * @param {string} name
 * @param {number} minimum
 * @param {number} maximum
 * @param {string} [label]
 */
function boundedInteger(input, name, minimum, maximum, label = name) {
  const value = input[name];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new InputError(
      `${label} must be a whole number from ${minimum} to ${maximum}.`
    );
  }
  return value;
}

/** @param {unknown} value */
function normalizedUsername(value) {
  if (typeof value !== "string") {
    throw new InputError("Username is required.");
  }
  const username = value.trim().replace(/\s+/g, " ");
  if (
    username.length < 3 ||
    username.length > 20 ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw new InputError(
      "Username must be 3–20 letters, numbers, spaces, underscores, or hyphens."
    );
  }
  return username;
}

/** @param {unknown} value */
export function validateProfileInput(value) {
  const input = objectInput(value);
  const username = normalizedUsername(input.username);
  if (
    typeof input.explorerPalette !== "string" ||
    !EXPLORER_PALETTES.has(input.explorerPalette)
  ) {
    throw new InputError("Explorer color is not supported.");
  }
  if (
    typeof input.playgroundPalette !== "string" ||
    !PLAYGROUND_PALETTES.has(input.playgroundPalette)
  ) {
    throw new InputError("Playground color is not supported.");
  }
  return {
    username,
    usernameKey: username.toLocaleLowerCase("en-US"),
    explorerPalette: input.explorerPalette,
    playgroundPalette: input.playgroundPalette
  };
}

/**
 * @param {{
 *   wardensDefeated: number,
 *   echoesCollected: number,
 *   escaped: boolean
 * }} run
 */
export function computeRunScore(run) {
  return (
    run.wardensDefeated * 100 +
    run.echoesCollected * 50 +
    (run.escaped ? 500 : 0)
  );
}

/** @param {unknown} value */
export function validateScoreInput(value) {
  const input = objectInput(value);
  if (
    typeof input.idempotencyKey !== "string" ||
    !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
  ) {
    throw new InputError("Run idempotency key is not valid.");
  }
  if (typeof input.levelId !== "string" || !LEVEL_IDS.has(input.levelId)) {
    throw new InputError("Quest Level is not supported.");
  }
  if (typeof input.seed !== "string" || !SEED_PATTERN.test(input.seed)) {
    throw new InputError("Run seed is not valid.");
  }
  if (input.escaped !== true) {
    throw new InputError("Only escaped runs can enter the Global Scoreboard.");
  }

  const run = {
    idempotencyKey: input.idempotencyKey,
    levelId: input.levelId,
    labyrinthNumber: boundedInteger(
      input,
      "labyrinthNumber",
      1,
      20,
      "Labyrinth"
    ),
    seed: input.seed,
    wardensDefeated: boundedInteger(
      input,
      "wardensDefeated",
      0,
      20,
      "Wardens defeated"
    ),
    echoesCollected: boundedInteger(
      input,
      "echoesCollected",
      0,
      20,
      "Echoes collected"
    ),
    moves: boundedInteger(input, "moves", 1, 100000, "Moves"),
    elapsedMs: boundedInteger(input, "elapsedMs", 0, 86400000, "Elapsed time"),
    escaped: true
  };

  return { ...run, score: computeRunScore(run) };
}
