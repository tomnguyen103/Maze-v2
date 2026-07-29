export const ACTIVE_RUN_RECOVERY_KEY =
  "echo-maze:active-run-recovery:v1";

/**
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem: (key: string) => unknown
 * }} StorageLike
 */

/**
 * Scrub recovery independently from the optional Campfire Resume chunk.
 *
 * @param {StorageLike | undefined | null} [storage]
 */
export function scrubActiveRunRecovery(storage) {
  /** @type {StorageLike | undefined | null} */
  let target = storage;
  if (target === undefined) {
    try {
      target = globalThis.localStorage;
    } catch {
      return false;
    }
  }
  if (!target) {
    return false;
  }
  try {
    if (target.getItem(ACTIVE_RUN_RECOVERY_KEY) === null) {
      return true;
    }
    target.removeItem(ACTIVE_RUN_RECOVERY_KEY);
    if (target.getItem(ACTIVE_RUN_RECOVERY_KEY) === null) {
      return true;
    }
  } catch {
    // Overwrite below so sensitive Challenge content is still scrubbed.
  }
  try {
    target.setItem(ACTIVE_RUN_RECOVERY_KEY, "");
    return target.getItem(ACTIVE_RUN_RECOVERY_KEY) === "";
  } catch {
    return false;
  }
}
