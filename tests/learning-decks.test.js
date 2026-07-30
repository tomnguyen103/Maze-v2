import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "../src/questions/question-contract.js";
import {
  getCorrectFirstDemandReport,
  getLearningDeckCoverageReport,
  getPublishedLearningDeckRevision,
  getPublishedLearningDeckRevisions,
  validateLearningDeckRevision
} from "../src/questions/learning-decks.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";
import { reviewedQuestionCoreDigest } from "../src/questions/reviewed-question-revision.js";
import {
  createReviewedQuestionRevisionId,
  reviewedQuestionPresentationDigest
} from "../src/questions/reviewed-question-revision.js";

const LEVEL_TOTALS = /** @type {Readonly<Record<string, number>>} */ (
  Object.freeze({
    "bright-start": 36,
    "trail-scout": 56,
    "maze-master": 88
  })
);

describe("published Learning Deck revisions", () => {
  it("derives correct-first demand from all five Regions at every Quest Level", () => {
    const report = getCorrectFirstDemandReport();

    expect(report).toHaveLength(3);
    for (const level of report) {
      expect(level.regions).toHaveLength(5);
      expect(
        level.regions.reduce(
          (total, region) => total + region.correctFirstDemand,
          0
        )
      ).toBe(LEVEL_TOTALS[level.levelId]);
      for (const region of level.regions) {
        expect(region.minimumFocusedQuestions).toBe(
          Math.ceil(region.correctFirstDemand * 0.7)
        );
      }
    }
  });

  it("publishes exactly four immutable revision identities", () => {
    const revisions = getPublishedLearningDeckRevisions();
    const options = getPublishedLearningDeckOptions();

    expect(
      revisions.map(({ deckId, label }) => [deckId, label])
    ).toEqual([
      ["mixed-trail", "Mixed Trail"],
      ["number-trail", "Number Trail"]
    ]);
    expect(
      options.map(({ deckId, label, revisionId }) => ({
        deckId,
        label,
        revisionId
      }))
    ).toEqual(
      revisions.map(({ deckId, label, revisionId }) => ({
        deckId,
        label,
        revisionId
      }))
    );
    for (const revision of revisions) {
      expect(revision.status).toBe("published");
      expect(revision.revisionId).toMatch(
        new RegExp(`^deck:${revision.deckId}:v1:[a-f0-9]{32}$`)
      );
      expect(Object.isFrozen(revision)).toBe(true);
      expect(Object.isFrozen(revision.regions)).toBe(true);
      expect(
        getPublishedLearningDeckRevision(
          revision.deckId,
          revision.revisionId
        )
      ).toBe(revision);
      expect(
        getPublishedLearningDeckRevision(
          revision.deckId,
          `${revision.revisionId}-draft`
        )
      ).toBeNull();
    }
  });

  it("clears every focused coverage and deck-matched Capstone gate", () => {
    const focusedRevisions = getPublishedLearningDeckRevisions().filter(
      ({ kind }) => kind === "focused"
    );

    expect(focusedRevisions).toHaveLength(1);
    for (const revision of focusedRevisions) {
      expect(revision.regions).toHaveLength(15);
      expect(validateLearningDeckRevision(revision)).toBe(true);
      for (const region of revision.regions) {
        expect(region.normalQuestions.length).toBeGreaterThanOrEqual(
          region.minimumFocusedQuestions
        );
        expect(
          new Set(region.normalQuestions.map(({ id }) => id)).size
        ).toBe(region.normalQuestions.length);
        for (const question of region.normalQuestions) {
          expect(normalizeQuestion(question)).toEqual(question);
          expect(question.difficultyBand).toBe(region.bandId);
          expect(region.focusedObjectiveIds).toContain(
            question.learningObjectiveId
          );
          expect(question.reviewedRevisionId).toMatch(
            /^bundled:[a-z0-9-]+:[a-f0-9]{32}$/
          );
        }

        expect(normalizeQuestion(region.capstoneQuestion)).toEqual(
          region.capstoneQuestion
        );
        expect(region.capstoneQuestion.id).toBe(
          `capstone-${revision.deckId}-${region.levelId}-${region.bandId}`
        );
        expect(region.capstoneQuestion.difficultyBand).toBe(region.bandId);
        expect(region.focusedObjectiveIds).toContain(
          region.capstoneQuestion.learningObjectiveId
        );
        expect(region.capstoneQuestion.reviewedRevisionId).toMatch(
          /^learning-deck:[a-z0-9-]+:[a-f0-9]{32}$/
        );
      }
      for (const levelId of Object.keys(LEVEL_TOTALS)) {
        const questions = revision.regions
          .filter((region) => region.levelId === levelId)
          .flatMap((region) => [
            ...region.normalQuestions,
            region.capstoneQuestion
          ]);
        expect(
          new Set(
            questions.map((question) =>
              reviewedQuestionPresentationDigest(question)
            )
          ).size
        ).toBe(questions.length);
      }
    }
  });

  it("keeps Mixed Trail unbounded while publishing all fifteen reviewed Capstones", () => {
    const mixed = getPublishedLearningDeckRevision("mixed-trail");

    expect(mixed).not.toBeNull();
    expect(mixed?.kind).toBe("mixed");
    expect(mixed?.normalQuestionSource).toBe("unbounded-reviewed-mixed");
    expect(mixed?.regions).toHaveLength(15);
    expect(validateLearningDeckRevision(mixed)).toBe(true);
    for (const region of mixed?.regions ?? []) {
      expect(region.normalQuestions).toEqual([]);
      expect(region.capstoneQuestion.id).toBe(
        `capstone-${region.levelId}-${region.bandId}`
      );
      expect(normalizeQuestion(region.capstoneQuestion)).toEqual(
        region.capstoneQuestion
      );
    }
  });

  it("rejects deficient focused coverage and Capstone fixtures", () => {
    const published = getPublishedLearningDeckRevision("number-trail");
    if (!published) {
      throw new Error("Published Number Trail fixture is missing.");
    }

    const deficientCoverage = /** @type {any} */ (
      structuredClone(published)
    );
    deficientCoverage.regions[0].normalQuestions.pop();
    expect(() =>
      validateLearningDeckRevision(deficientCoverage)
    ).toThrow(/70% focused coverage/);

    const missingCapstone = /** @type {any} */ (
      structuredClone(published)
    );
    missingCapstone.regions[0].capstoneQuestion = null;
    expect(() =>
      validateLearningDeckRevision(missingCapstone)
    ).toThrow(/deck-matched Capstone/);

    const wrongObjective = /** @type {any} */ (
      structuredClone(published)
    );
    wrongObjective.regions[0].capstoneQuestion = {
      ...wrongObjective.regions[0].capstoneQuestion,
      learningObjectiveId: "bright-word-meaning",
      topicId: "language"
    };
    expect(() =>
      validateLearningDeckRevision(wrongObjective)
    ).toThrow(/deck-matched Capstone/);
  });

  it("does not count relabeled copies as distinct focused content", () => {
    const published = getPublishedLearningDeckRevision("number-trail");
    if (!published) {
      throw new Error("Published Number Trail fixture is missing.");
    }
    const duplicateContent = /** @type {any} */ (
      structuredClone(published)
    );
    const source = duplicateContent.regions[0].normalQuestions[0];
    const replaced = duplicateContent.regions[0].normalQuestions[1];
    const renamedChoices = [...source.choices]
      .reverse()
      .map((choice, index) => ({
        id: `choice-${index}`,
        label: choice.label,
        wasAnswer: choice.id === source.answerId
      }));
    const renamedAnswer = renamedChoices.find(
      ({ wasAnswer }) => wasAnswer
    );
    if (!renamedAnswer) {
      throw new Error("Reviewed answer fixture is missing.");
    }
    const relabeled = {
      ...source,
      id: replaced.id,
      choices: renamedChoices.map(({ id, label }) => ({ id, label })),
      answerId: renamedAnswer.id
    };
    relabeled.reviewedRevisionId = createReviewedQuestionRevisionId(
      relabeled,
      "bundled"
    );
    duplicateContent.regions[0].normalQuestions[1] = relabeled;

    expect(() =>
      validateLearningDeckRevision(duplicateContent)
    ).toThrow(/distinct reviewed content/);
  });

  it("rejects undeclared revision, Region, and Question fields", () => {
    const published = getPublishedLearningDeckRevision("number-trail");
    if (!published) {
      throw new Error("Published Number Trail fixture is missing.");
    }

    const revisionExtra = /** @type {any} */ (structuredClone(published));
    revisionExtra.draftNotes = "not published";
    expect(() =>
      validateLearningDeckRevision(revisionExtra)
    ).toThrow(/undeclared fields/);

    const regionExtra = /** @type {any} */ (structuredClone(published));
    regionExtra.regions[0].studentId = "not allowed";
    expect(() =>
      validateLearningDeckRevision(regionExtra)
    ).toThrow(/undeclared fields/);

    const questionExtra = /** @type {any} */ (structuredClone(published));
    questionExtra.regions[0].normalQuestions[0].answerTranscript =
      "not allowed";
    expect(() =>
      validateLearningDeckRevision(questionExtra)
    ).toThrow(/undeclared fields/);
  });

  it("produces a publication report reusable without child content", () => {
    const report = getLearningDeckCoverageReport();

    expect(report).toHaveLength(2);
    expect(report.every(({ status }) => status === "published")).toBe(true);
    expect(
      report
        .filter(({ kind }) => kind === "focused")
        .every(({ regions }) =>
          regions.every(
            ({ focusedQuestionCount, minimumFocusedQuestions, hasCapstone }) =>
              focusedQuestionCount >= minimumFocusedQuestions && hasCapstone
          )
        )
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain("prompt");
    expect(JSON.stringify(report)).not.toContain("answerId");
  });

  it("measures how much distinct focused content each Deck actually publishes", () => {
    // A published pool counts renamed cards as separate Questions: the bundled
    // generator frames one card many ways ("Bea opens…", "Devi opens…"), and
    // the publish gate hashes the prompt, so a reskin passes as new content.
    // This test measures the answer-bearing content instead, so the real
    // figure is visible and cannot quietly get worse.
    const measured = getPublishedLearningDeckRevisions()
      .filter(({ kind }) => kind === "focused")
      .map((revision) => ({
        deckId: revision.deckId,
        minDistinctPerRegion: Math.min(
          ...revision.regions.map(
            (region) =>
              new Set(
                region.normalQuestions.map((question) =>
                  reviewedQuestionCoreDigest(question)
                )
              ).size
          )
        )
      }));

    // A published focused Deck must carry real focused content, not one
    // reviewed card reskinned. Word Trail and Nature Trail were withheld from
    // the roster for failing exactly this; see issue #122.
    expect(measured).toEqual([
      { deckId: "number-trail", minDistinctPerRegion: 3 }
    ]);
    for (const deck of measured) {
      expect(deck.minDistinctPerRegion).toBeGreaterThanOrEqual(3);
    }
  });

  it("clears every focused Region and Capstone coverage gate", () => {
    const focused = getLearningDeckCoverageReport().filter(
      ({ kind }) => kind === "focused"
    );
    const regions = focused.flatMap(({ regions: deckRegions }) => deckRegions);

    // One published focused Deck, three Quest Levels, five Regions each.
    expect(focused).toHaveLength(1);
    expect(regions).toHaveLength(15);
    expect(
      regions.filter(
        ({ focusedQuestionCount, minimumFocusedQuestions }) =>
          focusedQuestionCount >= minimumFocusedQuestions
      )
    ).toHaveLength(15);
    expect(regions.filter(({ hasCapstone }) => hasCapstone)).toHaveLength(15);
    expect(
      new Set(
        regions.map(({ levelId, regionNumber }) => `${levelId}:${regionNumber}`)
      ).size
    ).toBe(15);
    // The authored pools sit below each Region's correct-first demand on
    // purpose, which is what makes the announced Mixed fallback load-bearing.
    expect(
      regions.every(
        ({ minimumFocusedQuestions, correctFirstDemand }) =>
          minimumFocusedQuestions < correctFirstDemand
      )
    ).toBe(true);
  });
});
