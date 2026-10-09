import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import { normalizeQuestion } from "../src/questions/question-contract.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import {
  getQuestContentPackId,
  QUEST_II_CONTENT_PACK_ID
} from "../src/game/quest-content.js";

export { normalizeQuestion };

/**
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   challengeKind?: "warden" | "gate-warden",
 *   learningDeckId?: string | null,
 *   learningDeckRevision?: string | null,
 *   usedQuestionIds?: readonly string[],
 *   questId?: string
 * }} QuestionRequest
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
 *   echoLens?: ReturnType<typeof normalizeQuestion>["echoLens"]
 * }} WardenQuestion
 * @typedef {{
 *   question: WardenQuestion,
 *   source: "database" | "bundled",
 *   learningDeckSource?: "focused" | "capstone" | "mixed-fallback" | "mixed"
 * }} QuestionResult
 * @typedef {{
 *   publishedQuestion: (lookup: {
 *     levelId: string,
 *     difficultyBand: string,
 *     questionOrdinal: number
 *   }) => Promise<WardenQuestion | null>
 * }} QuestionBank
 */

/**
 * Serves the stored Reviewed Question Revision directly: the published
 * database card when a bank is configured and reachable, otherwise the
 * bundled deck. The service makes no model request.
 *
 * @param {{
 *   questionBank?: QuestionBank | null,
 *   onQuestionBankError?: (error: unknown) => void
 * }} [options]
 */
export function createQuestionService(options = {}) {
  const questionBank = options.questionBank ?? null;
  const onQuestionBankError = options.onQuestionBankError ?? (() => {});

  /**
   * @param {QuestionRequest} request
   * @returns {Promise<QuestionResult>}
   */
  async function resolveReviewedQuestion(request) {
    if (getQuestContentPackId(request.questId) === QUEST_II_CONTENT_PACK_ID) {
      return {
        question: getBundledQuestion(request),
        source: "bundled",
        learningDeckSource: "mixed"
      };
    }
    const selection = selectReviewedDeckQuestion(request);
    const bundled = {
      question: selection.question,
      source: /** @type {const} */ ("bundled"),
      learningDeckSource: selection.source
    };
    // A focused Deck revision is itself the publishing authority for its own
    // content, so the bank never overrides it. Mixed content — including the
    // announced fallback — still reads the bank, or a published edit would
    // reach Mixed Trail Quests and not fallen-back focused ones.
    if (
      !questionBank ||
      request.challengeKind === "gate-warden" ||
      selection.source === "focused" ||
      selection.source === "capstone"
    ) {
      return bundled;
    }
    try {
      const published = await questionBank.publishedQuestion({
        levelId: request.levelId,
        difficultyBand: selection.question.difficultyBand,
        questionOrdinal: request.questionOrdinal
      });
      if (published) {
        return {
          question: published,
          source: "database",
          learningDeckSource: selection.source
        };
      }
    } catch (error) {
      // A database outage degrades to yesterday's content, never to no
      // content: the bundled bank ships in the deployment itself.
      onQuestionBankError(error);
    }
    return bundled;
  }

  return {
    /** @param {QuestionRequest} request */
    getQuestion: resolveReviewedQuestion
  };
}
