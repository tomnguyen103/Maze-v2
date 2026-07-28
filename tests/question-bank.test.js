import { describe, expect, it } from "vitest";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import { normalizeQuestion } from "../server/question-service.js";

const LEVELS = ["bright-start", "trail-scout", "maze-master"];

describe("reviewed Question progression", () => {
  it("provides unique Questions across a full twenty-Labyrinth Quest", () => {
    for (const levelId of LEVELS) {
      const questions = Array.from({ length: 200 }, (_, questionOrdinal) =>
        getBundledQuestion({
          levelId,
          seed: "QUEST-UNIQUE",
          wardenId: questionOrdinal % 6,
          attempt: questionOrdinal % 4,
          labyrinthNumber: Math.floor(questionOrdinal / 10) + 1,
          questionOrdinal
        })
      );

      expect(new Set(questions.map((question) => question.id)).size).toBe(200);
      expect(new Set(questions.map((question) => question.prompt)).size).toBe(
        200
      );
    }
  });

  it("matches Question difficulty to the current Difficulty Band", () => {
    const foundation = getBundledQuestion({
      levelId: "trail-scout",
      seed: "BANDS",
      wardenId: 0,
      labyrinthNumber: 1,
      questionOrdinal: 0
    });
    const mastery = getBundledQuestion({
      levelId: "trail-scout",
      seed: "BANDS",
      wardenId: 0,
      labyrinthNumber: 20,
      questionOrdinal: 190
    });

    expect(foundation.difficultyBand).toBe("foundation");
    expect(mastery.difficultyBand).toBe("mastery");
    expect(mastery.difficultyRank).toBeGreaterThan(
      foundation.difficultyRank
    );
  });

  it("keeps Bright Start arithmetic within 20 and solves patterns correctly", () => {
    for (let band = 0; band < 5; band += 1) {
      const questionOrdinal = band * 8 + 3;
      const question = getBundledQuestion({
        levelId: "bright-start",
        seed: "BRIGHT-LIMIT",
        wardenId: 0,
        labyrinthNumber: band * 4 + 1,
        questionOrdinal
      });
      const pattern = question.prompt.match(
        /pattern.*?: (\d+), (\d+), (\d+)/i
      );
      const answer = Number(
        question.choices.find((choice) => choice.id === question.answerId)
          ?.label
      );

      expect(pattern).not.toBeNull();
      const [, first, second, third] = pattern ?? [];
      expect(answer).toBe(Number(third) + Number(second) - Number(first));
      expect(answer).toBeLessThanOrEqual(20);
    }
  });

  it("uses every published Quest-Level curriculum, not arithmetic alone", () => {
    for (const levelId of LEVELS) {
      const questions = [4, 5, 6, 7].map((questionOrdinal) =>
        getBundledQuestion({
          levelId,
          seed: "CURRICULUM",
          wardenId: 0,
          labyrinthNumber: 9,
          questionOrdinal
        })
      );

      expect(
        questions.every((question) =>
          question.choices.every((choice) => Number.isNaN(Number(choice.label)))
        )
      ).toBe(true);
      expect(new Set(questions.map((question) => question.prompt)).size).toBe(4);
    }
  });

  it("includes one short Hint that does not expose the answer label", () => {
    for (const levelId of LEVELS) {
      for (let questionOrdinal = 0; questionOrdinal < 200; questionOrdinal += 1) {
        const question = getBundledQuestion({
          levelId,
          seed: "HINTS",
          wardenId: 1,
          labyrinthNumber: Math.floor(questionOrdinal / 10) + 1,
          questionOrdinal
        });
        const answer = question.choices.find(
          (choice) => choice.id === question.answerId
        );

        expect(question.hint.length).toBeGreaterThan(5);
        expect(question.hint.length).toBeLessThanOrEqual(120);
        expect(question.hint.toLowerCase()).not.toContain(
          answer?.label.toLowerCase() ?? ""
        );
      }
    }
  });

  it("returns defensive copies of choices", () => {
    const request = {
      levelId: "bright-start",
      seed: "COPY",
      wardenId: 0,
      labyrinthNumber: 4,
      questionOrdinal: 3
    };
    const first = getBundledQuestion(request);
    first.choices[0].label = "changed";

    expect(getBundledQuestion(request).choices[0].label).not.toBe("changed");
  });

  it("ships one validated Gate Warden capstone per Level and Band", () => {
    const labyrinths = [1, 5, 9, 13, 17];
    const capstones = LEVELS.flatMap((levelId) =>
      labyrinths.map((labyrinthNumber) =>
        getBundledQuestion({
          levelId,
          seed: "CAPSTONE",
          wardenId: 0,
          attempt: 0,
          labyrinthNumber,
          questionOrdinal: labyrinthNumber - 1,
          challengeKind: "gate-warden"
        })
      )
    );

    expect(capstones).toHaveLength(15);
    expect(new Set(capstones.map((question) => question.id)).size).toBe(15);
    expect(
      capstones.every((question) => question.id.startsWith("capstone-"))
    ).toBe(true);
    for (const question of capstones) {
      expect(normalizeQuestion(question)).toEqual(question);
    }
  });

  it("keeps ordinary Warden retries on the unbounded reviewed deck", () => {
    /** @type {Parameters<typeof getBundledQuestion>[0]} */
    const request = {
      levelId: "trail-scout",
      seed: "CAPSTONE-FALLBACK",
      wardenId: 0,
      attempt: 1,
      labyrinthNumber: 20,
      questionOrdinal: 99,
      challengeKind: "warden"
    };

    expect(getBundledQuestion(request).id).toBe("scout-mastery-99");
  });

  it("falls back to the ordinary reviewed deck for missing or invalid capstones", () => {
    const request = {
      levelId: "trail-scout",
      seed: "CAPSTONE-FALLBACK",
      wardenId: 0,
      attempt: 0,
      labyrinthNumber: 1,
      questionOrdinal: 7,
      challengeKind: /** @type {"gate-warden"} */ ("gate-warden")
    };

    expect(
      getBundledQuestion(request, {
        capstoneQuestions: { "trail-scout": [] }
      }).id
    ).toBe("scout-foundation-7");
    expect(
      getBundledQuestion(request, {
        capstoneQuestions: {
          "trail-scout": [[
            "Broken card",
            ["only one choice"],
            0,
            "Hint",
            "Explanation"
          ]]
        }
      }).id
    ).toBe("scout-foundation-7");
  });
});
