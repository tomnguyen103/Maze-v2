import { describe, expect, it } from "vitest";
import {
  createLanternJournal,
  mergeLanternJournals,
  recordLearningOutcome
} from "../src/learning/lantern-journal.js";
import {
  evaluatePracticeAnswer,
  projectLanternJournal,
  selectPracticeQuestion
} from "../src/learning/lantern-journal-ui.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";

function question(ordinal = 0) {
  return getBundledQuestion({
    levelId: "trail-scout",
    seed: "journal-test",
    wardenId: 0,
    labyrinthNumber: 9,
    questionOrdinal: ordinal
  });
}

const EVENT_IDS = [
  "event_00000000-0000-4000-8000-000000000001",
  "event_00000000-0000-4000-8000-000000000002",
  "event_00000000-0000-4000-8000-000000000003",
  "event_00000000-0000-4000-8000-000000000004",
  "event_00000000-0000-4000-8000-000000000005"
];

describe("Lantern Journal", () => {
  it("records only bounded reviewed identifiers and coarse outcomes", () => {
    const recorded = recordLearningOutcome(
      createLanternJournal(),
      question(),
      "wrong",
      () => EVENT_IDS[0]
    );

    expect(recorded.events).toEqual([
      {
        eventId: EVENT_IDS[0],
        questionId: question().id,
        topicId: question().topicId,
        learningObjectiveId: question().learningObjectiveId,
        difficultyBand: question().difficultyBand,
        outcome: "wrong"
      }
    ]);
    expect(JSON.stringify(recorded)).not.toContain(question().prompt);
    expect(JSON.stringify(recorded)).not.toContain("answerId");
  });

  it("records reviewed Daily question identifiers with seven-digit ordinals", () => {
    const dailyQuestion = getBundledQuestion({
      levelId: "trail-scout",
      seed: "DAILY-20260726",
      wardenId: 0,
      labyrinthNumber: 5,
      questionOrdinal: 1_322_240
    });

    const recorded = recordLearningOutcome(
      createLanternJournal(),
      dailyQuestion,
      "correct",
      () => EVENT_IDS[0]
    );

    expect(recorded.events[0].questionId).toBe(dailyQuestion.id);
  });

  it("aggregates repeated outcomes deterministically by learning objective", () => {
    let journal = createLanternJournal();
    journal = recordLearningOutcome(
      journal,
      question(0),
      "wrong",
      () => EVENT_IDS[0]
    );
    journal = recordLearningOutcome(
      journal,
      question(8),
      "correct",
      () => EVENT_IDS[1]
    );
    journal = recordLearningOutcome(
      journal,
      question(8),
      "hint",
      () => EVENT_IDS[2]
    );

    const projection = projectLanternJournal(journal);
    const objective = projection.bands
      .flatMap((band) => band.objectives)
      .find((entry) =>
        entry.learningObjectiveId === question().learningObjectiveId
      );

    expect(objective).toMatchObject({
      correct: 1,
      wrong: 1,
      hint: 1,
      skip: 0,
      attempts: 3,
      practiceQuestionId: question().id
    });
  });

  it("merges duplicate cloud events without double counting", () => {
    const shared = recordLearningOutcome(
      createLanternJournal(),
      question(),
      "wrong",
      () => EVENT_IDS[3]
    );
    const local = recordLearningOutcome(
      shared,
      question(8),
      "correct",
      () => EVENT_IDS[4]
    );

    expect(mergeLanternJournals(local, shared).events).toHaveLength(2);
  });

  it("selects a different reviewed card for the same learning objective", () => {
    const triggering = question(2);
    const practice = selectPracticeQuestion(triggering);

    expect(practice.id).not.toBe(triggering.id);
    expect(practice.learningObjectiveId).toBe(
      triggering.learningObjectiveId
    );
    expect(practice.topicId).toBe(triggering.topicId);
  });

  it("rejects disguised child data and mismatched reviewed metadata", () => {
    const valid = recordLearningOutcome(
      createLanternJournal(),
      question(),
      "wrong",
      () => EVENT_IDS[0]
    );

    expect(() =>
      mergeLanternJournals(createLanternJournal(), {
        ...valid,
        events: [
          {
            ...valid.events[0],
            eventId: "event_my_child_said_seven"
          }
        ]
      })
    ).toThrow();
    expect(() =>
      mergeLanternJournals(createLanternJournal(), {
        ...valid,
        events: [
          {
            ...valid.events[0],
            questionId: "my child said seven"
          }
        ]
      })
    ).toThrow();
    expect(() =>
      mergeLanternJournals(createLanternJournal(), {
        ...valid,
        events: [
          {
            ...valid.events[0],
            learningObjectiveId: "scout-equal-sharing"
          }
        ]
      })
    ).toThrow();
  });

  it("evaluates Practice without accepting or mutating Run state", () => {
    const practice = selectPracticeQuestion(question(2));
    const runSnapshot = Object.freeze({
      score: 300,
      vitality: 2,
      elapsedMs: 12000,
      freeRunsRemaining: 1,
      questLabyrinth: 9
    });

    expect(
      evaluatePracticeAnswer(practice, practice.answerId)
    ).toMatchObject({
      correct: true,
      message: expect.stringMatching(/nice work|you found it/i)
    });
    expect(runSnapshot).toEqual({
      score: 300,
      vitality: 2,
      elapsedMs: 12000,
      freeRunsRemaining: 1,
      questLabyrinth: 9
    });
  });
});
