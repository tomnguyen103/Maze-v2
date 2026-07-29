import { describe, expect, it } from "vitest";
import { createVerifiedDailySubmission } from "../src/player/daily-submission.js";
import {
  DAILY_REPLAY_FIXTURE,
  DAILY_REPLAY_RESULT,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";

describe("Verified Daily submission", () => {
  it("copies only the canonical contract and server-replayable terminal facts", () => {
    const actionLog = dailyWinningLog();
    const submission = createVerifiedDailySubmission(
      /** @type {any} */ ({
        ...DAILY_REPLAY_FIXTURE,
        ignored: "not sent"
      }),
      actionLog,
      {
        seed: DAILY_REPLAY_FIXTURE.seed,
        status: "won",
        score: DAILY_REPLAY_RESULT.score,
        wardensDefeated: DAILY_REPLAY_RESULT.wardensDefeated,
        echoes: Array.from(
          { length: DAILY_REPLAY_RESULT.echoesCollected },
          () => ({ collected: true })
        ),
        moves: DAILY_REPLAY_RESULT.moves,
        elapsedMs: DAILY_REPLAY_RESULT.elapsedMs
      }
    );

    expect(submission).toEqual({
      idempotencyKey: expect.stringMatching(/^[a-z0-9_-]{12,128}$/),
      contract: DAILY_REPLAY_FIXTURE,
      actionLog,
      claimed: {
        status: DAILY_REPLAY_RESULT.status,
        score: DAILY_REPLAY_RESULT.score,
        wardensDefeated: DAILY_REPLAY_RESULT.wardensDefeated,
        echoesCollected: DAILY_REPLAY_RESULT.echoesCollected,
        moves: DAILY_REPLAY_RESULT.moves,
        elapsedMs: DAILY_REPLAY_RESULT.elapsedMs
      }
    });
    expect(
      createVerifiedDailySubmission(
        DAILY_REPLAY_FIXTURE,
        actionLog,
        {
          seed: DAILY_REPLAY_FIXTURE.seed,
          status: "won",
          score: DAILY_REPLAY_RESULT.score,
          wardensDefeated: DAILY_REPLAY_RESULT.wardensDefeated,
          echoes: Array.from(
            { length: DAILY_REPLAY_RESULT.echoesCollected },
            () => ({ collected: true })
          ),
          moves: DAILY_REPLAY_RESULT.moves,
          elapsedMs: DAILY_REPLAY_RESULT.elapsedMs
        }
      ).idempotencyKey
    ).toBe(submission.idempotencyKey);
  });
});
