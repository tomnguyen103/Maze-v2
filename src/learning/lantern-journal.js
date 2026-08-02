import { getBundledQuestion } from "../questions/question-bank.js";
import {
  isLearningMetadata
} from "../questions/learning-objectives.js";

export const LANTERN_JOURNAL_VERSION = 1;
export const MAX_JOURNAL_EVENTS = 200;
const OUTCOMES = new Set(["correct", "wrong", "hint", "skip"]);
const EVENT_ID_PATTERN =
  /^event_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIC_QUESTION_ID_PATTERN =
  /^(bright|scout|master)-(foundation|developing|capable|advanced|mastery)-([0-9]{1,10})$/;
const QUEST_II_QUESTION_ID_PATTERN =
  /^quest-ii-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery)-([0-9]{1,10})$/;
const QUEST_II_CAPSTONE_ID_PATTERN =
  /^quest-ii-capstone-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery)$/;
const JOURNAL_ORDINAL_COUNT = 8;
const QUEST_II_JOURNAL_ORDINAL_COUNT = 20;
const JOURNAL_QUEST_II_ID = "quest_ii_journal_validation_123";
const BAND_ORDER = Object.freeze([
  ["foundation", "Foundation"],
  ["developing", "Developing"],
  ["capable", "Capable"],
  ["advanced", "Advanced"],
  ["mastery", "Mastery"]
]);
const LEVEL_BY_PREFIX = Object.freeze({
  bright: "bright-start",
  scout: "trail-scout",
  master: "maze-master"
});
const LABYRINTH_BY_BAND = Object.freeze({
  foundation: 1,
  developing: 5,
  capable: 9,
  advanced: 13,
  mastery: 17
});

/**
 * @typedef {"correct" | "wrong" | "hint" | "skip"} LearningOutcome
 * @typedef {{
 *   eventId: string,
 *   questionId: string,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   difficultyBand: string,
 *   outcome: LearningOutcome
 * }} LearningEvent
 * @typedef {{ version: number, events: LearningEvent[] }} LanternJournal
 */

/** @returns {LanternJournal} */
export function createLanternJournal() {
  return { version: LANTERN_JOURNAL_VERSION, events: [] };
}

/** @param {unknown} value @returns {LanternJournal | null} */
export function normalizeLanternJournal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const journal = /** @type {Record<string, unknown>} */ (value);
  if (
    journal.version !== LANTERN_JOURNAL_VERSION ||
    !Array.isArray(journal.events) ||
    journal.events.length > MAX_JOURNAL_EVENTS
  ) {
    return null;
  }
  /** @type {LearningEvent[]} */
  const events = [];
  const ids = new Set();
  for (const raw of journal.events) {
    const event = normalizeEvent(raw);
    if (!event || ids.has(event.eventId)) {
      return null;
    }
    ids.add(event.eventId);
    events.push(event);
  }
  return { version: LANTERN_JOURNAL_VERSION, events };
}

/**
 * @param {LanternJournal} journal
 * @param {{
 *   id: string,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   difficultyBand: string
 * }} question
 * @param {"correct" | "wrong" | "hint" | "skip"} outcome
 * @param {() => string} [createEventId]
 */
export function recordLearningOutcome(
  journal,
  question,
  outcome,
  createEventId = () => `event_${crypto.randomUUID()}`
) {
  const normalized = normalizeLanternJournal(journal);
  const questionId = journalQuestionId(question);
  if (
    !normalized ||
    !questionId ||
    !OUTCOMES.has(outcome) ||
    !isLearningMetadata(question.topicId, question.learningObjectiveId) ||
    !BAND_ORDER.some(([id]) => id === question.difficultyBand)
  ) {
    throw new Error("Learning outcome is not a reviewed Journal event.");
  }
  const event = normalizeEvent({
    eventId: createEventId(),
    questionId,
    topicId: question.topicId,
    learningObjectiveId: question.learningObjectiveId,
    difficultyBand: question.difficultyBand,
    outcome
  });
  if (!event) {
    throw new Error("Learning outcome event id is invalid.");
  }
  return {
    version: LANTERN_JOURNAL_VERSION,
    events: [...normalized.events, event].slice(-MAX_JOURNAL_EVENTS)
  };
}

/** @param {unknown} local @param {unknown} cloud */
export function mergeLanternJournals(local, cloud) {
  const localJournal = normalizeLanternJournal(local);
  const cloudJournal = normalizeLanternJournal(cloud);
  if (!localJournal || !cloudJournal) {
    throw new Error("Journal merge requires valid records.");
  }
  const byId = new Map();
  for (const event of [...cloudJournal.events, ...localJournal.events]) {
    byId.set(event.eventId, event);
  }
  return {
    version: LANTERN_JOURNAL_VERSION,
    events: [...byId.values()]
      .sort((left, right) => left.eventId.localeCompare(right.eventId))
      .slice(-MAX_JOURNAL_EVENTS)
  };
}

