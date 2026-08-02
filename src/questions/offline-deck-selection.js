import { getLearningMetadata } from "./learning-objectives.js";
import { getBundledQuestion } from "./question-bank.js";
import {
  getQuestContentPackId,
  QUEST_II_CONTENT_PACK_ID
} from "../game/quest-content.js";
import {
  getPublishedLearningDeckOption
} from "./learning-deck-catalog.js";
import { getLabyrinthConfig } from "./quest-levels.js";
import {
  createReviewedQuestionRevisionId,
  reviewedQuestionPresentationDigest
} from "./reviewed-question-revision.js";
import { normalizeQuestion } from "./question-contract.js";

const REGION_STARTS = Object.freeze([1, 5, 9, 13, 17]);
const NUMBER_TRAIL_TOPICS = new Set([
  "arithmetic",
  "fractions",
  "geometry",
  "patterns"
]);

/**
 * This is the compact client counterpart to the server's published Deck
 * selector. It derives the published Number Trail pool from the same reviewed
 * Mixed source instead of bundling the full server publication artifact.
 * Unknown or invalid focused revisions fail closed; they never fall through
 * to Mixed content under a focused Deck label.
 *
 * @param {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   challengeKind: "warden" | "gate-warden",
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   questId?: string,
 *   learningDeckId?: string | null,
 *   learningDeckRevision?: string | null
 * }} request
 * @param {readonly string[]} usedQuestionIds
 * @returns {{ question: ReturnType<typeof getBundledQuestion>, source: "focused" | "capstone" | "mixed-fallback" | "mixed" } | null}
 */
export function selectOfflineLearningDeckQuestion(request, usedQuestionIds) {
  const used = new Set(usedQuestionIds);
  if (getQuestContentPackId(request.questId) === QUEST_II_CONTENT_PACK_ID) {
    const question = getBundledQuestion(request);
    return used.has(question.id)
      ? null
      : { question, source: /** @type {"mixed"} */ ("mixed") };
  }
  const deckId = request.learningDeckId ?? null;
  if (!deckId) {
    return mixedSelection(request, used);
  }
  const option = getPublishedLearningDeckOption(
    deckId,
    request.learningDeckRevision ?? undefined
  );
  if (!option) {
    return null;
  }
  if (option.kind === "mixed") {
    return mixedSelection(request, used);
  }
  if (option.deckId !== "number-trail") {
    return null;
  }

  const region = regionFor(request.levelId, request.labyrinthNumber);
  if (!region) {
    return null;
  }
  const focusedObjectiveIds = focusedObjectives(request.levelId);
  const usedPresentationDigests = new Set();
  /** @type {ReturnType<typeof getBundledQuestion>[]} */
  let normalQuestions = [];
  /** @type {ReturnType<typeof getBundledQuestion> | null} */
  let capstoneSource = null;
  for (let regionNumber = 1; regionNumber <= region.regionNumber; regionNumber += 1) {
    const candidate = regionFor(
      request.levelId,
      REGION_STARTS[regionNumber - 1]
    );
    if (!candidate) {
      return null;
    }
    const candidateNormal = collectFocusedQuestions(
      request.levelId,
      candidate.labyrinthStart,
      focusedObjectiveIds,
      candidate.minimumFocusedQuestions,
      0,
      usedPresentationDigests
    );
    const candidateCapstone = collectFocusedQuestions(
      request.levelId,
      candidate.labyrinthStart,
      focusedObjectiveIds,
      1,
      1500 + (regionNumber - 1) * 32,
      usedPresentationDigests
    )[0];
    if (regionNumber === region.regionNumber) {
      normalQuestions = candidateNormal;
      capstoneSource = candidateCapstone;
    }
  }
  if (!capstoneSource) {
    return null;
  }
  const capstone = createFocusedCapstone(
    capstoneSource,
    `capstone-number-trail-${request.levelId}-${region.bandId}`
  );

  if (
    request.challengeKind === "gate-warden" &&
    request.attempt === 0 &&
    !used.has(capstone.id)
  ) {
    return { question: capstone, source: "capstone" };
  }
  const focused = normalQuestions.find((question) => !used.has(question.id));
  if (focused) {
    return { question: focused, source: "focused" };
  }
  return {
    ...mixedSelection(request, used, "warden"),
    source: "mixed-fallback"
  };
}

