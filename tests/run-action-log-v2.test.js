import { describe, expect, it } from "vitest";
import {
  createRunActionLogV2,
  RUN_ACTION_LOG_V2_MAX_ACTIONS,
  RUN_ACTION_LOG_V2_VERSION,
  tryAppendRunActionV2
} from "../src/game/run-action-log-v2.js";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  ReplayInputError,
  verifyOfflineRunReplay,
  verifyRunReplay
} from "../server/run-replay.js";
import {
  DAILY_REPLAY_CONFIG,
  DAILY_REPLAY_FIXTURE,
  DAILY_REPLAY_RESULT,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";
import { getDailyQuestion } from "../src/game/daily-labyrinth.js";

/**
 * Re-records the known-good winning Run as version 2, by driving the real
 * engine with the version 1 script and appending whatever the engine accepted.
 * The log is therefore a product of play rather than a hand-written fixture,
 * and it reaches a genuine terminal state — which is the only thing the server
 * replay will accept.
 */
function recordWinningOfflineRun({ includeHint = false } = {}) {
  let run = createRun(DAILY_REPLAY_FIXTURE.seed, DAILY_REPLAY_CONFIG);
  let log = createRunActionLogV2();
  let questionIndex = 0;
  let hinted = false;
  /** @type {Map<string, ReturnType<typeof getDailyQuestion>>} */
  const contentPack = new Map();

  for (const entry of dailyWinningLog().actions) {
    const deltaMs = entry.elapsedMs - Math.round(run.elapsedMs);
    if (deltaMs > 0 && run.status === "active") {
      run = applyAction(run, { type: "tick", deltaMs });
    }
    if (run.status === "challenge" && !run.challenge?.question) {
      const question = getDailyQuestion(DAILY_REPLAY_FIXTURE, questionIndex);
      questionIndex += 1;
      contentPack.set(question.id, question);
      if (question.reviewedRevisionId) {
        contentPack.set(question.reviewedRevisionId, question);
      }
      run = applyAction(run, { type: "provide-question", question });
      if (includeHint && !hinted) {
        const hintedRun = applyAction(run, { type: "reveal-hint" });
        log = /** @type {typeof log} */ (
          tryAppendRunActionV2(
            log,
            run,
            { type: "reveal-hint" },
            hintedRun
          )
        );
        run = hintedRun;
        hinted = true;
      }
    }
    /** @type {Parameters<typeof applyAction>[1]} */
    const action =
      entry.type === "move"
        ? { type: "move", direction: entry.direction }
        : entry.type === "answer-question"
          ? { type: "answer-question", answerId: entry.answerId }
          : entry.type === "skip-question"
            ? { type: "skip-question" }
            : { type: "pulse" };
    const next = applyAction(run, action);
    const appended = tryAppendRunActionV2(log, run, action, next);
    if (appended === null) {
      throw new Error("Offline log reached its protocol bound.");
    }
    log = appended;
    run = next;
  }

  return { log, run, contentPack };
}

/** @param {Map<string, unknown>} contentPack */
function trustedInputs(contentPack) {
  return {
    seed: DAILY_REPLAY_FIXTURE.seed,
    config: DAILY_REPLAY_CONFIG,
    questionForRevision: (/** @type {string} */ revisionId) =>
      /** @type {ReturnType<typeof getDailyQuestion> | null} */ (
        contentPack.get(revisionId) ?? null
      )
  };
}

describe("Run Action Log version 2", () => {
  it("is version 2 and starts empty", () => {
    expect(RUN_ACTION_LOG_V2_VERSION).toBe(2);
    expect(createRunActionLogV2()).toEqual({ version: 2, actions: [] });
  });

  it("names the revision it answered and the option it chose, and no text", () => {
    const { log } = recordWinningOfflineRun();
    const answered = log.actions.filter(
      (entry) => entry.type === "answer-question"
    );

    expect(answered.length).toBeGreaterThan(0);
    for (const entry of answered) {
      expect(Object.keys(entry).sort()).toEqual([
        "elapsedMs",
        "optionId",
        "questionRevisionId",
        "type"
      ]);
    }
    // Asserted per entry type rather than over the whole log, so a future
    // entry shape cannot smuggle reviewed content in beside a legal one.
    const shapes = {
      move: ["direction", "elapsedMs", "type"],
      pulse: ["elapsedMs", "type"],
      "ring-bell": ["elapsedMs", "type"],
      "reveal-hint": ["elapsedMs", "questionRevisionId", "type"],
      "answer-question": [
        "elapsedMs",
        "optionId",
        "questionRevisionId",
        "type"
      ],
      "skip-question": ["elapsedMs", "questionRevisionId", "type"]
    };
    for (const entry of log.actions) {
      expect(Object.keys(entry).sort()).toEqual(
        shapes[/** @type {keyof typeof shapes} */ (entry.type)]
      );
    }
    expect(JSON.stringify(log)).not.toMatch(
      /prompt|choiceText|hint|feedback|lens|explanation/i
    );
  });

  it("records the regional actions version 1 has no entry type for", () => {
    // Version 1's four entry types are move, pulse, answer, and skip. Ringing
    // a Bell is a Warden Bells action with no version 1 shape at all, which is
    // why Verified Daily cannot carry an offline Quest Run.
    const run = createRun(DAILY_REPLAY_FIXTURE.seed, DAILY_REPLAY_CONFIG);
    const rung = applyAction(run, { type: "ring-bell" });
    const hinted = applyAction(run, { type: "reveal-hint" });

    expect(
      tryAppendRunActionV2(createRunActionLogV2(), run, { type: "ring-bell" }, {
        ...rung,
        event: { type: "bell", message: "Bell rung." }
      })?.actions.at(-1)
    ).toEqual({ type: "ring-bell", elapsedMs: 0 });
    // A Hint outside a Challenge is not an action, so nothing is recorded.
    expect(
      tryAppendRunActionV2(
        createRunActionLogV2(),
        run,
        { type: "reveal-hint" },
        hinted
      )?.actions
    ).toEqual([]);
  });

  it("stops recording at its protocol bound rather than truncating silently", () => {
    const run = createRun(DAILY_REPLAY_FIXTURE.seed, DAILY_REPLAY_CONFIG);
    const moved = applyAction(run, { type: "move", direction: "right" });
    expect(moved.moves).toBe(run.moves + 1);

    let log = createRunActionLogV2();
    for (let index = 0; index < RUN_ACTION_LOG_V2_MAX_ACTIONS; index += 1) {
      const appended = tryAppendRunActionV2(
        log,
        run,
        { type: "move", direction: "right" },
        moved
      );
      expect(appended).not.toBeNull();
      log = /** @type {typeof log} */ (appended);
    }

    expect(
      tryAppendRunActionV2(log, run, { type: "move", direction: "right" }, moved)
    ).toBeNull();
  });
});

describe("Offline server replay", () => {
  it("reproduces the Run exactly against the receipt-bound inputs", () => {
    const { log, run, contentPack } = recordWinningOfflineRun();

    const result = verifyOfflineRunReplay(log, trustedInputs(contentPack));

    expect(result.status).toBe("won");
    expect(result.moves).toBe(run.moves);
    expect(result.score).toBe(run.score);
    expect(result.elapsedMs).toBe(Math.round(run.elapsedMs));
  });

  it("replays a free Hint when it is the first Challenge action", () => {
    const { log, contentPack } = recordWinningOfflineRun({ includeHint: true });

    expect(log.actions[0]).toMatchObject({
      type: "move"
    });
    const hint = log.actions.find((entry) => entry.type === "reveal-hint");
    expect(hint).toMatchObject({
      type: "reveal-hint",
      questionRevisionId: expect.any(String)
    });
    expect(verifyOfflineRunReplay(log, trustedInputs(contentPack)).status).toBe(
      "won"
    );
  });

  it("rejects a Run replayed against a different seed", () => {
    const { log, contentPack } = recordWinningOfflineRun();

    expect(() =>
      verifyOfflineRunReplay(log, {
        ...trustedInputs(contentPack),
        seed: "OTHER-SEED-1"
      })
    ).toThrow(ReplayInputError);
  });

  it("rejects a revision the receipt-bound content pack does not hold", () => {
    const { log } = recordWinningOfflineRun();

    expect(() =>
      verifyOfflineRunReplay(log, {
        seed: DAILY_REPLAY_FIXTURE.seed,
        config: DAILY_REPLAY_CONFIG,
        questionForRevision: () => null
      })
    ).toThrow(ReplayInputError);
  });

  it("refuses any version but its own", () => {
    for (const version of [1, 3, "2"]) {
      expect(() =>
        verifyOfflineRunReplay(
          { version, actions: [{ type: "pulse", elapsedMs: 0 }] },
          {
            seed: DAILY_REPLAY_FIXTURE.seed,
            config: DAILY_REPLAY_CONFIG,
            questionForRevision: () => null
          }
        )
      ).toThrow("Run Action Log version is not supported.");
    }
  });

  it("refuses an entry carrying a field the protocol does not define", () => {
    expect(() =>
      verifyOfflineRunReplay(
        {
          version: 2,
          actions: [
            {
              type: "move",
              direction: "right",
              elapsedMs: 0,
              questionText: "What is two plus two?"
            }
          ]
        },
        {
          seed: DAILY_REPLAY_FIXTURE.seed,
          config: DAILY_REPLAY_CONFIG,
          questionForRevision: () => null
        }
      )
    ).toThrow("unknown or invalid action");
  });

  it("leaves Verified Daily on version 1 with its coverage unchanged", () => {
    const result = verifyRunReplay(dailyWinningLog(), {
      seed: DAILY_REPLAY_FIXTURE.seed,
      config: DAILY_REPLAY_CONFIG,
      questionFor: (index) => getDailyQuestion(DAILY_REPLAY_FIXTURE, index)
    });

    expect(result).toMatchObject({
      status: DAILY_REPLAY_RESULT.status,
      score: DAILY_REPLAY_RESULT.score,
      moves: DAILY_REPLAY_RESULT.moves
    });
    // The Daily path refuses a version 2 log outright, so the offline contract
    // cannot be reused to reach the Verified Daily Board.
    expect(() =>
      verifyRunReplay(
        { version: 2, actions: [{ type: "pulse", elapsedMs: 0 }] },
        {
          seed: DAILY_REPLAY_FIXTURE.seed,
          config: DAILY_REPLAY_CONFIG,
          questionFor: (index) => getDailyQuestion(DAILY_REPLAY_FIXTURE, index)
        }
      )
    ).toThrow("Run Action Log version is not supported.");
  });
});
