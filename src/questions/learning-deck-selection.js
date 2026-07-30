import { getBundledQuestion } from "./question-bank.js";
import { getPublishedLearningDeckRevision } from "./learning-decks.js";

/**
 * @typedef {import("./question-contract.js").WardenQuestion} WardenQuestion
 * @typedef {{
 *   question: WardenQuestion,
 *   source: "focused" | "capstone" | "mixed-fallback" | "mixed"
 * }} DeckSelection
 */

/**
 * Focused Decks publish a finite reviewed pool per Region, deliberately
 * smaller than that Region's correct-first demand. A Quest therefore spends
 * the pool and continues on unused Mixed Trail content at the same Level and
 * Difficulty Band — announced once, and never repeating a Quest Question.
 *
 * This runs server-side only. Importing it from the game bundle would pull
 * every published Deck's reviewed content past the bundle budget.
 *
 * @param {{
 *   learningDeckId?: string | null,
 *   learningDeckRevision?: string | null,
 *   levelId: string,
 *   seed?: string,
 *   wardenId?: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   challengeKind?: "warden" | "gate-warden",
 *   attempt?: number,
 *   usedQuestionIds?: readonly string[]
 * }} request
 * @returns {DeckSelection}
 */
export function selectReviewedDeckQuestion(request) {
  const challengeKind = request.challengeKind ?? "warden";
  const used = new Set(request.usedQuestionIds ?? []);
  const mixed = () => ({
    question: getBundledQuestion({
      levelId: request.levelId,
      seed: request.seed ?? "",
      wardenId: request.wardenId ?? 0,
      attempt: 0,
      labyrinthNumber: request.labyrinthNumber,
      questionOrdinal: request.questionOrdinal,
      challengeKind
    }),
    source: /** @type {"mixed"} */ ("mixed")
  });

  const revision = request.learningDeckId
    ? getPublishedLearningDeckRevision(
        request.learningDeckId,
        request.learningDeckRevision ?? undefined
      )
    : null;
  if (!revision || revision.kind !== "focused") {
    return mixed();
  }
  const region = revision.regions.find(
    (candidate) =>
      candidate.levelId === request.levelId &&
      request.labyrinthNumber >= candidate.labyrinthStart &&
      request.labyrinthNumber <= candidate.labyrinthEnd
  );
  if (!region) {
    return mixed();
  }

  // A Gate Warden opens on the Deck's matched Capstone. A retry has already
  // spent it, so the Explorer continues on the same reviewed Region pool
  // rather than seeing the Capstone twice.
  if (challengeKind === "gate-warden" && !used.has(region.capstoneQuestion.id)) {
    return { question: region.capstoneQuestion, source: "capstone" };
  }
  const focused = region.normalQuestions.find(
    (question) => !used.has(question.id)
  );
  if (focused) {
    return { question: focused, source: "focused" };
  }
  return {
    question: unusedMixedQuestion(request, used),
    source: "mixed-fallback"
  };
}

/**
 * The Mixed sequence is unbounded, so walking forward from the requested
 * ordinal always reaches content this Quest has not spent. The walk is capped
 * so a corrupt used-set can never spin.
 *
 * @param {{
 *   levelId: string,
 *   seed?: string,
 *   wardenId?: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number
 * }} request
 * @param {Set<string>} used
 */
function unusedMixedQuestion(request, used) {
  const start = Math.max(0, Math.trunc(request.questionOrdinal));
  const limit = start + used.size + 256;
  let fallback = getBundledQuestion({
    levelId: request.levelId,
    seed: "",
    wardenId: 0,
    attempt: 0,
    labyrinthNumber: request.labyrinthNumber,
    questionOrdinal: start,
    challengeKind: "warden"
  });
  for (let ordinal = start; ordinal <= limit; ordinal += 1) {
    const question = getBundledQuestion({
      levelId: request.levelId,
      seed: request.seed ?? "",
      wardenId: request.wardenId ?? 0,
      attempt: 0,
      labyrinthNumber: request.labyrinthNumber,
      questionOrdinal: ordinal,
      // The Capstone is Deck-matched, so a Gate Warden that falls through to
      // Mixed content asks an ordinary reviewed Question at the same Band.
      challengeKind: "warden"
    });
    if (!used.has(question.id)) {
      return question;
    }
  }
  // Never strand a legal demand. The walk spans more ordinals than a Quest can
  // spend, so reaching here means the ledger is corrupt rather than full; the
  // Explorer still gets reviewed content at the right Level and Band.
  return fallback;
}
