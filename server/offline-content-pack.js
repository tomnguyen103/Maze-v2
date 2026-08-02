import { getBundledQuestion } from "../src/questions/question-bank.js";
import { getPublishedLearningDeckRevisions } from "../src/questions/learning-decks.js";
import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import {
  getQuestContentPackId,
  QUEST_II_CONTENT_PACK_ID
} from "../src/game/quest-content.js";

/** @typedef {ReturnType<typeof import("../src/questions/question-contract.js").normalizeQuestion>} WardenQuestion */
/** @typedef {{
 *   question: WardenQuestion,
 *   levelId: string,
 *   difficultyBand: string,
 *   questionOrdinal: number
 * }} PublishedQuestionRevision */

const LEVELS = Object.freeze({
  bright: "bright-start",
  scout: "trail-scout",
  master: "maze-master"
});
const BANDS = Object.freeze({
  foundation: 1,
  developing: 5,
  capable: 9,
  advanced: 13,
  mastery: 17
});

/**
 * Resolves the immutable reviewed pack shipped with the application. The
 * receipt binds the pack hash; the server chooses the question generator and
 * never trusts question text or answer data supplied by the browser.
 *
 * @param {string} hash
 * @param {(WardenQuestion | PublishedQuestionRevision)[]} [publishedQuestions]
 */
export function createOfflineContentPack(hash, publishedQuestions = []) {
  const exactQuestions = new Map();
  for (const revision of getPublishedLearningDeckRevisions()) {
    for (const region of revision.regions) {
      for (const question of [
        ...region.normalQuestions,
        region.capstoneQuestion
      ]) {
        indexQuestion(exactQuestions, question);
      }
    }
  }
  for (const record of publishedQuestions) {
    const question = questionFromRecord(record);
    indexQuestion(exactQuestions, question);
  }

  return {
    hash,
    publishedQuestionRevisions: publishedQuestions.filter(
      (record) => isPublishedQuestionRevision(record)
    ),
    /** @param {string} revisionId */
    questionForRevision(revisionId) {
      if (typeof revisionId !== "string") {
        return null;
      }
      const exact = exactQuestions.get(revisionId);
      if (exact) {
        return exact;
      }
      const capstone =
        /^capstone-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery)$/.exec(
          revisionId
        );
      if (capstone) {
        return bundledQuestion(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (
            capstone[1]
          ),
          BANDS[/** @type {keyof typeof BANDS} */ (capstone[2])],
          "gate-warden",
          revisionId
        );
      }
      const questIICapstone =
        /^(?:quest-ii:)?(quest-ii-capstone-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery))(?::.*)?$/.exec(
          revisionId
        );
      if (questIICapstone) {
        return bundledQuestion(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (
            questIICapstone[2]
          ),
          BANDS[/** @type {keyof typeof BANDS} */ (questIICapstone[3])],
          "gate-warden",
          questIICapstone[1],
          BANDS[/** @type {keyof typeof BANDS} */ (questIICapstone[3])] - 1,
          "quest_ii_offline_revision_123"
        );
      }
      const questIIGenerated =
        /^(?:quest-ii:)?(quest-ii-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery)-(\d+))(?::.*)?$/.exec(
          revisionId
        );
      if (questIIGenerated) {
        return bundledQuestion(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (
            questIIGenerated[2]
          ),
          BANDS[/** @type {keyof typeof BANDS} */ (questIIGenerated[3])],
          "warden",
          questIIGenerated[1],
          Number(questIIGenerated[4]),
          "quest_ii_offline_revision_123"
        );
      }
      const generated = /^(bright|scout|master)-(foundation|developing|capable|advanced|mastery)-(\d+)$/.exec(
        revisionId
      );
      const generatedReviewedRevision =
        /^bundled:(bright|scout|master)-(foundation|developing|capable|advanced|mastery)-(\d+):/.exec(
          revisionId
        );
      const generatedMatch = generated ?? generatedReviewedRevision;
      if (!generatedMatch) {
        return null;
      }
      const level =
        LEVELS[/** @type {keyof typeof LEVELS} */ (generatedMatch[1])];
      const labyrinthNumber =
        BANDS[/** @type {keyof typeof BANDS} */ (generatedMatch[2])];
      return bundledQuestion(
        /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (level),
        labyrinthNumber,
        "warden",
        revisionId,
        Number(generatedMatch[3])
      );
    }
  };
}

/**
 * Builds the server-authoritative Question sequence for one receipt. The
 * initial Quest ledger is part of the signed receipt, so a replay cannot
 * replace a focused or Mixed card with another valid card from the pack.
 *
 * @param {{
 *   questId?: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   learningDeckId?: string,
 *   learningDeckRevision?: string,
 *   initialQuestionOrdinal?: number,
 *   initialUsedQuestionIds?: string[]
 * }} receipt
 * @param {PublishedQuestionRevision[]} [publishedQuestionRevisions]
 */
