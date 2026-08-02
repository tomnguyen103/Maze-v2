import { QUEST_LABYRINTH_COUNT } from "../questions/quest-levels.js";
import { normalizeRunRuleset } from "./run-ruleset.js";

const ACTIVE_RUN_LOCATOR_KEY = "echo-maze:active-run:v1";
const QUEST_ID_PATTERN = /^(?:quest|legacy)_[A-Za-z0-9_-]{7,92}$/;

/**
 * @typedef {{
 *   version: 1 | 2 | 3,
 *   runId?: string,
 *   pending?: boolean,
 *   seed: string,
 *   levelId: "bright-start" | "trail-scout" | "maze-master",
 *   labyrinthNumber: number,
 *   atlasRegionId?: string,
 *   rulesetRevision?: string,
 *   questId?: string
 * }} ActiveRunLocator
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem?: (key: string) => unknown
 * }} StorageLike
 */

/**
 * @param {StorageLike | undefined} [storage]
 * @returns {ActiveRunLocator | null}
 */
export function loadActiveRunLocator(storage = globalThis.localStorage) {
  if (!storage) {
    return null;
  }
  try {
    const locator = normalizeLocator(
      JSON.parse(storage.getItem(ACTIVE_RUN_LOCATOR_KEY) ?? "null")
    );
    if (locator) {
      return locator;
    }
  } catch {
    // Clear invalid persistence below.
  }
  clearActiveRunLocator(storage);
  return null;
}

/**
 * @param {{ version: number, runId?: string, pending?: boolean, seed: string, levelId: string, labyrinthNumber: number, atlasRegionId?: string, rulesetRevision?: string, questId?: string }} locator
 * @param {StorageLike | undefined} [storage]
 * @returns {ActiveRunLocator}
 */
export function saveActiveRunLocator(
  locator,
  storage = globalThis.localStorage
) {
  const normalized = normalizeLocator(locator);
  if (!normalized) {
    throw new Error("Cannot save an invalid Active Run Locator.");
  }
  try {
    storage?.setItem(ACTIVE_RUN_LOCATOR_KEY, JSON.stringify(normalized));
  } catch {
    // Gameplay remains available when browser storage is unavailable.
  }
  return normalized;
}

/** @param {StorageLike | undefined} [storage] */
export function clearActiveRunLocator(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(ACTIVE_RUN_LOCATOR_KEY);
  } catch {
    // Storage failures must not block guest play.
  }
}

/** @param {unknown} value @returns {ActiveRunLocator | null} */
function normalizeLocator(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = /** @type {Partial<ActiveRunLocator>} */ (value);
  const version = Number(candidate.version);
  const labyrinthNumber = Number(candidate.labyrinthNumber);
  if (
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  ) {
    return null;
  }
  const ruleset =
    version === 3
      ? normalizeRunRuleset(
          {
            atlasRegionId: candidate.atlasRegionId,
            revision: candidate.rulesetRevision
          },
          labyrinthNumber
        )
      : null;
  if (
    ![1, 2, 3].includes(version) ||
    ((version === 2 || version === 3) &&
      (typeof candidate.runId !== "string" ||
        !/^[a-zA-Z0-9_-]{12,128}$/.test(candidate.runId) ||
        typeof candidate.pending !== "boolean")) ||
    (version === 3 && !ruleset) ||
    (candidate.questId !== undefined &&
      (typeof candidate.questId !== "string" ||
        !QUEST_ID_PATTERN.test(candidate.questId))) ||
    typeof candidate.seed !== "string" ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(candidate.seed) ||
    candidate.seed.length > 24 ||
    (candidate.levelId !== "bright-start" &&
      candidate.levelId !== "trail-scout" &&
      candidate.levelId !== "maze-master")
  ) {
    return null;
  }
  return {
    version: /** @type {1 | 2 | 3} */ (version),
    ...(version === 2 || version === 3
      ? { runId: candidate.runId, pending: candidate.pending }
      : {}),
    seed: candidate.seed,
    levelId: candidate.levelId,
    labyrinthNumber,
    ...(version === 3 && ruleset
      ? {
          atlasRegionId: ruleset.atlasRegionId,
          rulesetRevision: ruleset.revision
        }
      : {}),
    ...(typeof candidate.questId === "string"
      ? { questId: candidate.questId }
      : {})
  };
}
