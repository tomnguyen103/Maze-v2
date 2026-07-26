import {
  normalizeLanternJournal,
  reviewedQuestionForId
} from "./lantern-journal.js";
import { getLearningObjective } from "../questions/learning-objectives.js";

const BAND_ORDER = Object.freeze([
  ["foundation", "Foundation"],
  ["developing", "Developing"],
  ["capable", "Capable"],
  ["advanced", "Advanced"],
  ["mastery", "Mastery"]
]);

/** @param {unknown} journal */
export function projectLanternJournal(journal) {
  const normalized = normalizeLanternJournal(journal);
  if (!normalized) {
    throw new Error("Journal projection requires a valid record.");
  }
  /** @type {Map<string, {
   *   topicId: string,
   *   topicLabel: string,
   *   learningObjectiveId: string,
   *   label: string,
   *   difficultyBand: string,
   *   correct: number,
   *   wrong: number,
   *   hint: number,
   *   skip: number,
   *   attempts: number,
   *   practiceQuestionId: string
   * }>} */
  const objectives = new Map();
  for (const event of normalized.events) {
    const definition = getLearningObjective(event.learningObjectiveId);
    if (!definition) {
      continue;
    }
    const key = `${event.difficultyBand}:${event.learningObjectiveId}`;
    const current = objectives.get(key) ?? {
      ...definition,
      difficultyBand: event.difficultyBand,
      correct: 0,
      wrong: 0,
      hint: 0,
      skip: 0,
      attempts: 0,
      practiceQuestionId: ""
    };
    if (event.outcome === "correct") current.correct += 1;
    if (event.outcome === "wrong") current.wrong += 1;
    if (event.outcome === "hint") current.hint += 1;
    if (event.outcome === "skip") current.skip += 1;
    current.attempts += 1;
    if (
      event.outcome === "wrong" ||
      (event.outcome === "skip" && !current.practiceQuestionId)
    ) {
      current.practiceQuestionId = event.questionId;
    }
    objectives.set(key, current);
  }
  return {
    empty: normalized.events.length === 0,
    eventCount: normalized.events.length,
    bands: BAND_ORDER.map(([id, label]) => ({
      id,
      label,
      objectives: [...objectives.values()]
        .filter((objective) => objective.difficultyBand === id)
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((objective) => ({
          ...objective,
          status:
            objective.wrong + objective.skip > objective.correct
              ? "practice-ready"
              : "practiced"
        }))
    })).filter((band) => band.objectives.length > 0)
  };
}

/**
 * @param {{
 *   id: string,
 *   learningObjectiveId: string,
 *   topicId: string,
 *   difficultyBand: string
 * }} triggeringQuestion
 */
export function selectPracticeQuestion(triggeringQuestion) {
  const match = /^(bright|scout|master)-([^-]+)-(\d+)$/.exec(
    triggeringQuestion.id
  );
  const sourceOrdinal = match ? Number(match[3]) : -1;
  if (
    !match ||
    match[2] !== triggeringQuestion.difficultyBand ||
    sourceOrdinal < 0
  ) {
    throw new Error("Practice requires a reviewed bundled Question.");
  }
  for (let offset = 1; offset <= 24; offset += 1) {
    const candidate = reviewedQuestionForId(
      `${match[1]}-${match[2]}-${sourceOrdinal + offset}`
    );
    if (
      candidate &&
      candidate.id !== triggeringQuestion.id &&
      candidate.learningObjectiveId ===
        triggeringQuestion.learningObjectiveId &&
      candidate.topicId === triggeringQuestion.topicId
    ) {
      return candidate;
    }
  }
  throw new Error("No different reviewed Practice Question was available.");
}

/**
 * @param {{ answerId: string, explanation: string }} question
 * @param {string} answerId
 */
export function evaluatePracticeAnswer(question, answerId) {
  const correct = answerId === question.answerId;
  return {
    correct,
    message: correct
      ? "Nice work. You found it."
      : "Good try. Take another look when you are ready.",
    explanation: question.explanation
  };
}
