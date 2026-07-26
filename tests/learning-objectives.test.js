import { describe, expect, it } from "vitest";
import {
  LEARNING_OBJECTIVE_IDS,
  LEARNING_TOPIC_IDS,
  getLearningMetadata
} from "../src/questions/learning-objectives.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";

const LEVELS = ["bright-start", "trail-scout", "maze-master"];
const LABYRINTHS = [1, 5, 9, 13, 17];

describe("reviewed Question learning metadata", () => {
  it("allowlists stable topic and learning-objective ids on every card shape", () => {
    for (const levelId of LEVELS) {
      for (const labyrinthNumber of LABYRINTHS) {
        for (let questionOrdinal = 0; questionOrdinal < 64; questionOrdinal += 1) {
          const question = getBundledQuestion({
            levelId,
            seed: "learning-objective-test",
            wardenId: 0,
            labyrinthNumber,
            questionOrdinal
          });
          expect(LEARNING_TOPIC_IDS).toContain(question.topicId);
          expect(LEARNING_OBJECTIVE_IDS).toContain(
            question.learningObjectiveId
          );
          expect(question).toMatchObject(
            getLearningMetadata(levelId, questionOrdinal)
          );
        }
      }
    }
  });

  it("keeps one objective stable across different reviewed cards", () => {
    const first = getBundledQuestion({
      levelId: "trail-scout",
      seed: "learning-objective-test",
      wardenId: 0,
      labyrinthNumber: 9,
      questionOrdinal: 2
    });
    const next = getBundledQuestion({
      levelId: "trail-scout",
      seed: "learning-objective-test",
      wardenId: 0,
      labyrinthNumber: 9,
      questionOrdinal: 10
    });

    expect(next.id).not.toBe(first.id);
    expect(next.learningObjectiveId).toBe(first.learningObjectiveId);
    expect(next.topicId).toBe(first.topicId);
  });
});
