import { describe, expect, it } from "vitest";
import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import {
  getPublishedLearningDeckRevision,
  getPublishedLearningDeckRevisions
} from "../src/questions/learning-decks.js";
import { getDifficultyBand } from "../src/questions/quest-levels.js";

const FOCUSED_DECKS = getPublishedLearningDeckRevisions().filter(
  (revision) => revision.kind === "focused"
);
const LEVEL_IDS = ["bright-start", "trail-scout", "maze-master"];

/**
 * @param {string} deckId
 * @param {string} levelId
 * @param {number} regionNumber
 */
function regionOf(deckId, levelId, regionNumber) {
  const revision = getPublishedLearningDeckRevision(deckId);
  const region = revision?.regions.find(
    (candidate) =>
      candidate.levelId === levelId &&
      candidate.regionNumber === regionNumber
  );
  if (!region) {
    throw new Error(`Missing region ${levelId}/${regionNumber}`);
  }
  return region;
}

describe("focused Learning Deck selection", () => {
  it("serves the Region's focused Questions before anything else", () => {
    const region = regionOf("number-trail", "bright-start", 1);
    /** @type {string[]} */
    const used = [];

    for (const expected of region.normalQuestions) {
      const selection = selectReviewedDeckQuestion({
        learningDeckId: "number-trail",
        levelId: "bright-start",
        labyrinthNumber: 1,
        questionOrdinal: used.length,
        challengeKind: "warden",
        attempt: 0,
        usedQuestionIds: used
      });

      expect(selection.source).toBe("focused");
      expect(selection.question.id).toBe(expected.id);
      used.push(selection.question.id);
    }
  });

  it("announces one Mixed Trail fallback once focused capacity is spent", () => {
    const region = regionOf("word-trail", "trail-scout", 3);
    const used = region.normalQuestions.map((question) => question.id);

    const selection = selectReviewedDeckQuestion({
      learningDeckId: "word-trail",
      levelId: "trail-scout",
      labyrinthNumber: region.labyrinthStart,
      questionOrdinal: used.length,
      challengeKind: "warden",
      attempt: 0,
      usedQuestionIds: used
    });

    expect(selection.source).toBe("mixed-fallback");
    expect(used).not.toContain(selection.question.id);
    expect(selection.question.difficultyBand).toBe(region.bandId);
  });

  it("opens a Gate Warden with the Deck's matched Capstone", () => {
    const region = regionOf("nature-trail", "maze-master", 5);

    const selection = selectReviewedDeckQuestion({
      learningDeckId: "nature-trail",
      levelId: "maze-master",
      labyrinthNumber: region.labyrinthEnd,
      questionOrdinal: 3,
      challengeKind: "gate-warden",
      attempt: 0,
      usedQuestionIds: []
    });

    expect(selection.source).toBe("capstone");
    expect(selection.question.id).toBe(region.capstoneQuestion.id);
  });

  it("keeps Gate Warden retries reviewed and unique", () => {
    const region = regionOf("number-trail", "trail-scout", 2);

    const retry = selectReviewedDeckQuestion({
      learningDeckId: "number-trail",
      levelId: "trail-scout",
      labyrinthNumber: region.labyrinthEnd,
      questionOrdinal: 4,
      challengeKind: "gate-warden",
      attempt: 1,
      usedQuestionIds: [region.capstoneQuestion.id]
    });

    expect(retry.question.id).not.toBe(region.capstoneQuestion.id);
    expect(retry.question.reviewedRevisionId).toBeTruthy();
  });

  it("leaves Mixed Trail on the unbounded reviewed sequence", () => {
    const selection = selectReviewedDeckQuestion({
      learningDeckId: "mixed-trail",
      levelId: "bright-start",
      labyrinthNumber: 2,
      questionOrdinal: 5,
      challengeKind: "warden",
      attempt: 0,
      usedQuestionIds: []
    });

    expect(selection.source).toBe("mixed");
  });

  // The authored pools are deliberately smaller than the correct-first demand
  // in every Region, so a full Quest always outruns focused capacity. This is
  // the adversarial demand simulation: every legal Question of a whole Quest,
  // at every Level, for every focused Deck.
  it.each(
    FOCUSED_DECKS.flatMap((deck) =>
      LEVEL_IDS.map((levelId) => [deck.deckId, levelId])
    )
  )("never repeats a Question across a full %s Quest at %s", (deckId, levelId) => {
    /** @type {string[]} */
    const used = [];
    let fallbacks = 0;
    let questionOrdinal = 0;

    for (let labyrinthNumber = 1; labyrinthNumber <= 20; labyrinthNumber += 1) {
      const band = getDifficultyBand(labyrinthNumber);
      // Four demands per Labyrinth plus a Gate Warden and one retry: more
      // legal Questions than any real Run spends.
      for (let demand = 0; demand < 4; demand += 1) {
        const selection = selectReviewedDeckQuestion({
          learningDeckId: deckId,
          levelId,
          labyrinthNumber,
          questionOrdinal,
          challengeKind: "warden",
          attempt: demand,
          usedQuestionIds: used
        });
        expect(used).not.toContain(selection.question.id);
        expect(selection.question.difficultyBand).toBe(band.id);
        expect(selection.question.reviewedRevisionId).toBeTruthy();
        if (selection.source === "mixed-fallback") {
          fallbacks += 1;
        }
        used.push(selection.question.id);
        questionOrdinal += 1;
      }
      for (const attempt of [0, 1]) {
        const gate = selectReviewedDeckQuestion({
          learningDeckId: deckId,
          levelId,
          labyrinthNumber,
          questionOrdinal,
          challengeKind: "gate-warden",
          attempt,
          usedQuestionIds: used
        });
        expect(used).not.toContain(gate.question.id);
        used.push(gate.question.id);
        questionOrdinal += 1;
      }
    }

    expect(used).toHaveLength(new Set(used).size);
    expect(fallbacks).toBeGreaterThan(0);
  });
});
