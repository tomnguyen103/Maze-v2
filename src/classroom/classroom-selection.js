const CLASSROOM_SELECTION_KEY = "echo-maze:selected-classroom:v1";
const CLASSROOM_ID_PATTERN = /^org_[A-Za-z0-9_-]{3,120}$/;
const USER_ID_PATTERN = /^user_[A-Za-z0-9_-]{3,120}$/;

/**
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem: (key: string) => unknown
 * }} ClassroomSelectionStorage
 */

/**
 * @param {ClassroomSelectionStorage | undefined} [storage]
 * @param {string | null | undefined} [userId]
 */
export function loadSelectedClassroom(
  storage = globalThis.localStorage,
  userId = null
) {
  try {
    storage?.removeItem(CLASSROOM_SELECTION_KEY);
    const key = userSelectionKey(userId);
    if (!key) return null;
    const value = storage?.getItem(key) ?? "";
    if (CLASSROOM_ID_PATTERN.test(value)) {
      return value;
    }
    storage?.removeItem(key);
  } catch {
    // Storage is presentation-only. A denied browser storage API means
    // Personal Play, never a blocked Quest.
  }
  return null;
}

/**
 * @param {string} classroomId
 * @param {ClassroomSelectionStorage | undefined} [storage]
 * @param {string | null | undefined} [userId]
 */
export function saveSelectedClassroom(
  classroomId,
  storage = globalThis.localStorage,
  userId = null
) {
  try {
    storage?.removeItem(CLASSROOM_SELECTION_KEY);
    const key = userSelectionKey(userId);
    if (!key) return false;
    if (!CLASSROOM_ID_PATTERN.test(classroomId)) {
      storage?.removeItem(key);
      return false;
    }
    storage?.setItem(key, classroomId);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {ClassroomSelectionStorage | undefined} [storage]
 * @param {string | null | undefined} [userId]
 */
export function clearSelectedClassroom(
  storage = globalThis.localStorage,
  userId = null
) {
  try {
    storage?.removeItem(CLASSROOM_SELECTION_KEY);
    const key = userSelectionKey(userId);
    if (key) storage?.removeItem(key);
  } catch {
    // Personal Play remains the safe fallback.
  }
}

/** @param {string | null | undefined} userId */
function userSelectionKey(userId) {
  return typeof userId === "string" && USER_ID_PATTERN.test(userId)
    ? `${CLASSROOM_SELECTION_KEY}:${userId}`
    : null;
}
