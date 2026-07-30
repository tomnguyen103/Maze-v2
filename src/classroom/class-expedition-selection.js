const SELECTION_PREFIX = "echo-maze:class-expedition:v1:";
const PENDING_OUTCOME_PREFIX = "echo-maze:class-run-outcome-pending:v1:";

/**
 * Cheap flag main.js can read without loading any classroom chunk. It only
 * says "a Class Expedition may be active"; the per-user selection record is
 * the authority and lives behind the lazy module.
 */
export const CLASS_EXPEDITION_ACTIVE_KEY = "echo-maze:class-expedition-active:v1";

const CLASSROOM_PATTERN = /^org_[A-Za-z0-9_-]{3,120}$/;
const EXPEDITION_PATTERN = /^exped_[A-Za-z0-9_-]{3,120}$/;

/**
 * @typedef {{
 *   classroomId: string,
 *   expeditionId: string,
 *   atlasRegion: number,
 *   levelId: string,
 *   learningDeckId: string,
 *   learningDeckRevision: string
 * }} ClassExpeditionSelection
 */

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null | undefined} userId
 * @param {ClassExpeditionSelection} selection
 */
export function saveClassExpeditionSelection(storage, userId, selection) {
  if (!storage || !userId) {
    return false;
  }
  try {
    storage.setItem(
      `${SELECTION_PREFIX}${userId}`,
      JSON.stringify(selection)
    );
    storage.setItem(CLASS_EXPEDITION_ACTIVE_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null | undefined} userId
 * @returns {ClassExpeditionSelection | null}
 */
export function loadClassExpeditionSelection(storage, userId) {
  if (!storage || !userId) {
    return null;
  }
  try {
    const raw = storage.getItem(`${SELECTION_PREFIX}${userId}`);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !CLASSROOM_PATTERN.test(String(value.classroomId)) ||
      !EXPEDITION_PATTERN.test(String(value.expeditionId)) ||
      !Number.isInteger(value.atlasRegion) ||
      Number(value.atlasRegion) < 1 ||
      Number(value.atlasRegion) > 5 ||
      typeof value.levelId !== "string" ||
      typeof value.learningDeckId !== "string" ||
      typeof value.learningDeckRevision !== "string"
    ) {
      return null;
    }
    return {
      classroomId: String(value.classroomId),
      expeditionId: String(value.expeditionId),
      atlasRegion: Number(value.atlasRegion),
      levelId: String(value.levelId),
      learningDeckId: String(value.learningDeckId),
      learningDeckRevision: String(value.learningDeckRevision)
    };
  } catch {
    return null;
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null | undefined} userId
 */
export function clearClassExpeditionSelection(storage, userId) {
  if (!storage) {
    return;
  }
  try {
    if (userId) {
      storage.removeItem(`${SELECTION_PREFIX}${userId}`);
      storage.removeItem(`${PENDING_OUTCOME_PREFIX}${userId}`);
    }
    storage.removeItem(CLASS_EXPEDITION_ACTIVE_KEY);
  } catch {
    // Storage denial never blocks play.
  }
}

/**
 * One bounded pending terminal outcome per Explorer, kept only until the
 * server acknowledges it, so a transport failure at terminal state cannot
 * strand a Labyrinth's Grant in the issued state forever.
 *
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null | undefined} userId
 * @param {{
 *   expeditionId: string,
 *   classroomId: string,
 *   runId: string,
 *   labyrinthNumber: number,
 *   outcome: "escaped" | "defeated"
 * } | null} pending
 */
export function savePendingClassRunOutcome(storage, userId, pending) {
  if (!storage || !userId) {
    return;
  }
  try {
    if (pending === null) {
      storage.removeItem(`${PENDING_OUTCOME_PREFIX}${userId}`);
    } else {
      storage.setItem(
        `${PENDING_OUTCOME_PREFIX}${userId}`,
        JSON.stringify(pending)
      );
    }
  } catch {
    // Storage denial never blocks play.
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null | undefined} userId
 */
export function loadPendingClassRunOutcome(storage, userId) {
  if (!storage || !userId) {
    return null;
  }
  try {
    const raw = storage.getItem(`${PENDING_OUTCOME_PREFIX}${userId}`);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !EXPEDITION_PATTERN.test(String(value.expeditionId)) ||
      !CLASSROOM_PATTERN.test(String(value.classroomId)) ||
      typeof value.runId !== "string" ||
      !Number.isInteger(value.labyrinthNumber) ||
      (value.outcome !== "escaped" && value.outcome !== "defeated")
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
