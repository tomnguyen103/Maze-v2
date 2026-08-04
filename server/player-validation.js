import {
  QUEST_LEVELS,
  getLabyrinthConfig
} from "../src/questions/quest-levels.js";
import {
  normalizeKnownRunRuleset,
  normalizeRunRuleset
} from "../src/game/run-ruleset.js";

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
 * Stems that cannot appear inside an ordinary name, matched anywhere after
 * confusables are resolved and spacing and punctuation are folded away.
 */
const SCREENED_SUBSTRINGS = Object.freeze([
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "bastard",
  "wanker",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "hitler",
  "porn",
  "boobs",
  "penis",
  "vagina",
  "killyourself",
  "echomazestaff"
]);

/**
 * Words that are only a problem on their own. `rape` is inside Draper and
 * Grape, `nazi` is inside Nazir, `admin` is inside Administrator, `kys` is
 * inside Kysia. A screen that rejects a child's actual name is worse than one
 * that misses a case: it teaches them to work around it, and it is the kind
 * of mistake nobody reports.
 */
const SCREENED_WORDS = Object.freeze([
  "rape",
  "nazi",
  "kkk",
  "sexy",
  "kys",
  "suicide",
  "admin",
  "moderator",
  "staff"
]);

/**
 * Characters that look Latin and are not. One of these used to defeat the
 * screen entirely, because folding to `[a-z0-9]` deleted them rather than
 * resolving them.
 */
const CONFUSABLES = Object.freeze({
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p",
  с: "c", т: "t", у: "y", х: "x", ѕ: "s", і: "i", ј: "j", ԁ: "d",
  ο: "o", ρ: "p", τ: "t", ν: "v", ι: "i", κ: "k", α: "a", ε: "e"
});

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
  if (looksLikeContactDetail(username)) {
    throw new InputError(
      "Please choose a name that is not an email address, a phone number, or a link."
    );
  }
  if (containsScreenedTerm(username)) {
    throw new InputError("Please choose a different name.");
  }
  return username;
}

/**
 * A username is shown to anonymous readers on the Global Scoreboard, and the
 * Explorers choosing them are children. This is not a vulnerability and no
 * word list makes it one; it is a child-safety screen, and its job is to stop
 * the obvious cases before a person has to look.
 *
 * Deliberately small and deliberately not clever. A long list of slurs in a
 * public repository is its own problem, and leetspeak substitution catches
 * `cl4ss` more often than anything worth catching. Staff have a proportionate
 * remedy for what gets through: `POST /api/admin/username` blanks one name
 * without touching the child's account.
 *
 * @param {string} username
 */
function containsScreenedTerm(username) {
  const latin = [...username.toLowerCase().normalize("NFKD")]
    .map((character) => Reflect.get(CONFUSABLES, character) ?? character)
    .join("")
    .replace(/\p{M}/gu, "");
  const squashed = latin.replace(/[^a-z0-9]/g, "");
  if (SCREENED_SUBSTRINGS.some((term) => squashed.includes(term))) {
    return true;
  }
  // Word-wise for the ambiguous ones: digits count as part of a word so
  // `admin1` is still caught, but `Administrator` is not.
  const words = latin.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) =>
    SCREENED_WORDS.some(
      (term) => word === term || word.replace(/\d+$/, "") === term
    )
  );
}

/**
 * Contact details are the specific thing a public name must never carry: an
 * adult reading the Scoreboard must not be handed a way to reach a child off
 * the platform.
 *
 * @param {string} username
 */
function looksLikeContactDetail(username) {
  // `USERNAME_PATTERN` has already rejected `@`, `.`, `:` and `+`, so an
  // address or a URL cannot arrive here intact. What can is the shape that
  // survives that charset: a bare number long enough to dial, or a handle
  // naming the platform to find them on.
  const compact = username.replace(/[\s_-]/g, "").toLowerCase();
  return (
    /^\d{7,}$/.test(compact) ||
    /(?:snap|kik|insta|discord|telegram|whatsapp|tiktok)/.test(compact)
  );
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

  const labyrinthNumber = boundedInteger(
    input,
    "labyrinthNumber",
    1,
    20,
    "Labyrinth"
  );
  const run = {
    idempotencyKey: input.idempotencyKey,
    levelId: input.levelId,
    labyrinthNumber,
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
    escaped: true,
    ...validateScorePartition({
      atlasRegionId: input.atlasRegionId,
      rulesetRevision: input.rulesetRevision,
      labyrinthNumber
    })
  };
  if (
    !normalizeRunRuleset(
      {
        atlasRegionId: run.atlasRegionId,
        revision: run.rulesetRevision
      },
      run.labyrinthNumber
    )
  ) {
    throw new InputError(
      "Score Region and ruleset do not match the selected Labyrinth."
    );
  }
  const config = getLabyrinthConfig(run.levelId, run.labyrinthNumber);
  if (run.echoesCollected !== config.echoCount) {
    throw new InputError(
      "Echo count does not match the selected Labyrinth."
    );
  }
  if (run.wardensDefeated > config.wardenCount) {
    throw new InputError(
      "Warden count exceeds the selected Labyrinth."
    );
  }

  return { ...run, score: computeRunScore(run) };
}

/** @param {{ atlasRegionId?: unknown, rulesetRevision?: unknown, labyrinthNumber?: number }} input */
export function validateScorePartition(input) {
  const labyrinthNumber = Number(input.labyrinthNumber);
  if (
    input.atlasRegionId === undefined &&
    input.rulesetRevision === undefined &&
    Number.isInteger(labyrinthNumber)
  ) {
    const ruleset = normalizeRunRuleset(undefined, labyrinthNumber);
    if (!ruleset) {
      throw new InputError("Score Labyrinth is not supported.");
    }
    return {
      atlasRegionId: ruleset.atlasRegionId,
      rulesetRevision: ruleset.revision
    };
  }
  if (
    typeof input.atlasRegionId !== "string" ||
    typeof input.rulesetRevision !== "string"
  ) {
    throw new InputError("Score Region and ruleset are required.");
  }
  const ruleset = normalizeKnownRunRuleset({
    atlasRegionId: input.atlasRegionId,
    revision: input.rulesetRevision
  });
  if (!ruleset) {
    throw new InputError("Score Region or ruleset is not supported.");
  }
  return {
    atlasRegionId: ruleset.atlasRegionId,
    rulesetRevision: ruleset.revision
  };
}
