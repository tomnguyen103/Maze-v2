import { getLearningObjective } from "../questions/learning-objectives.js";

/**
 * A Teacher signal needs three or more responses before it can appear. This
 * keeps a small Classroom from turning one Student's practice into a named or
 * diagnostic result.
 */
export const MIN_OBJECTIVE_RESPONSES = 3;

const REVIEWED_ACTIVITY_BY_TOPIC = Object.freeze({
  arithmetic:
    "Solve three fresh examples with a sketch or number line, then explain one step.",
  patterns:
    "Extend three fresh patterns and name the rule that keeps each one moving.",
  language:
    "Use context clues to choose a meaning in three fresh sentences, then explain one clue.",
  "life-science":
    "Sort three living-system examples and explain one connection between parts.",
  geometry:
    "Draw or build three examples and point out the property that makes each one fit.",
  inference:
    "Read three short clues, make a conclusion, and name the clue that supports it.",
  logic:
    "Try three small rule puzzles and explain which rule made one choice fit.",
  fractions:
    "Model three fraction examples and explain how the parts stay equal.",
  "earth-science":
    "Sketch one Earth system, label three connected parts, and explain one change."
});

const COMPLETED_REFLECTION_PROMPTS = Object.freeze([
  "Which clue or choice helped you most during this Expedition?",
  "What will you try first when a new Labyrinth feels tricky?"
]);

const IN_PROGRESS_REFLECTION_PROMPTS = Object.freeze([
  "What helped you keep going in the Labyrinth you just played?",
  "What is one idea you want to try in the next Labyrinth?"
]);

/**
 * Build reviewed, non-diagnostic activity cards from thresholded aggregate
 * objective rows. The returned objects contain no Student identity or raw
 * response data.
 *
 * @param {unknown} progress
 */
export function buildReviewedNextStepCards(progress) {
  if (!Array.isArray(progress)) return [];
  return progress
    .filter((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      const value = /** @type {Record<string, unknown>} */ (row);
      return (
        typeof value.objectiveId === "string" &&
        Number(value.total) >= MIN_OBJECTIVE_RESPONSES
      );
    })
    .map((row) => {
      const value = /** @type {Record<string, unknown>} */ (row);
      const objective = getLearningObjective(String(value.objectiveId));
      if (!objective) return null;
      const activity =
        REVIEWED_ACTIVITY_BY_TOPIC[
          /** @type {keyof typeof REVIEWED_ACTIVITY_BY_TOPIC} */ (
            objective.topicId
          )
        ];
      if (!activity) return null;
      return {
        objectiveId: objective.learningObjectiveId,
        topicLabel: objective.topicLabel,
        label: objective.label,
        title: `Try next: ${objective.label}`,
        activity
      };
    })
    .filter((card) => card !== null);
}

/**
 * Prompts stay in the Student's local Classroom card. No response field is
 * created, stored, or sent to a Teacher API.
 *
 * @param {{ escapedCount?: unknown, regionComplete?: unknown }} progress
 */
export function buildPrivateReflectionPrompts(progress = {}) {
  const parsedEscapedCount = Number(progress.escapedCount);
  const escapedCount = Number.isFinite(parsedEscapedCount)
    ? parsedEscapedCount
    : 0;
  const complete =
    progress.regionComplete === true || escapedCount >= 4;
  if (escapedCount < 1 && !complete) return [];
  return [...(complete
    ? COMPLETED_REFLECTION_PROMPTS
    : IN_PROGRESS_REFLECTION_PROMPTS)];
}
