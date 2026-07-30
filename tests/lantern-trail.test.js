import { describe, expect, it } from "vitest";
import {
  continueLanternTrail,
  createLanternTrail,
  createLanternTrailSession,
  listLanternTrailObjectives,
  recordLanternTrailHint,
  resolveLanternTrailQuestion
} from "../src/learning/lantern-trail.js";

const LEVELS = ["bright-start", "trail-scout", "maze-master"];
const BANDS = ["foundation", "developing", "capable", "advanced", "mastery"];

function trail() {
  return createLanternTrail({
    levelId: "trail-scout",
    difficultyBand: "capable",
    learningObjectiveId: "scout-multistep-arithmetic"
  });
}

/**
 * @param {ReturnType<typeof createLanternTrailSession>} session
 * @param {"correct" | "wrong" | "skip"} [outcome]
 */
function resolved(session, outcome = "correct") {
  return resolveLanternTrailQuestion(session, outcome);
}

describe("Lantern Trail", () => {
  it("pins three required and two optional distinct reviewed Questions", () => {
    const selected = trail();

    expect(selected.requiredQuestionCount).toBe(3);
    expect(selected.optionalQuestionCount).toBe(2);
    expect(selected.questions).toHaveLength(5);
    expect(new Set(selected.questions.map((question) => question.id)).size).toBe(5);
    expect(
      new Set(selected.questions.map((question) => question.prompt)).size
    ).toBe(5);
    expect(selected.revision).toMatch(/^bundled-lantern-trail-v1:[a-f0-9]{32}$/);
    expect(
      selected.questions.every(
        (question) =>
          question.learningObjectiveId === selected.learningObjectiveId &&
          question.difficultyBand === selected.difficultyBand &&
          typeof question.reviewedRevisionId === "string"
      )
    ).toBe(true);
  });

  it("publishes one fixed five-Question Trail for every reviewed catalog objective", () => {
    for (const levelId of LEVELS) {
      for (const difficultyBand of BANDS) {
        const catalog = listLanternTrailObjectives({ levelId, difficultyBand });
        expect(catalog).toHaveLength(8);
        for (const objective of catalog) {
          const selected = createLanternTrail({
            levelId,
            difficultyBand,
            learningObjectiveId: objective.learningObjectiveId
          });
          expect(selected.questions).toHaveLength(5);
          expect(
            new Set(selected.questions.map((question) => question.id)).size
          ).toBe(5);
          expect(
            new Set(selected.questions.map((question) => question.prompt)).size
          ).toBe(5);
        }
      }
    }
  });

  it("keeps the reviewed sequence fixed across Hint, answer, and Skip outcomes", () => {
    const correctStart = createLanternTrailSession(trail());
    const hintedStart = recordLanternTrailHint(
      createLanternTrailSession(trail())
    );
    const skippedStart = createLanternTrailSession(trail());

    const correctNext = continueLanternTrail(resolved(correctStart, "correct"));
    const hintedNext = continueLanternTrail(resolved(hintedStart, "wrong"));
    const skippedNext = continueLanternTrail(resolved(skippedStart, "skip"));

    expect(correctNext.index).toBe(1);
    expect(hintedNext.index).toBe(1);
    expect(skippedNext.index).toBe(1);
    expect(
      [correctNext, hintedNext, skippedNext].map(
        (session) => session.trail.questions[session.index].id
      )
    ).toEqual([
      correctNext.trail.questions[1].id,
      correctNext.trail.questions[1].id,
      correctNext.trail.questions[1].id
    ]);
  });

  it("records each Hint and resolution at most once", () => {
    const start = createLanternTrailSession(trail());
    const hinted = recordLanternTrailHint(start);
    const hintedAgain = recordLanternTrailHint(hinted);
    const answered = resolveLanternTrailQuestion(hinted, "wrong");
    const answeredAgain = resolveLanternTrailQuestion(answered, "correct");

    expect(hinted).not.toBe(start);
    expect(hintedAgain).toBe(hinted);
    expect(answered).not.toBe(hinted);
    expect(answeredAgain).toBe(answered);
    expect(answered.outcome).toBe("wrong");
  });

  it("requires three Questions, then allows zero, one, or two optional Questions", () => {
    let session = createLanternTrailSession(trail());
    for (let index = 0; index < 2; index += 1) {
      session = continueLanternTrail(resolved(session));
    }
    session = resolved(session);
    expect(session.index).toBe(2);
    expect(session.requiredComplete).toBe(true);

    expect(continueLanternTrail(session, { keepPracticing: false }).complete).toBe(
      true
    );

    session = continueLanternTrail(session, { keepPracticing: true });
    expect(session.index).toBe(3);
    session = resolved(session, "skip");
    expect(continueLanternTrail(session, { keepPracticing: false }).complete).toBe(
      true
    );

    session = continueLanternTrail(session, { keepPracticing: true });
    expect(session.index).toBe(4);
    session = resolved(session);
    const finished = continueLanternTrail(session, { keepPracticing: true });
    expect(finished.complete).toBe(true);
    expect(finished.index).toBe(4);
  });

  it("rejects advancing or resolving outside the bounded Trail contract", () => {
    const start = createLanternTrailSession(trail());

    expect(() => continueLanternTrail(start)).toThrow(/resolve/i);
    expect(() => resolveLanternTrailQuestion(start, "hint")).toThrow(/outcome/i);
    expect(() =>
      createLanternTrail({
        levelId: "trail-scout",
        difficultyBand: "capable",
        learningObjectiveId: "bright-combine-groups"
      })
    ).toThrow(/objective/i);
  });
});
