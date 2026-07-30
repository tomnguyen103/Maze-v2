import { normalizeQuestion } from "./question-contract.js";
import { reviewedContentDigest } from "./reviewed-content-hash.js";

/**
 * Keep the exact Reviewed Question Revision contract in one place. Both the
 * bundled Mixed source and focused Learning Deck content use this digest.
 *
 * @param {unknown} rawQuestion
 * @param {unknown} [echoLens]
 */
export function reviewedQuestionContentDigest(
  rawQuestion,
  echoLens = undefined
) {
  const question = normalizeQuestion(rawQuestion);
  return reviewedContentDigest({
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
    answerId: question.answerId,
    hint: question.hint,
    explanation: question.explanation,
    difficultyBand: question.difficultyBand,
    difficultyRank: question.difficultyRank,
    topicId: question.topicId,
    learningObjectiveId: question.learningObjectiveId,
    echoLens: echoLens === undefined ? question.echoLens ?? null : echoLens
  });
}

/**
 * This digest deliberately excludes IDs and difficulty metadata. It proves
 * that a coverage count contains distinct child-visible reviewed content,
 * rather than one card relabeled several times.
 *
 * @param {unknown} rawQuestion
 */
export function reviewedQuestionPresentationDigest(rawQuestion) {
  const question = normalizeQuestion(rawQuestion);
  const correctLabel = question.choices.find(
    (choice) => choice.id === question.answerId
  )?.label;
  return reviewedContentDigest({
    prompt: question.prompt,
    choiceLabels: question.choices.map(({ label }) => label).sort(),
    correctLabel,
    hint: question.hint,
    explanation: question.explanation,
    echoLens: question.echoLens ?? null
  });
}

/**
 * @param {unknown} rawQuestion
 * @param {"bundled" | "learning-deck"} namespace
 * @param {unknown} [echoLens]
 */
export function createReviewedQuestionRevisionId(
  rawQuestion,
  namespace,
  echoLens = undefined
) {
  const question = normalizeQuestion(rawQuestion);
  return (
    `${namespace}:${question.id}:` +
    reviewedQuestionContentDigest(question, echoLens)
  );
}
