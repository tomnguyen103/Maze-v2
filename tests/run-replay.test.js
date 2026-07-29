import { describe, expect, it } from "vitest";
import { getDailyQuestion } from "../src/game/daily-labyrinth.js";
import {
  ReplayInputError,
  RUN_REPLAY_LIMITS,
  verifyRunReplay
} from "../server/run-replay.js";
import {
  DAILY_FIRST_CHALLENGE_MOVES,
  DAILY_REPLAY_CONFIG,
  DAILY_REPLAY_FIXTURE,
  DAILY_REPLAY_RESULT,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";

function verifyDaily(/** @type {unknown} */ log = dailyWinningLog()) {
  return verifyRunReplay(log, {
    seed: DAILY_REPLAY_FIXTURE.seed,
    config: DAILY_REPLAY_CONFIG,
    questionFor: (index) => getDailyQuestion(DAILY_REPLAY_FIXTURE, index)
  });
}

describe("server-authoritative Run replay", () => {
  it("derives one escaped Daily result from the fixed action fixture", () => {
    expect(verifyDaily()).toEqual(DAILY_REPLAY_RESULT);
  });

  it("derives defeat from trusted Questions instead of a claimed encounter result", () => {
    const prefix = dailyWinningLog().actions.slice(
      0,
      DAILY_FIRST_CHALLENGE_MOVES
    );
    const elapsedMs = prefix.at(-1)?.elapsedMs ?? 0;
    const wrongAnswers = [0, 1, 2].map((index) => {
      const question = getDailyQuestion(DAILY_REPLAY_FIXTURE, index);
      const wrong = question.choices.find(
        (choice) => choice.id !== question.answerId
      );
      if (!wrong) throw new Error("Daily fixture needs a wrong answer.");
      return {
        type: "answer-question",
        answerId: wrong.id,
        elapsedMs
      };
    });

    expect(
      verifyDaily({ version: 1, actions: [...prefix, ...wrongAnswers] })
    ).toEqual({
      status: "lost",
      seed: "DAILY-20260726",
      score: 150,
      wardensDefeated: 0,
      echoesCollected: 3,
      moves: 33,
      elapsedMs: 3300
    });
  });

  it.each([
    ["unknown version", { version: 2, actions: [] }],
    ["empty log", { version: 1, actions: [] }],
    [
      "unknown action",
      {
        version: 1,
        actions: [{ type: "teleport", elapsedMs: 0 }]
      }
    ],
    [
      "blocked move",
      {
        version: 1,
        actions: [{ type: "move", direction: "up", elapsedMs: 100 }]
      }
    ],
    [
      "decreasing elapsed time",
      {
        version: 1,
        actions: [
          { type: "move", direction: "right", elapsedMs: 100 },
          { type: "move", direction: "right", elapsedMs: 99 }
        ]
      }
    ],
    [
      "elapsed time above the protocol limit",
      {
        version: 1,
        actions: [
          {
            type: "move",
            direction: "right",
            elapsedMs: RUN_REPLAY_LIMITS.maxElapsedMs + 1
          }
        ]
      }
    ]
  ])("rejects %s", (_name, log) => {
    expect(() => verifyDaily(log)).toThrow(ReplayInputError);
  });

  it("rejects incomplete and post-terminal logs", () => {
    const winning = dailyWinningLog();
    expect(() =>
      verifyDaily({
        ...winning,
        actions: winning.actions.slice(0, -1)
      })
    ).toThrow(/terminal/i);
    expect(() =>
      verifyDaily({
        ...winning,
        actions: [
          ...winning.actions,
          { type: "move", direction: "right", elapsedMs: 7700 }
        ]
      })
    ).toThrow(/after.*terminal/i);
  });

  it("rejects action-count and encoded-size exhaustion", () => {
    expect(() =>
      verifyDaily({
        version: 1,
        actions: Array.from(
          { length: RUN_REPLAY_LIMITS.maxActions + 1 },
          () => ({ type: "move", direction: "right", elapsedMs: 0 })
        )
      })
    ).toThrow(/too many/i);

    expect(() =>
      verifyDaily({
        version: 1,
        actions: [
          {
            type: "answer-question",
            answerId: "x".repeat(RUN_REPLAY_LIMITS.maxBytes),
            elapsedMs: 0
          }
        ]
      })
    ).toThrow(/too large/i);
  });
});
