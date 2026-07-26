import {
  QUEST_LABYRINTH_COUNT,
  getQuestLevel
} from "../questions/quest-levels.js";

const QUEST_PROGRESS_KEY = "echo-maze:quest-progress:v1";
const MAX_QUESTION_HISTORY = 5000;
const MAX_MAP_HISTORY = 1000;

/**
 * @typedef {"bright-start" | "trail-scout" | "maze-master"} QuestLevelId
 * @typedef {{
 *   version: 1,
 *   levelId: QuestLevelId,
 *   labyrinthNumber: number,
 *   completedLabyrinths: number,
 *   usedMapFingerprints: string[],
 *   usedQuestionIds: string[],
 *   nextQuestionOrdinal: number,
 *   complete: boolean
 * }} QuestProgress
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown
 * }} StorageLike
 */

/**
 * @param {string} levelId
 * @param {number} [labyrinthNumber]
 * @returns {QuestProgress}
 */
export function createQuestProgress(levelId, labyrinthNumber = 1) {
  const level = getQuestLevel(levelId);
  if (level.id !== levelId) {
    throw new Error("Choose a valid Quest Level.");
  }
  if (
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  ) {
    throw new Error("Choose a valid Labyrinth Number.");
  }
  return {
    version: 1,
    levelId: level.id,
    labyrinthNumber,
    completedLabyrinths: labyrinthNumber - 1,
    usedMapFingerprints: [],
    usedQuestionIds: [],
    nextQuestionOrdinal: 0,
    complete: false
  };
}

/**
 * @param {QuestProgress} progress
 * @param {string} fingerprint
 * @returns {QuestProgress}
 */
export function rememberMap(progress, fingerprint) {
  const normalizedFingerprint = fingerprint.trim();
  if (!normalizedFingerprint) {
    throw new Error("Map fingerprint is required.");
  }
  if (progress.usedMapFingerprints.includes(normalizedFingerprint)) {
    throw new Error("Map would repeat during this Quest.");
  }
  if (progress.usedMapFingerprints.length >= MAX_MAP_HISTORY) {
    throw new Error("Quest map history is full.");
  }
  return {
    ...cloneProgress(progress),
    usedMapFingerprints: [
      ...progress.usedMapFingerprints,
      normalizedFingerprint
    ]
  };
}

/** @param {QuestProgress} progress @returns {QuestProgress} */
export function advanceQuest(progress) {
  if (progress.complete) {
    return cloneProgress(progress);
  }
  if (progress.labyrinthNumber === QUEST_LABYRINTH_COUNT) {
    return {
      ...cloneProgress(progress),
      completedLabyrinths: QUEST_LABYRINTH_COUNT,
      complete: true
    };
  }
  return {
    ...cloneProgress(progress),
    completedLabyrinths: progress.labyrinthNumber,
    labyrinthNumber: progress.labyrinthNumber + 1
  };
}

/**
 * @param {QuestProgress} progress
 * @param {string} questionId
 * @param {number} [questionOrdinal]
 * @returns {QuestProgress}
 */
export function rememberQuestion(
  progress,
  questionId,
  questionOrdinal = progress.nextQuestionOrdinal
) {
  const normalizedId = questionId.trim();
  if (!normalizedId) {
    throw new Error("Question ID is required.");
  }
  if (
    !Number.isInteger(questionOrdinal) ||
    questionOrdinal < progress.nextQuestionOrdinal
  ) {
    throw new Error("Question ordinal cannot move backward.");
  }
  if (progress.usedQuestionIds.includes(normalizedId)) {
    throw new Error("Question would repeat during this Quest.");
  }
  if (progress.usedQuestionIds.length >= MAX_QUESTION_HISTORY) {
    throw new Error("Quest Question history is full.");
  }
  return {
    ...cloneProgress(progress),
    usedQuestionIds: [...progress.usedQuestionIds, normalizedId],
    nextQuestionOrdinal: questionOrdinal + 1
  };
}

/**
 * @param {StorageLike | undefined} [storage]
 * @returns {QuestProgress | null}
 */
export function loadQuestProgress(storage = globalThis.localStorage) {
  if (!storage) {
    return null;
  }
  try {
    const progress = normalizeProgress(
      JSON.parse(storage.getItem(QUEST_PROGRESS_KEY) ?? "null")
    );
    return progress;
  } catch {
    return null;
  }
}

/**
 * @param {QuestProgress} progress
 * @param {StorageLike | undefined} [storage]
 * @returns {QuestProgress}
 */
export function saveQuestProgress(
  progress,
  storage = globalThis.localStorage
) {
  const normalized = normalizeProgress(progress);
  if (!normalized) {
    throw new Error("Cannot save invalid Quest Progress.");
  }
  try {
    storage?.setItem(QUEST_PROGRESS_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }
  return normalized;
}

/** @param {unknown} value @returns {QuestProgress | null} */
function normalizeProgress(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = /** @type {Partial<QuestProgress>} */ (value);
  const usedMapFingerprints = candidate.usedMapFingerprints ?? [];
  if (
    candidate.version !== 1 ||
    (candidate.levelId !== "bright-start" &&
      candidate.levelId !== "trail-scout" &&
      candidate.levelId !== "maze-master") ||
    !Number.isInteger(candidate.labyrinthNumber) ||
    Number(candidate.labyrinthNumber) < 1 ||
    Number(candidate.labyrinthNumber) > QUEST_LABYRINTH_COUNT ||
    !Number.isInteger(candidate.completedLabyrinths) ||
    Number(candidate.completedLabyrinths) < 0 ||
    Number(candidate.completedLabyrinths) > QUEST_LABYRINTH_COUNT ||
    !Array.isArray(usedMapFingerprints) ||
    usedMapFingerprints.length > MAX_MAP_HISTORY ||
    usedMapFingerprints.some(
      (fingerprint) =>
        typeof fingerprint !== "string" ||
        !fingerprint.trim() ||
        fingerprint.length > 1000
    ) ||
    new Set(usedMapFingerprints).size !== usedMapFingerprints.length ||
    !Array.isArray(candidate.usedQuestionIds) ||
    candidate.usedQuestionIds.length > MAX_QUESTION_HISTORY ||
    candidate.usedQuestionIds.some(
      (id) => typeof id !== "string" || !id.trim() || id.length > 120
    ) ||
    new Set(candidate.usedQuestionIds).size !==
      candidate.usedQuestionIds.length ||
    !Number.isInteger(candidate.nextQuestionOrdinal) ||
    Number(candidate.nextQuestionOrdinal) < candidate.usedQuestionIds.length ||
    typeof candidate.complete !== "boolean"
  ) {
    return null;
  }
  const expectedCompleted = candidate.complete
    ? QUEST_LABYRINTH_COUNT
    : Number(candidate.labyrinthNumber) - 1;
  if (candidate.completedLabyrinths !== expectedCompleted) {
    return null;
  }
  return {
    version: 1,
    levelId: candidate.levelId,
    labyrinthNumber: Number(candidate.labyrinthNumber),
    completedLabyrinths: Number(candidate.completedLabyrinths),
    usedMapFingerprints: [...usedMapFingerprints],
    usedQuestionIds: [...candidate.usedQuestionIds],
    nextQuestionOrdinal: Number(candidate.nextQuestionOrdinal),
    complete: candidate.complete
  };
}

/** @param {QuestProgress} progress @returns {QuestProgress} */
function cloneProgress(progress) {
  return {
    ...progress,
    usedMapFingerprints: [...progress.usedMapFingerprints],
    usedQuestionIds: [...progress.usedQuestionIds]
  };
}
