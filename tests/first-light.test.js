import { describe, expect, it } from "vitest";
import { applyAction } from "../src/game/game-session.js";
import {
  FIRST_LIGHT_SEED,
  createFirstLightRun,
  getFirstLightQuestion,
  markFirstLightSeen,
  shouldOfferFirstLight
} from "../src/game/first-light.js";

/**
 * @returns {{
 *   getItem(key: string): string | null,
 *   setItem(key: string, value: string): void
 * }}
 */
function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

/**
 * @param {ReturnType<typeof createFirstLightRun>} run
 * @param {"up" | "right" | "down" | "left"} direction
 */
function move(run, direction) {
  return applyAction(run, { type: "move", direction });
}

function reachFirstChallenge() {
  let run = createFirstLightRun();
  run = move(run, "down");
  run = move(run, "down");
  run = move(run, "down");
  run = move(run, "down");

  expect(run.echoes).toEqual([
    { row: 5, col: 1, collected: true }
  ]);
  expect(run.event.type).toBe("echo-collected");

  run = move(run, "down");
  expect(run.status).toBe("challenge");
  expect(run.challenge).toMatchObject({
    wardenId: 0,
    attempt: 0,
    question: null
  });
  return run;
}

describe("First Light", () => {
  it("offers once per device without requiring local storage", () => {
    const storage = createMemoryStorage();

    expect(shouldOfferFirstLight(storage)).toBe(true);
    expect(markFirstLightSeen(storage)).toBe(true);
    expect(shouldOfferFirstLight(storage)).toBe(false);

    const unavailableStorage = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      }
    };
    expect(shouldOfferFirstLight(unavailableStorage)).toBe(true);
    expect(markFirstLightSeen(unavailableStorage)).toBe(false);
  });

  it("uses one reviewed bundled Question in the canonical run engine", () => {
    let run = reachFirstChallenge();
    const question = getFirstLightQuestion(run.challenge);

    expect(run.seed).toBe(FIRST_LIGHT_SEED);
    expect(question).toMatchObject({
      id: "bright-foundation-1",
      prompt:
        "Ari carries 4 acorns from the bridge and gives away 1. How many remain?",
      answerId: "c",
      hint: "Start with the whole group, then count back.",
      explanation: "4 minus 1 equals 3.",
      difficultyBand: "foundation"
    });
    expect(question.choices).toEqual([
      { id: "a", label: "4" },
      { id: "b", label: "2" },
      { id: "c", label: "3" }
    ]);

    run = applyAction(run, { type: "provide-question", question });
    run = applyAction(run, { type: "reveal-hint" });
    expect(run.challenge?.hintRevealed).toBe(true);

    run = applyAction(run, {
      type: "answer-question",
      answerId: question.answerId
    });
    expect(run.status).toBe("active");
    expect(run.wardensDefeated).toBe(1);

    run = move(run, "down");
    for (let step = 0; step < 6; step += 1) {
      run = move(run, "right");
    }

    expect(run.status).toBe("won");
    expect(run.event.type).toBe("escaped");
  });

  it("keeps normal wrong-answer defeat and free restart rules", () => {
    let run = reachFirstChallenge();

    for (let remaining = 2; remaining >= 0; remaining -= 1) {
      const question = getFirstLightQuestion(run.challenge);
      run = applyAction(run, { type: "provide-question", question });
      const wrongAnswer = question.choices.find(
        (choice) => choice.id !== question.answerId
      );
      if (!wrongAnswer) {
        throw new Error("Expected a reviewed wrong answer");
      }
      run = applyAction(run, {
        type: "answer-question",
        answerId: wrongAnswer.id
      });
      expect(run.explorer.vitality).toBe(remaining);
    }

    expect(run.status).toBe("lost");

    const restarted = applyAction(run, { type: "restart" });
    expect(restarted).toEqual(createFirstLightRun());
    expect(restarted.explorer.vitality).toBe(
      restarted.explorer.maxVitality
    );
  });
});
