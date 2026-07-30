import { isLearningMetadata } from "./learning-objectives.js";
import { normalizeEchoLens } from "./echo-lens.js";

/**
 * @typedef {{
 *   id: string,
 *   prompt: string,
 *   choices: { id: string, label: string }[],
 *   answerId: string,
 *   hint: string,
 *   explanation: string,
 *   difficultyBand: string,
 *   difficultyRank: number,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   reviewedRevisionId?: string,
 *   echoLens?: ReturnType<typeof normalizeEchoLens>
 * }} WardenQuestion
 */

/** @param {unknown} value @param {string} name @param {number} maxLength */
function requiredText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Question ${name} must be text.`);
  }

  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`Question ${name} is too long.`);
  }

  return text;
}

/**
 * @param {unknown} rawQuestion
 * @param {string} [fallbackId]
 * @returns {WardenQuestion}
 */
export function normalizeQuestion(
  rawQuestion,
  fallbackId = "generated-question"
) {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    throw new Error("Question must be an object.");
  }
  const raw = /** @type {Record<string, unknown>} */ (rawQuestion);
  if (!Array.isArray(raw.choices) || raw.choices.length !== 3) {
    throw new Error("Question must have exactly three choices.");
  }

  const choices = raw.choices.map((choice) => {
    if (!choice || typeof choice !== "object") {
      throw new Error("Each Question choice must be an object.");
    }
    const candidate = /** @type {Record<string, unknown>} */ (choice);

    return {
      id: requiredText(candidate.id, "choice id", 12),
      label: requiredText(candidate.label, "choice label", 80)
    };
  });
  const choiceIds = choices.map((choice) => choice.id);
  if (new Set(choiceIds).size !== choiceIds.length) {
    throw new Error("Question choice ids must be unique.");
  }

  const answerId = requiredText(raw.answerId, "answer", 12);
  if (!choiceIds.includes(answerId)) {
    throw new Error("Question answer must match a choice.");
  }
  const prompt = requiredText(raw.prompt, "prompt", 240);
  if (/(?:^|\n)\s*[abc][).:]\s/iu.test(prompt)) {
    throw new Error("Question prompt must not repeat the answer choices.");
  }
  const hint = requiredText(raw.hint, "hint", 120);
  const explanation = requiredText(raw.explanation, "explanation", 240);
  const difficultyBand = requiredText(
    raw.difficultyBand,
    "difficulty band",
    20
  );
  if (
    !["foundation", "developing", "capable", "advanced", "mastery"].includes(
      difficultyBand
    )
  ) {
    throw new Error("Question difficulty band is not supported.");
  }
  const difficultyRank = Number(raw.difficultyRank);
  if (
    !Number.isInteger(difficultyRank) ||
    difficultyRank < 1 ||
    difficultyRank > 99
  ) {
    throw new Error("Question difficulty rank is not valid.");
  }
  const topicId = requiredText(raw.topicId, "topic id", 40);
  const learningObjectiveId = requiredText(
    raw.learningObjectiveId,
    "learning objective id",
    80
  );
  if (!isLearningMetadata(topicId, learningObjectiveId)) {
    throw new Error("Question learning metadata is not reviewed.");
  }
  const childFacingText = [
    prompt,
    hint,
    explanation,
    ...choices.map((choice) => choice.label)
  ].join(" ");
  if (
    /\b(?:alcohol|blood|drug|gun|hate|kill|murder|nude|racist|sex|suicide|weapon)\b/iu.test(
      childFacingText
    ) ||
    /\b(?:your address|your name|your password|your phone|where do you live)\b/iu.test(
      childFacingText
    )
  ) {
    throw new Error("Question did not pass kid-safe content checks.");
  }
  const reviewedRevisionId =
    typeof raw.reviewedRevisionId === "string"
      ? raw.reviewedRevisionId.trim()
      : "";
  if (
    reviewedRevisionId &&
    !/^[a-z0-9][a-z0-9._:-]{5,119}$/iu.test(reviewedRevisionId)
  ) {
    throw new Error("Question reviewed revision is not valid.");
  }
  if (raw.echoLens !== undefined && !reviewedRevisionId) {
    throw new Error("Echo Lens requires an exact Reviewed Question Revision.");
  }
  const echoLens =
    raw.echoLens === undefined ? undefined : normalizeEchoLens(raw.echoLens);

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : fallbackId,
    prompt,
    choices,
    answerId,
    hint,
    difficultyBand,
    difficultyRank,
    topicId,
    learningObjectiveId,
    explanation,
    ...(reviewedRevisionId ? { reviewedRevisionId } : {}),
    ...(echoLens ? { echoLens } : {})
  };
}
