import { describe, expect, it } from "vitest";
import {
  createOfflineContentPack,
  createOfflineQuestionSequence
} from "../server/offline-content-pack.js";
import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import { getPublishedLearningDeckOption } from "../src/questions/learning-deck-catalog.js";
import { getPublishedLearningDeckRevision } from "../src/questions/learning-decks.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";

const MIXED_TRAIL_REVISION =
  "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92";

describe("Offline content pack", () => {
  it("resolves only the server-generated reviewed revision ids", () => {
    const pack = createOfflineContentPack("b".repeat(64));

    expect(pack.questionForRevision("scout-foundation-0")).toMatchObject({
      id: "scout-foundation-0",
      topicId: expect.any(String),
      learningObjectiveId: expect.any(String)
    });
    expect(pack.questionForRevision("capstone-trail-scout-foundation")).toMatchObject({
      id: "capstone-trail-scout-foundation"
    });
    expect(pack.questionForRevision("prompt: Which answer?")).toBeNull();
  });

  it("resolves focused Deck revisions instead of substituting Mixed content", () => {
    const revision = getPublishedLearningDeckRevision("number-trail");
    const question = revision?.regions[0]?.normalQuestions[0];
    expect(question).toBeDefined();
    if (!question) {
      throw new Error("The published Number Trail Deck has no first question.");
    }
    if (typeof question.reviewedRevisionId !== "string") {
      throw new Error("The published Deck question has no revision id.");
    }

    const pack = createOfflineContentPack("b".repeat(64));
    expect(pack.questionForRevision(question.id)).toBe(question);
    expect(pack.questionForRevision(question.reviewedRevisionId)).toBe(question);
  });

  it("resolves exact published database revisions supplied for replay", () => {
    const question = {
      id: "database:editorial-card:v3",
      prompt: "Which answer?",
      choices: [
        { id: "a", label: "One" },
        { id: "b", label: "Two" },
        { id: "c", label: "Three" }
      ],
      answerId: "b",
      hint: "Count on.",
      explanation: "Two is correct.",
      difficultyBand: "foundation",
      difficultyRank: 11,
      topicId: "arithmetic",
      learningObjectiveId: "bright-combine-groups",
      reviewedRevisionId: "database:editorial-card:v3"
    };
    const pack = createOfflineContentPack("b".repeat(64), [question]);

    expect(pack.questionForRevision(question.id)).toBe(question);
  });

  it("reconstructs a database overlay in the trusted Mixed sequence", () => {
    const deck = getPublishedLearningDeckOption("mixed-trail");
    expect(deck).toBeDefined();
    if (!deck) {
      throw new Error("The published Mixed Trail Deck is missing.");
    }
    const receipt = {
      seed: "DATABASE-OVERLAY-SEQUENCE",
      levelId: "bright-start",
      labyrinthNumber: 1,
      learningDeckId: deck.deckId,
      learningDeckRevision: deck.revisionId,
      initialQuestionOrdinal: 0,
      initialUsedQuestionIds: []
    };
    const selected = selectReviewedDeckQuestion({
      ...receipt,
      questionOrdinal: 0,
      wardenId: 0,
      attempt: 0,
      challengeKind: "warden",
      usedQuestionIds: []
    });
    expect(selected.source).toBe("mixed");
    const databaseQuestion = {
      ...selected.question,
      id: "database:overlay-card:v3",
      reviewedRevisionId: "database:overlay-card:v3"
    };
    const sequence = createOfflineQuestionSequence(receipt, [
      {
        question: databaseQuestion,
        levelId: receipt.levelId,
        difficultyBand: selected.question.difficultyBand,
        questionOrdinal: 0
      }
    ]);

    expect(sequence?.next({
      challenge: { wardenId: 0, attempt: 0, kind: "warden" }
    })).toBe(databaseQuestion);
  });

  it("reconstructs the receipt-bound Deck sequence, including its Capstone", () => {
    const receipt = {
      seed: "OFFLINE-CONTENT-SEQUENCE",
      levelId: "trail-scout",
      labyrinthNumber: 5,
      learningDeckId: "number-trail",
      learningDeckRevision:
        "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
      initialQuestionOrdinal: 0,
      initialUsedQuestionIds: []
    };
    const sequence = createOfflineQuestionSequence(receipt);
    const published = getPublishedLearningDeckRevision("number-trail");
    const region = published?.regions.find(
      (candidate) =>
        candidate.levelId === receipt.levelId &&
        candidate.labyrinthStart === receipt.labyrinthNumber
    );
    expect(sequence).not.toBeNull();
    expect(region).toBeDefined();
    if (!sequence || !region) {
      throw new Error("The published Deck sequence is missing its region.");
    }

    const capstone = sequence.next({
      challenge: { wardenId: 0, attempt: 0, kind: "gate-warden" }
    });
    expect(capstone?.id).toBe(region.capstoneQuestion.id);
    expect(capstone?.reviewedRevisionId).toBe(
      region.capstoneQuestion.reviewedRevisionId
    );

    const firstNormal = sequence.next({
      challenge: { wardenId: 1, attempt: 0, kind: "warden" }
    });
    expect(firstNormal?.id).toBe(region.normalQuestions[0]?.id);
    const pack = createOfflineContentPack("b".repeat(64));
    expect(pack.questionForRevision(capstone?.reviewedRevisionId ?? "")).toBe(
      region.capstoneQuestion
    );
  });

  it("keeps Quest II receipts on the Quest II reviewed sequence", () => {
    const receipt = {
      questId: "quest_ii_offline_test_123",
      seed: "QUEST-II-OFFLINE",
      levelId: "trail-scout",
      labyrinthNumber: 5,
      learningDeckId: "mixed-trail",
      learningDeckRevision: MIXED_TRAIL_REVISION,
      initialQuestionOrdinal: 0,
      initialUsedQuestionIds: []
    };
    const sequence = createOfflineQuestionSequence(receipt);
    const question = sequence?.next({
      challenge: { wardenId: 0, attempt: 0, kind: "warden" }
    });

    expect(question?.id).toMatch(/^quest-ii-/);
    expect(question?.reviewedRevisionId).toMatch(/^quest-ii:/);
  });

  it("reconstructs Quest II Gate Warden revisions from their canonical scene", () => {
    const pack = createOfflineContentPack("b".repeat(64));
    for (const labyrinthNumber of [1, 5, 9, 13, 17]) {
      const expected = getBundledQuestion({
        questId: "quest_ii_offline_test_123",
        levelId: "trail-scout",
        seed: "QUEST-II-OFFLINE-CAPSTONE",
        wardenId: 0,
        labyrinthNumber,
        questionOrdinal: labyrinthNumber - 1,
        challengeKind: "gate-warden"
      });

      if (typeof expected.reviewedRevisionId !== "string") {
        throw new Error("Expected the Quest II capstone revision id.");
      }
      expect(pack.questionForRevision(expected.reviewedRevisionId)).toEqual(
        expected
      );
    }
  });

  it("normalizes Quest II revision aliases before generated lookup", () => {
    const pack = createOfflineContentPack("b".repeat(64));
    const questions = [
      getBundledQuestion({
        questId: "quest_ii_offline_test_123",
        levelId: "bright-start",
        seed: "QUEST-II-OFFLINE-ALIASES",
        wardenId: 0,
        labyrinthNumber: 1,
        questionOrdinal: 0
      }),
      getBundledQuestion({
        questId: "quest_ii_offline_test_123",
        levelId: "bright-start",
        seed: "QUEST-II-OFFLINE-ALIASES",
        wardenId: 0,
        labyrinthNumber: 1,
        questionOrdinal: 0,
        challengeKind: "gate-warden"
      })
    ];

    for (const question of questions) {
      expect(pack.questionForRevision(question.id)?.id).toBe(question.id);
      expect(pack.questionForRevision(`quest-ii:${question.id}`)?.id).toBe(
        question.id
      );
      expect(pack.questionForRevision(`${question.id}:legacy-suffix`)?.id).toBe(
        question.id
      );
    }
  });
});
