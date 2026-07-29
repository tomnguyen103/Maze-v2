import { createRun } from "./game-session.js";
import { getBundledQuestion } from "../questions/question-bank.js";

export const FIRST_LIGHT_SEED = "FIRST-LIGHT-56";

const FIRST_LIGHT_STORAGE_KEY = "echo-maze:first-light:v1";
const FIRST_LIGHT_CONFIG = Object.freeze({
  size: 7,
  echoCount: 1,
  wardenCount: 1,
  vitality: 3,
  pulses: 1
});

/**
 * @typedef {{
 *   getItem(key: string): string | null,
 *   setItem(key: string, value: string): void
 * }} FirstLightStorage
 */

/**
 * @param {FirstLightStorage | undefined} storage
 * @returns {FirstLightStorage | null}
 */
function resolveStorage(storage) {
  if (storage) {
    return storage;
  }
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createFirstLightRun() {
  return createRun(FIRST_LIGHT_SEED, FIRST_LIGHT_CONFIG);
}

/**
 * @param {{ wardenId: number, attempt: number } | null} challenge
 */
export function getFirstLightQuestion(challenge) {
  if (!challenge) {
    throw new Error("First Light needs an active Warden challenge.");
  }
  return getBundledQuestion({
    levelId: "bright-start",
    seed: FIRST_LIGHT_SEED,
    wardenId: challenge.wardenId,
    attempt: challenge.attempt,
    labyrinthNumber: 1,
    questionOrdinal: challenge.attempt + 1
  });
}

/**
 * @param {FirstLightStorage} [storage]
 */
export function shouldOfferFirstLight(storage) {
  const target = resolveStorage(storage);
  if (!target) {
    return true;
  }
  try {
    return target.getItem(FIRST_LIGHT_STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

/**
 * @param {FirstLightStorage} [storage]
 */
export function markFirstLightSeen(storage) {
  const target = resolveStorage(storage);
  if (!target) {
    return false;
  }
  try {
    target.setItem(FIRST_LIGHT_STORAGE_KEY, "seen");
    return true;
  } catch {
    return false;
  }
}
