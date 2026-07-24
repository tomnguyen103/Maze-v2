import { QUEST_LABYRINTH_COUNT } from "../questions/quest-levels.js";

const ACTIVE_RUN_LOCATOR_KEY = "echo-maze:active-run:v1";

/**
 * @typedef {{
 *   version: 1,
 *   seed: string,
 *   levelId: "bright-start" | "trail-scout" | "maze-master",
 *   labyrinthNumber: number
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
 * @param {{ version: number, seed: string, levelId: string, labyrinthNumber: number }} locator
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
  if (
    candidate.version !== 1 ||
    typeof candidate.seed !== "string" ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(candidate.seed) ||
    candidate.seed.length > 24 ||
    (candidate.levelId !== "bright-start" &&
      candidate.levelId !== "trail-scout" &&
      candidate.levelId !== "maze-master") ||
    !Number.isInteger(candidate.labyrinthNumber) ||
    Number(candidate.labyrinthNumber) < 1 ||
    Number(candidate.labyrinthNumber) > QUEST_LABYRINTH_COUNT
  ) {
    return null;
  }
  return {
    version: 1,
    seed: candidate.seed,
    levelId: candidate.levelId,
    labyrinthNumber: Number(candidate.labyrinthNumber)
  };
}
