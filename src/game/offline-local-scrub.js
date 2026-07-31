import { ACTIVE_RUN_RECOVERY_KEY, scrubActiveRunRecovery } from "./local-recovery-scrub.js";

/**
 * Shared-device cleanup for offline state, per ADR 0034.
 *
 * Signing out deletes that Explorer's receipts, reviewed packs, Active Run
 * Recovery, pending action logs, and device-local Run Replay data. Account
 * deletion performs exactly the same local cleanup. Another account can then
 * neither reuse nor inspect what the previous Explorer left behind.
 *
 * This module deliberately imports nothing from the offline play chunk, on the
 * Milestone 4 `scrubActiveRunRecovery` precedent: cleanup that only works when
 * an optional chunk happened to load is cleanup that fails exactly when a
 * shared device most needs it.
 *
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem: (key: string) => unknown
 * }} StorageLike
 */

export const OFFLINE_RECEIPT_KEY = "echo-maze:offline-receipt:v1";
export const OFFLINE_CONTENT_PACK_KEY = "echo-maze:offline-content-pack:v1";
export const OFFLINE_ACTION_LOG_KEY = "echo-maze:offline-action-log:v1";
export const OFFLINE_RUN_RECORD_KEY = "echo-maze:offline-run-record:v1";
export const OFFLINE_REPLAY_KEY = "echo-maze:offline-run-replay:v1";

/**
 * Every account-scoped offline artefact. Listed rather than matched by prefix,
 * so adding a new one is a decision someone makes here rather than something
 * that silently does or does not get erased.
 */
export const OFFLINE_ACCOUNT_SCOPED_KEYS = Object.freeze([
  OFFLINE_RECEIPT_KEY,
  OFFLINE_CONTENT_PACK_KEY,
  OFFLINE_ACTION_LOG_KEY,
  OFFLINE_RUN_RECORD_KEY,
  OFFLINE_REPLAY_KEY
]);

/** @param {StorageLike | undefined | null} [storage] */
function resolveStorage(storage) {
  if (storage !== undefined) {
    return storage;
  }
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * True when signing out now would discard an offline result that has not been
 * verified. The warning this drives has to be shown before the destructive
 * step, not after it.
 *
 * @param {StorageLike | undefined | null} [storage]
 */
export function hasUnverifiedOfflineResult(storage) {
  const target = resolveStorage(storage);
  if (!target) {
    return false;
  }
  try {
    const record = target.getItem(OFFLINE_RUN_RECORD_KEY);
    if (!record) {
      return Boolean(target.getItem(OFFLINE_ACTION_LOG_KEY));
    }
    const parsed = JSON.parse(record);
    return parsed?.verification !== "verified";
  } catch {
    // Unreadable local state is treated as unverified: warning about a result
    // that turns out to be fine costs an Explorer a dialog, while staying
    // silent about one that is not costs them the result.
    return true;
  }
}

/**
 * Erases every account-scoped offline artefact. Returns false when any key
 * survived, so a caller can say so rather than claiming a cleanup that did not
 * happen.
 *
 * @param {StorageLike | undefined | null} [storage]
 */
export function scrubOfflineState(storage) {
  const target = resolveStorage(storage);
  if (!target) {
    return false;
  }
  let cleared = true;
  for (const key of OFFLINE_ACCOUNT_SCOPED_KEYS) {
    try {
      if (target.getItem(key) === null) {
        continue;
      }
      target.removeItem(key);
      if (target.getItem(key) !== null) {
        // Overwriting is the same fallback `scrubActiveRunRecovery` uses:
        // a storage that refuses removal must not be allowed to leave a
        // reviewed pack or a receipt readable by the next account.
        target.setItem(key, "");
        cleared = target.getItem(key) === "" ? cleared : false;
      }
    } catch {
      cleared = false;
    }
  }
  // Active Run Recovery is erased through its own module, which already
  // handles a storage that refuses removal by overwriting the entry.
  return scrubActiveRunRecovery(target) && cleared;
}

/**
 * The keys that survive a sign-out: none of the account-scoped ones. Exposed
 * so a test can assert the boundary rather than restate it.
 */
export function offlineKeysAfterSignOut() {
  return Object.freeze([...OFFLINE_ACCOUNT_SCOPED_KEYS, ACTIVE_RUN_RECOVERY_KEY]);
}
