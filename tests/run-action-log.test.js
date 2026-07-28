import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  appendRunAction,
  createRunActionLog
} from "../src/game/run-action-log.js";

describe("Run Action Log", () => {
  it("records only successful replay-required player actions", () => {
    const original = createRun("REPLAY-1", {
      size: 7,
      echoCount: 0,
      wardenCount: 0,
      vitality: 3,
      pulses: 1
    });
    const blockedAction = /** @type {const} */ ({
      type: "move",
      direction: "up"
    });
    const blocked = applyAction(original, blockedAction);
    const afterTick = applyAction(original, { type: "tick", deltaMs: 125 });
    const moveAction = /** @type {const} */ ({
      type: "move",
      direction: "right"
    });
    const moved = applyAction(afterTick, moveAction);
    const pulseAction = /** @type {const} */ ({ type: "pulse" });
    const pulsed = applyAction(moved, pulseAction);

    let log = createRunActionLog();
    log = appendRunAction(log, original, blockedAction, blocked);
    log = appendRunAction(
      log,
      original,
      { type: "tick", deltaMs: 125 },
      afterTick
    );
    log = appendRunAction(log, afterTick, moveAction, moved);
    log = appendRunAction(log, moved, pulseAction, pulsed);
    log = appendRunAction(
      log,
      pulsed,
      { type: "pause" },
      applyAction(pulsed, { type: "pause" })
    );

    expect(log).toEqual({
      version: 1,
      actions: [
        { type: "move", direction: "right", elapsedMs: 125 },
        { type: "pulse", elapsedMs: 125 }
      ]
    });
  });

  it("records Challenge answers and skips without copying Question content", () => {
    const question = {
      id: "reviewed-1",
      prompt: "What is 2 + 2?",
      choices: [
        { id: "a", label: "3" },
        { id: "b", label: "4" },
        { id: "c", label: "5" }
      ],
      answerId: "b",
      hint: "Count two more.",
      explanation: "Two plus two equals four.",
      difficultyBand: "foundation",
      topicId: "arithmetic",
      learningObjectiveId: "bright-add-within-10"
    };
    const challenged = {
      ...createRun("REPLAY-CHALLENGE"),
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: 0,
        question,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      },
      elapsedMs: 800
    };
    const answerAction = /** @type {const} */ ({
      type: "answer-question",
      answerId: "a"
    });
    const answered = applyAction(challenged, answerAction);
    const nextQuestion = applyAction(answered, {
      type: "provide-question",
      question
    });
    const skipAction = /** @type {const} */ ({ type: "skip-question" });
    const skipped = applyAction(nextQuestion, skipAction);

    let log = createRunActionLog();
    log = appendRunAction(log, challenged, answerAction, answered);
    log = appendRunAction(
      log,
      answered,
      { type: "provide-question", question },
      nextQuestion
    );
    log = appendRunAction(log, nextQuestion, skipAction, skipped);

    expect(log).toEqual({
      version: 1,
      actions: [
        { type: "answer-question", answerId: "a", elapsedMs: 800 },
        { type: "skip-question", elapsedMs: 800 }
      ]
    });
    expect(JSON.stringify(log)).not.toContain(question.prompt);
  });
});