/** @param {Parameters<typeof selectOfflineLearningDeckQuestion>[0]} request @param {Set<string>} used */
function mixedSelection(request, used, challengeKind = request.challengeKind) {
  return {
    question: unusedMixedQuestion({ ...request, challengeKind }, used),
    source: /** @type {"mixed"} */ ("mixed")
  };
}

/** @param {string} levelId */
function focusedObjectives(levelId) {
  return Array.from({ length: 8 }, (_, ordinal) =>
    getLearningMetadata(levelId, ordinal)
  )
    .filter(({ topicId }) => NUMBER_TRAIL_TOPICS.has(topicId))
    .map(({ learningObjectiveId }) => learningObjectiveId);
}

/** @param {string} levelId @param {number} labyrinthNumber */
function regionFor(levelId, labyrinthNumber) {
  const index = REGION_STARTS.findIndex(
    (start) => labyrinthNumber >= start && labyrinthNumber <= start + 3
  );
  if (index < 0) {
    return null;
  }
  const labyrinthStart = REGION_STARTS[index];
  const correctFirstDemand = [0, 1, 2, 3].reduce(
    (total, offset) =>
      total + getLabyrinthConfig(levelId, labyrinthStart + offset).wardenCount,
    0
  );
  return {
    regionNumber: index + 1,
    bandId: getBundledQuestion({
      levelId,
      seed: "offline-deck-band",
      wardenId: 0,
      labyrinthNumber: labyrinthStart,
      questionOrdinal: 0
    }).difficultyBand,
    labyrinthStart,
    minimumFocusedQuestions: Math.ceil(correctFirstDemand * 0.7)
  };
}

/**
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {string[]} focusedObjectiveIds
 * @param {number} count
 * @param {number} startOrdinal
 * @param {Set<string>} [usedPresentationDigests]
 */
function collectFocusedQuestions(
  levelId,
  labyrinthNumber,
  focusedObjectiveIds,
  count,
  startOrdinal,
  usedPresentationDigests = new Set()
) {
  const questions = [];
  const searchLimit = startOrdinal + count * 16 + 64;
  for (
    let questionOrdinal = startOrdinal;
    questions.length < count && questionOrdinal < searchLimit;
    questionOrdinal += 1
  ) {
    const question = getBundledQuestion({
      levelId,
      seed: "PUBLISHED-LEARNING-DECK",
      wardenId: 0,
      labyrinthNumber,
      questionOrdinal
    });
    const presentationDigest = reviewedQuestionPresentationDigest(question);
    if (
      focusedObjectiveIds.includes(question.learningObjectiveId) &&
      !usedPresentationDigests.has(presentationDigest)
    ) {
      questions.push(question);
      usedPresentationDigests.add(presentationDigest);
    }
  }
  if (questions.length !== count) {
    throw new Error("Offline Learning Deck focus is missing reviewed content.");
  }
  return questions;
}

/** @param {ReturnType<typeof getBundledQuestion>} source @param {string} capstoneId */
function createFocusedCapstone(source, capstoneId) {
  const content = normalizeQuestion({
    id: capstoneId,
    prompt: source.prompt,
    choices: source.choices,
    answerId: source.answerId,
    hint: source.hint,
    explanation: source.explanation,
    difficultyBand: source.difficultyBand,
    difficultyRank: source.difficultyRank,
    topicId: source.topicId,
    learningObjectiveId: source.learningObjectiveId
  });
  return normalizeQuestion({
    ...content,
    reviewedRevisionId: createReviewedQuestionRevisionId(
      content,
      "learning-deck"
    )
  });
}

/** @param {Parameters<typeof selectOfflineLearningDeckQuestion>[0]} request @param {Set<string>} used */
function unusedMixedQuestion(request, used) {
  const start = Math.max(0, Math.trunc(request.questionOrdinal));
  const limit = start + used.size + 256;
  for (let ordinal = start; ordinal <= limit; ordinal += 1) {
    const question = getBundledQuestion({
      levelId: request.levelId,
      seed: request.seed,
      wardenId: request.wardenId,
      attempt: 0,
      labyrinthNumber: request.labyrinthNumber,
      questionOrdinal: ordinal,
      challengeKind: request.challengeKind
    });
    if (!used.has(question.id)) {
      return question;
    }
  }
  throw new Error("Offline Mixed Question sequence is exhausted.");
}