export function createOfflineQuestionSequence(
  receipt,
  publishedQuestionRevisions = []
) {
  if (
    typeof receipt.learningDeckId !== "string" ||
    typeof receipt.learningDeckRevision !== "string" ||
    !Number.isSafeInteger(receipt.initialQuestionOrdinal) ||
    !Array.isArray(receipt.initialUsedQuestionIds) ||
    receipt.initialUsedQuestionIds.some((id) => typeof id !== "string")
  ) {
    return null;
  }
  let questionOrdinal = /** @type {number} */ (receipt.initialQuestionOrdinal);
  const usedQuestionIds = new Set(receipt.initialUsedQuestionIds);
  const publishedBySlot = new Map(
    publishedQuestionRevisions.map((record) => [
      `${record.levelId}\u0000${record.difficultyBand}\u0000${record.questionOrdinal}`,
      record.question
    ])
  );
  return {
    /** @param {{ challenge?: { wardenId: number, attempt: number, kind?: string } | null }} run */
    next(run) {
      const challenge = run.challenge;
      if (!challenge) {
        return null;
      }
      for (let offset = 0; offset < 20; offset += 1) {
        const challengeKind = /** @type {"warden" | "gate-warden"} */ (
          challenge.kind === "gate-warden" && challenge.attempt === 0
            ? "gate-warden"
            : "warden"
        );
        const request = {
          ...(receipt.questId ? { questId: receipt.questId } : {}),
          levelId: receipt.levelId,
          seed: receipt.seed,
          wardenId: challenge.wardenId,
          attempt: challenge.attempt,
          labyrinthNumber: receipt.labyrinthNumber,
          questionOrdinal: questionOrdinal + offset,
          challengeKind,
          learningDeckId: receipt.learningDeckId,
          learningDeckRevision: receipt.learningDeckRevision,
          usedQuestionIds: [...usedQuestionIds]
        };
        const questII =
          getQuestContentPackId(receipt.questId) === QUEST_II_CONTENT_PACK_ID;
        const selected = questII
          ? {
              question: getBundledQuestion(request),
              source: /** @type {"mixed"} */ ("mixed")
            }
          : selectReviewedDeckQuestion(request);
        if (!selected) {
          continue;
        }
        const question =
          !questII &&
          challengeKind !== "gate-warden" &&
          (selected.source === "mixed" || selected.source === "mixed-fallback")
            ? publishedBySlot.get(
                `${request.levelId}\u0000${selected.question.difficultyBand}\u0000${request.questionOrdinal}`
              ) ?? selected.question
            : selected.question;
        if (usedQuestionIds.has(question.id)) {
          continue;
        }
        usedQuestionIds.add(question.id);
        questionOrdinal = request.questionOrdinal + 1;
        return question;
      }
      return null;
    }
  };
}

/** @param {WardenQuestion | PublishedQuestionRevision} record */
function questionFromRecord(record) {
  return isPublishedQuestionRevision(record) ? record.question : record;
}

/** @param {unknown} value @returns {value is PublishedQuestionRevision} */
function isPublishedQuestionRevision(value) {
  if (!value || typeof value !== "object" || !("question" in value)) {
    return false;
  }
  const record = /** @type {Partial<PublishedQuestionRevision>} */ (value);
  return Boolean(
    record.question &&
      typeof record.levelId === "string" &&
      typeof record.difficultyBand === "string" &&
      Number.isSafeInteger(record.questionOrdinal)
  );
}

/** @param {Map<string, WardenQuestion>} index @param {WardenQuestion} question */
function indexQuestion(index, question) {
  if (question && typeof question.id === "string") {
    index.set(question.id, question);
  }
  if (question && typeof question.reviewedRevisionId === "string") {
    index.set(question.reviewedRevisionId, question);
  }
}

/**
 * @param {"bright-start" | "trail-scout" | "maze-master"} levelId
 * @param {number} labyrinthNumber
 * @param {"warden" | "gate-warden"} challengeKind
 * @param {string} revisionId
 * @param {number} [questionOrdinal]
 * @param {string} [questId]
 */
function bundledQuestion(
  levelId,
  labyrinthNumber,
  challengeKind,
  revisionId,
  questionOrdinal = 0,
  questId
) {
  try {
    const question = getBundledQuestion({
      levelId,
      seed: "offline-content-pack",
      wardenId: questionOrdinal,
      labyrinthNumber,
      challengeKind,
      questionOrdinal,
      ...(questId ? { questId } : {})
    });
    return question.id === revisionId || question.reviewedRevisionId === revisionId
      ? question
      : null;
  } catch {
    return null;
  }
}