/** @param {unknown} value @returns {LearningEvent | null} */
function normalizeEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const event = /** @type {Record<string, unknown>} */ (value);
  const questionId =
    typeof event.questionId === "string" ? event.questionId : "";
  const parsedQuestionId = parseJournalQuestionId(questionId);
  const reviewedQuestion = parsedQuestionId
    ? reviewedQuestionForId(questionId)
    : null;
  const canonicalQuestionId = reviewedQuestion
    ? canonicalJournalQuestionId(reviewedQuestion.id)
    : null;
  if (
    typeof event.eventId !== "string" ||
    !EVENT_ID_PATTERN.test(event.eventId) ||
    !reviewedQuestion ||
    canonicalQuestionId !== questionId ||
    typeof event.topicId !== "string" ||
    typeof event.learningObjectiveId !== "string" ||
    !isLearningMetadata(event.topicId, event.learningObjectiveId) ||
    typeof event.difficultyBand !== "string" ||
    !BAND_ORDER.some(([id]) => id === event.difficultyBand) ||
    typeof event.outcome !== "string" ||
    !OUTCOMES.has(event.outcome) ||
    reviewedQuestion.topicId !== event.topicId ||
    reviewedQuestion.learningObjectiveId !== event.learningObjectiveId ||
    reviewedQuestion.difficultyBand !== event.difficultyBand
  ) {
    return null;
  }
  return {
    eventId: event.eventId,
    questionId,
    topicId: event.topicId,
    learningObjectiveId: event.learningObjectiveId,
    difficultyBand: event.difficultyBand,
    outcome: /** @type {LearningOutcome} */ (event.outcome)
  };
}

/**
 * @param {{
 *   id: string,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   difficultyBand: string
 * }} question
 */
function journalQuestionId(question) {
  const parsedQuestionId = parseJournalQuestionId(question.id);
  const source = reviewedQuestionForId(question.id);
  if (
    !parsedQuestionId ||
    !source ||
    source.topicId !== question.topicId ||
    source.learningObjectiveId !== question.learningObjectiveId ||
    source.difficultyBand !== question.difficultyBand
  ) {
    return null;
  }
  return canonicalJournalQuestionId(question.id);
}

/** @param {string} questionId */
export function reviewedQuestionForId(questionId) {
  const parsed = parseJournalQuestionId(questionId);
  if (!parsed) {
    return null;
  }
  const question = getBundledQuestion({
    levelId: parsed.levelId,
    seed: "journal-validation",
    wardenId: 0,
    labyrinthNumber: parsed.labyrinthNumber,
    questionOrdinal: parsed.questionOrdinal,
    ...(parsed.questId ? { questId: parsed.questId } : {}),
    ...(parsed.challengeKind ? { challengeKind: parsed.challengeKind } : {})
  });
  return question.id === questionId ? question : null;
}

/**
 * @typedef {{
 *   levelId: string,
 *   bandId: string,
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   canonicalId: string,
 *   questId?: string,
 *   challengeKind?: "gate-warden"
 * }} ParsedJournalQuestionId
 */

/** @param {string} questionId @returns {ParsedJournalQuestionId | null} */
function parseJournalQuestionId(questionId) {
  const classic = CLASSIC_QUESTION_ID_PATTERN.exec(questionId);
  if (classic) {
    const levelId =
      LEVEL_BY_PREFIX[
        /** @type {keyof typeof LEVEL_BY_PREFIX} */ (classic[1])
      ];
    const bandId = classic[2];
    const questionOrdinal = Number(classic[3]);
    const labyrinthNumber =
      LABYRINTH_BY_BAND[
        /** @type {keyof typeof LABYRINTH_BY_BAND} */ (bandId)
      ];
    return Number.isSafeInteger(questionOrdinal)
      ? {
          levelId,
          bandId,
          labyrinthNumber,
          questionOrdinal,
          canonicalId: `${classic[1]}-${bandId}-${
            questionOrdinal % JOURNAL_ORDINAL_COUNT
          }`
        }
      : null;
  }

  const questII = QUEST_II_QUESTION_ID_PATTERN.exec(questionId);
  if (questII) {
    const levelId = questII[1];
    const bandId = questII[2];
    const questionOrdinal = Number(questII[3]);
    const labyrinthNumber =
      LABYRINTH_BY_BAND[
        /** @type {keyof typeof LABYRINTH_BY_BAND} */ (bandId)
      ];
    return Number.isSafeInteger(questionOrdinal)
      ? {
          levelId,
          bandId,
          labyrinthNumber,
          questionOrdinal,
          canonicalId: `quest-ii-${levelId}-${bandId}-${
            questionOrdinal % QUEST_II_JOURNAL_ORDINAL_COUNT
          }`,
          questId: JOURNAL_QUEST_II_ID
        }
      : null;
  }

  const capstone = QUEST_II_CAPSTONE_ID_PATTERN.exec(questionId);
  if (capstone) {
    const levelId = capstone[1];
    const bandId = capstone[2];
    const labyrinthNumber =
      LABYRINTH_BY_BAND[
        /** @type {keyof typeof LABYRINTH_BY_BAND} */ (bandId)
      ];
    return {
      levelId,
      bandId,
      labyrinthNumber,
      questionOrdinal: labyrinthNumber - 1,
      canonicalId: questionId,
      questId: JOURNAL_QUEST_II_ID,
      challengeKind: "gate-warden"
    };
  }
  return null;
}

/** @param {string} questionId */
function canonicalJournalQuestionId(questionId) {
  return parseJournalQuestionId(questionId)?.canonicalId ?? null;
}
