import { describe, expect, it } from "vitest";
import { getPublishedLearningDeckOption } from "../src/questions/learning-deck-catalog.js";
import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import { getPublishedLearningDeckRevision } from "../src/questions/learning-decks.js";
import { selectOfflineLearningDeckQuestion } from "../src/questions/offline-deck-selection.js";

const NUMBER_TRAIL_REVISION =
  "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105";
const MIXED_TRAIL_REVISION =
  "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92";

describe("offline Learning Deck selection", () => {
  it("matches the server's focused and fallback sequence", () => {
    const region = getPublishedLearningDeckRevision("number-trail")?.regions.find(
      (candidate) =>
        candidate.levelId === "trail-scout" && candidate.regionNumber === 2
    );
    if (!region) {
      throw new Error("Published Number Trail region is missing.");
    }
    /** @type {string[]} */
    const used = [];
    for (let ordinal = 0; ordinal < region.normalQuestions.length; ordinal += 1) {
      const request = {
        learningDeckId: "number-trail",
        learningDeckRevision: NUMBER_TRAIL_REVISION,
        levelId: "trail-scout",
        seed: "OFFLINE-DECK-SELECT",
        wardenId: ordinal,
        attempt: 0,
        labyrinthNumber: region.labyrinthStart,
        questionOrdinal: ordinal,
        challengeKind: /** @type {const} */ ("warden")
      };
      const server = selectReviewedDeckQuestion({
        ...request,
        usedQuestionIds: used
      });
      const client = selectOfflineLearningDeckQuestion(request, used);
      if (!client) {
        throw new Error("Offline focused selector returned no Question.");
      }

      expect(client.question.id).toBe(server.question.id);
      expect(client.question.reviewedRevisionId).toBe(
        server.question.reviewedRevisionId
      );
      used.push(client.question.id);
    }

    const fallbackRequest = {
      learningDeckId: "number-trail",
      learningDeckRevision: NUMBER_TRAIL_REVISION,
      levelId: "trail-scout",
      seed: "OFFLINE-DECK-SELECT",
      wardenId: 0,
      attempt: 0,
      labyrinthNumber: region.labyrinthStart,
      questionOrdinal: used.length,
      challengeKind: /** @type {const} */ ("warden")
    };
    const fallback = selectOfflineLearningDeckQuestion(
      fallbackRequest,
      used
    );
    const serverFallback = selectReviewedDeckQuestion({
      ...fallbackRequest,
      usedQuestionIds: used
    });
    expect(fallback?.source).toBe("mixed-fallback");
    expect(fallback?.question.id).toBe(serverFallback.question.id);
  });

  it("matches the Deck Capstone for a first Gate Warden", () => {
    const request = {
      learningDeckId: "number-trail",
      learningDeckRevision: NUMBER_TRAIL_REVISION,
      levelId: "bright-start",
      seed: "OFFLINE-DECK-CAPSTONE",
      wardenId: 0,
      attempt: 0,
      labyrinthNumber: 4,
      questionOrdinal: 0,
      challengeKind: /** @type {const} */ ("gate-warden")
    };
    const client = selectOfflineLearningDeckQuestion(request, []);
    const server = selectReviewedDeckQuestion({
      ...request,
      usedQuestionIds: []
    });

    expect(client?.source).toBe("capstone");
    expect(client?.question.id).toBe(server.question.id);
    expect(client?.question.reviewedRevisionId).toBe(
      server.question.reviewedRevisionId
    );
  });

  it("matches the server's Mixed Gate Warden selection", () => {
    expect(getPublishedLearningDeckOption("mixed-trail")?.revisionId).toBe(
      MIXED_TRAIL_REVISION
    );
    const request = {
      learningDeckId: "mixed-trail",
      learningDeckRevision: MIXED_TRAIL_REVISION,
      levelId: "bright-start",
      seed: "OFFLINE-MIXED-GATE",
      wardenId: 0,
      attempt: 0,
      labyrinthNumber: 1,
      questionOrdinal: 0,
      challengeKind: /** @type {const} */ ("gate-warden")
    };
    const client = selectOfflineLearningDeckQuestion(request, []);
    const server = selectReviewedDeckQuestion({
      ...request,
      usedQuestionIds: []
    });

    expect(client?.source).toBe("mixed");
    expect(client?.question.id).toBe(server.question.id);
    expect(client?.question.reviewedRevisionId).toBe(
      server.question.reviewedRevisionId
    );
  });

  it("fails closed for a focused Deck revision it cannot reproduce", () => {
    expect(
      selectOfflineLearningDeckQuestion(
        {
          learningDeckId: "number-trail",
          learningDeckRevision: "deck:number-trail:v9:00000000000000000000000000000000",
          levelId: "bright-start",
          seed: "OFFLINE-DECK-INVALID",
          wardenId: 0,
          attempt: 0,
          labyrinthNumber: 1,
          questionOrdinal: 0,
          challengeKind: /** @type {const} */ ("warden")
        },
        []
      )
    ).toBeNull();
  });

  it("selects the Quest II static card family before Deck selection", () => {
    const request = {
      questId: "quest_ii_offline_deck_test_123",
      learningDeckId: "mixed-trail",
      learningDeckRevision: MIXED_TRAIL_REVISION,
      levelId: "bright-start",
      seed: "OFFLINE-QUEST-II-DECK",
      wardenId: 0,
      attempt: 0,
      labyrinthNumber: 1,
      questionOrdinal: 0,
      challengeKind: /** @type {const} */ ("warden")
    };

    const selected = selectOfflineLearningDeckQuestion(request, []);

    expect(selected?.source).toBe("mixed");
    expect(selected?.question.id).toMatch(/^quest-ii-/);
  });
});
