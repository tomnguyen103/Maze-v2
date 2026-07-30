import { reviewedContentDigest } from "../questions/reviewed-content-hash.js";
import {
  LEARNING_OBJECTIVE_IDS,
  getLearningObjective
} from "../questions/learning-objectives.js";
import { reviewedQuestionForId } from "./lantern-journal.js";

const LEVEL_PREFIX = Object.freeze({
  "bright-start": "bright",
  "trail-scout": "scout",
  "maze-master": "master"
});
const DIFFICULTY_BANDS = new Set([
  "foundation",
  "developing",
  "capable",
  "advanced",
  "mastery"
]);
const RESOLUTION_OUTCOMES = new Set(["correct", "wrong", "skip"]);
const REQUIRED_QUESTION_COUNT = 3;
const OPTIONAL_QUESTION_COUNT = 2;
const TRAIL_QUESTION_COUNT =
  REQUIRED_QUESTION_COUNT + OPTIONAL_QUESTION_COUNT;

/**
 * @typedef {Readonly<{
 *   levelId: string,
 *   difficultyBand: string,
 *   topicId: string,
 *   topicLabel: string,
 *   learningObjectiveId: string,
 *   objectiveLabel: string,
 *   revision: string,
 *   requiredQuestionCount: number,
 *   optionalQuestionCount: number,
 *   questions: readonly ReturnType<
 *     typeof import("../questions/question-bank.js").getBundledQuestion
 *   >[]
 * }>} LanternTrail
 */

/**
 * @typedef {Readonly<{
 *   trail: LanternTrail,
 *   index: number,
 *   hintUsed: boolean,
 *   outcome: "" | "correct" | "wrong" | "skip",
 *   requiredComplete: boolean,
 *   complete: boolean
 * }>} LanternTrailSession
 */

/**
 * @param {{ levelId: string, difficultyBand: string }} selection
 */
export function listLanternTrailObjectives({ levelId, difficultyBand }) {
  const prefix =
    LEVEL_PREFIX[/** @type {keyof typeof LEVEL_PREFIX} */ (levelId)];
  if (!prefix || !DIFFICULTY_BANDS.has(difficultyBand)) {
    throw new Error("Lantern Trail catalog selection is invalid.");
  }
  return LEARNING_OBJECTIVE_IDS.filter((objectiveId) =>
    objectiveId.startsWith(`${prefix}-`)
  ).map((objectiveId) => {
    const objective = getLearningObjective(objectiveId);
    if (!objective) {
      throw new Error("Lantern Trail objective is unavailable.");
    }
    return Object.freeze({ ...objective });
  });
}

/**
 * @param {{
 *   levelId: string,
 *   difficultyBand: string,
 *   learningObjectiveId: string
 * }} selection
 * @returns {LanternTrail}
 */
export function createLanternTrail({
  levelId,
  difficultyBand,
  learningObjectiveId
}) {
  const prefix =
    LEVEL_PREFIX[/** @type {keyof typeof LEVEL_PREFIX} */ (levelId)];
  const objectives = listLanternTrailObjectives({ levelId, difficultyBand });
  const objectiveIndex = objectives.findIndex(
    (objective) => objective.learningObjectiveId === learningObjectiveId
  );
  if (!prefix || objectiveIndex < 0) {
    throw new Error("Lantern Trail objective does not match the Quest Level.");
  }

  const questions = Array.from({ length: TRAIL_QUESTION_COUNT }, (_, index) => {
    const ordinal = objectiveIndex + (index + 1) * objectives.length;
    const question = reviewedQuestionForId(
      `${prefix}-${difficultyBand}-${ordinal}`
    );
    if (
      !question ||
      question.learningObjectiveId !== learningObjectiveId ||
      question.difficultyBand !== difficultyBand ||
      typeof question.reviewedRevisionId !== "string"
    ) {
      throw new Error("Lantern Trail requires five reviewed Question revisions.");
    }
    return question;
  });
  if (
    new Set(questions.map((question) => question.id)).size !==
      TRAIL_QUESTION_COUNT ||
    new Set(questions.map((question) => question.prompt)).size !==
      TRAIL_QUESTION_COUNT
  ) {
    throw new Error("Lantern Trail Questions must be distinct.");
  }

  const objective = objectives[objectiveIndex];
  const revision = reviewedContentDigest(
    questions.map((question) => question.reviewedRevisionId)
  );
  return Object.freeze({
    levelId,
    difficultyBand,
    topicId: objective.topicId,
    topicLabel: objective.topicLabel,
    learningObjectiveId,
    objectiveLabel: objective.label,
    revision: `bundled-lantern-trail-v1:${revision}`,
    requiredQuestionCount: REQUIRED_QUESTION_COUNT,
    optionalQuestionCount: OPTIONAL_QUESTION_COUNT,
    questions: Object.freeze(questions)
  });
}

/**
 * @param {LanternTrail} trail
 * @returns {LanternTrailSession}
 */
export function createLanternTrailSession(trail) {
  if (
    !trail ||
    trail.questions.length !== TRAIL_QUESTION_COUNT ||
    trail.requiredQuestionCount !== REQUIRED_QUESTION_COUNT ||
    trail.optionalQuestionCount !== OPTIONAL_QUESTION_COUNT
  ) {
    throw new Error("Lantern Trail session requires a reviewed five-Question Trail.");
  }
  return sessionState(trail, 0);
}

/**
 * @param {LanternTrailSession} session
 * @returns {LanternTrailSession}
 */
export function recordLanternTrailHint(session) {
  if (session.complete || session.outcome || session.hintUsed) {
    return session;
  }
  return Object.freeze({ ...session, hintUsed: true });
}

/**
 * @param {LanternTrailSession} session
 * @param {string} outcome
 * @returns {LanternTrailSession}
 */
export function resolveLanternTrailQuestion(session, outcome) {
  if (!RESOLUTION_OUTCOMES.has(outcome)) {
    throw new Error("Lantern Trail outcome must be correct, wrong, or skip.");
  }
  if (session.complete || session.outcome) {
    return session;
  }
  return Object.freeze({
    ...session,
    outcome: /** @type {"correct" | "wrong" | "skip"} */ (outcome),
    requiredComplete: session.index >= REQUIRED_QUESTION_COUNT - 1
  });
}

/**
 * @param {LanternTrailSession} session
 * @param {{ keepPracticing?: boolean }} [choice]
 * @returns {LanternTrailSession}
 */
export function continueLanternTrail(
  session,
  { keepPracticing = false } = {}
) {
  if (session.complete) {
    return session;
  }
  if (!session.outcome) {
    throw new Error("Resolve the current Practice Lantern before continuing.");
  }
  if (session.index < REQUIRED_QUESTION_COUNT - 1) {
    return sessionState(session.trail, session.index + 1);
  }
  if (
    keepPracticing &&
    session.index < session.trail.questions.length - 1
  ) {
    return sessionState(session.trail, session.index + 1);
  }
  return Object.freeze({ ...session, complete: true });
}

/**
 * @param {LanternTrail} trail
 * @param {number} index
 * @returns {LanternTrailSession}
 */
function sessionState(trail, index) {
  return Object.freeze({
    trail,
    index,
    hintUsed: false,
    outcome: "",
    requiredComplete: false,
    complete: false
  });
}
