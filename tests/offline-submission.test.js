import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createOfflineSubmissionService } from "../server/offline-submission.js";
import {
  createOfflineReceiptSigner,
  createOfflineReceiptVerifier,
  publicJwkFor
} from "../server/offline-receipt.js";
import { createRunActionLogV2, tryAppendRunActionV2 } from "../src/game/run-action-log-v2.js";
import { applyAction, createRun } from "../src/game/game-session.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";
import { getDailyQuestion } from "../src/game/daily-labyrinth.js";
import {
  DAILY_REPLAY_CONFIG,
  DAILY_REPLAY_FIXTURE,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";
import { offlineReceiptWindows } from "../shared/offline-receipt.js";

const DEVICE = "a".repeat(64);
const PACK_HASH = "b".repeat(64);
const RUN_ID = "offline_run_01J1MOSSWATCH";
const ISSUED_AT = "2026-07-31T00:00:00.000Z";
const TERMINAL_AT = "2026-07-31T01:00:00.000Z";

/** @typedef {{ status: "won" | "lost", seed: string, score: number, wardensDefeated: number, echoesCollected: number, moves: number, elapsedMs: number, journalEvents?: { questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[], journalSummary?: { topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip", count: number }[] }} TestReplayResult */

/** @param {Partial<TestReplayResult>} [overrides] @returns {TestReplayResult} */
function testReplayResult(overrides = {}) {
  return {
    status: "won",
    seed: DAILY_REPLAY_FIXTURE.seed,
    score: 900,
    wardensDefeated: 3,
    echoesCollected: 2,
    moves: 12,
    elapsedMs: 30000,
    ...overrides
  };
}

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256"
});
const jwk = publicJwkFor(publicKey, "offline-test");

function winningOfflineRun() {
  let run = createRun(DAILY_REPLAY_FIXTURE.seed, DAILY_REPLAY_CONFIG);
  let log = createRunActionLogV2();
  let questionIndex = 0;
  /** @type {Map<string, ReturnType<typeof getDailyQuestion>>} */
  const pack = new Map();

  for (const entry of dailyWinningLog().actions) {
    const deltaMs = entry.elapsedMs - Math.round(run.elapsedMs);
    if (deltaMs > 0 && run.status === "active") {
      run = applyAction(run, { type: "tick", deltaMs });
    }
    if (run.status === "challenge" && !run.challenge?.question) {
      const question = getDailyQuestion(DAILY_REPLAY_FIXTURE, questionIndex);
      questionIndex += 1;
      pack.set(question.id, question);
      if (question.reviewedRevisionId) {
        pack.set(question.reviewedRevisionId, question);
      }
      run = applyAction(run, { type: "provide-question", question });
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
    log = /** @type {typeof log} */ (
      tryAppendRunActionV2(log, run, action, next)
    );
    run = next;
  }
  return { log, pack };
}

function storedReceipt() {
  const windows = offlineReceiptWindows(ISSUED_AT);
  return {
    runId: RUN_ID,
    playerId: "user_moss",
    questId: "quest_01MOSS123",
    deviceInstallationHash: DEVICE,
    seed: DAILY_REPLAY_FIXTURE.seed,
    levelId: DAILY_REPLAY_FIXTURE.levelId,
    labyrinthNumber: DAILY_REPLAY_FIXTURE.labyrinthNumber,
    rulesetRevision: "classic-v1",
    contentPackHash: PACK_HASH,
    issuedAt: ISSUED_AT,
    ...windows
  };
}

function signedReceipt() {
  return createOfflineReceiptSigner({ privateKey, keyId: "offline-test" }).issue(
    {
      runId: RUN_ID,
      playerId: "user_moss",
      questId: "quest_01MOSS123",
      classroomId: null,
      deviceInstallationHash: DEVICE,
      seed: DAILY_REPLAY_FIXTURE.seed,
      levelId:
        /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (
          DAILY_REPLAY_FIXTURE.levelId
        ),
      labyrinthNumber: DAILY_REPLAY_FIXTURE.labyrinthNumber,
      rulesetRevision: "classic-v1",
      contentPackHash: PACK_HASH
    },
    { issuedAt: ISSUED_AT }
  );
}

/** @param {Record<string, unknown>} [overrides] */
function service(overrides = {}) {
  const recorded = new Set();
  /** @type {Map<string, TestReplayResult>} */
  const recordedResults = new Map();
  const applied = new Set();
  const applyCloudOutcome = vi.fn(async () => {});
  const completeSubmission = vi.fn(
    async (/** @type {string} */ key) => {
      applied.add(key);
    }
  );
  const pendingApply = vi.fn(
    async (/** @type {string} */ key) =>
      recorded.has(key) && !applied.has(key)
  );
  const recordSubmission = vi.fn(
    async (/** @type {{ idempotencyKey: string, replayResult?: TestReplayResult }} */ submission) => {
      if (recorded.has(submission.idempotencyKey)) {
        const result =
          recordedResults.get(submission.idempotencyKey) ?? testReplayResult();
        return {
          state: /** @type {const} */ ("duplicate"),
          recorded: {
            idempotencyKey: submission.idempotencyKey,
            accepted: true,
            outcome: /** @type {"won" | "lost"} */ (
              result.status === "won" ? "won" : "lost"
            ),
            score: result.score,
            moves: result.moves,
            elapsedMs: result.elapsedMs,
            result
          }
        };
      }
      recorded.add(submission.idempotencyKey);
      recordedResults.set(
        submission.idempotencyKey,
        submission.replayResult ?? testReplayResult()
      );
      return { state: /** @type {const} */ ("recorded") };
    }
  );
  const { pack } = winningOfflineRun();
  return {
    recordSubmission,
    completeSubmission,
    applyCloudOutcome,
    service: createOfflineSubmissionService({
      verifyReceipt: (receipt) =>
        createOfflineReceiptVerifier({ keys: [jwk] }).verify(receipt),
      loadReceipt: async () => storedReceipt(),
      labyrinthConfigFor: (levelId, labyrinthNumber, rulesetRevision) => ({
        ...getLabyrinthConfig(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (levelId),
          labyrinthNumber
        ),
        // The receipt's ruleset, threaded exactly as the service does it.
        ...(rulesetRevision === "classic-v1"
          ? {}
          : { ruleset: getQuestRunRuleset(labyrinthNumber) })
      }),
      contentPackFor: async () => ({
        hash: PACK_HASH,
        questionForRevision: (revisionId) => pack.get(revisionId) ?? null
      }),
      recordSubmission,
      completeSubmission,
      pendingApply,
      applyCloudOutcome,
      now: () => new Date(TERMINAL_AT),
      ...overrides
    })
  };
}

/** @param {Record<string, unknown>} [overrides] */
function submission(overrides = {}) {
  const { log } = winningOfflineRun();
  return {
    idempotencyKey: "offline_submit_01J1MOSSWATCH",
    receipt: signedReceipt(),
    deviceInstallationHash: DEVICE,
    contentPackHash: PACK_HASH,
    terminalAt: TERMINAL_AT,
    actionLog: log,
    ...overrides
  };
}

describe("Offline submission authority", () => {
  it("writes cloud state only after a successful replay", async () => {
    const harness = service();

    await expect(harness.service.submit(submission())).resolves.toMatchObject({
      status: "accepted",
      duplicate: false
    });
    expect(harness.applyCloudOutcome).toHaveBeenCalledOnce();
  });

  it("leaves cloud state byte-identical when the replay is rejected", async () => {
    const harness = service();

    await expect(
      harness.service.submit(
        submission({
          actionLog: { version: 2, actions: [{ type: "pulse", elapsedMs: 0 }] }
        })
      )
    ).resolves.toMatchObject({ status: "rejected", reason: "replay" });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
    // The rejection is still recorded, so a retry cannot replay it again.
    expect(harness.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ accepted: false })
    );
  });

  it("produces one effect however often one key is retried", async () => {
    const harness = service();

    const first = await harness.service.submit(submission());
    const second = await harness.service.submit(submission());
    const third = await harness.service.submit(submission());

    expect(first).toMatchObject({ duplicate: false });
    expect(second).toMatchObject({ status: "accepted", duplicate: true });
    expect(third).toMatchObject({ status: "accepted", duplicate: true });
    expect(harness.applyCloudOutcome).toHaveBeenCalledOnce();
  });

  it("reports the outcome the ledger holds, not the one it just replayed", async () => {
    // The idempotency key is client-chosen, so a second, different action log
    // can arrive under a spent key. Both replay cleanly and only the first was
    // ever stored, so reporting this replay would name a result cloud state
    // never took.
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("duplicate"),
        recorded: {
          idempotencyKey: "offline_submit_01J1MOSSWATCH",
          accepted: true,
          outcome: /** @type {const} */ ("lost"),
          score: 120,
          moves: 44,
          elapsedMs: 61000,
          result: testReplayResult({
            status: "lost",
            score: 120,
            moves: 44,
            elapsedMs: 61000
          })
        }
      }),
      pendingApply: async () => false
    });

    await expect(harness.service.submit(submission())).resolves.toMatchObject({
      status: "accepted",
      duplicate: true,
      result: { status: "lost", score: 120, moves: 44, elapsedMs: 61000 }
    });
  });

  it("applies the ledger's outcome when a first attempt died before the cloud write", async () => {
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("duplicate"),
        recorded: {
          idempotencyKey: "offline_submit_01J1MOSSWATCH",
          accepted: true,
          outcome: /** @type {const} */ ("won"),
          score: 900,
          moves: 12,
          elapsedMs: 30000,
          result: testReplayResult()
        }
      }),
      pendingApply: async () => true
    });

    await harness.service.submit(submission());

    expect(harness.applyCloudOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          status: "won",
          score: 900,
          moves: 12,
          elapsedMs: 30000
        })
      })
    );
  });

  it("does not verify a replay rejected by the ledger on retry", async () => {
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("duplicate"),
        recorded: {
          idempotencyKey: "offline_submit_01J1MOSSWATCH",
          accepted: false,
          outcome: /** @type {const} */ ("lost"),
          score: 0,
          moves: 0,
          elapsedMs: 0
        }
      }),
      pendingApply: async () => true
    });

    await expect(harness.service.submit(submission())).resolves.toEqual({
      status: "rejected",
      duplicate: true,
      reason: "replay"
    });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("does not accept a duplicate whose ledger outcome is not readable", async () => {
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("duplicate")
      }),
      pendingApply: async () => false
    });

    await expect(harness.service.submit(submission())).resolves.toEqual({
      status: "expired",
      duplicate: true,
      reason: "submission"
    });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("does not finish an accepted duplicate without its complete replay result", async () => {
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("duplicate"),
        recorded: {
          idempotencyKey: "offline_submit_01J1MOSSWATCH",
          accepted: true,
          outcome: /** @type {const} */ ("won"),
          score: 900,
          moves: 12,
          elapsedMs: 30000
        }
      })
    });

    await expect(harness.service.submit(submission())).resolves.toEqual({
      status: "expired",
      duplicate: true,
      reason: "submission"
    });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("refuses a receipt presented from another device", async () => {
    const harness = service();

    await expect(
      harness.service.submit(
        submission({ deviceInstallationHash: "c".repeat(64) })
      )
    ).resolves.toMatchObject({ status: "invalid", reason: "binding" });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("refuses a content pack that is not the one the receipt bound", async () => {
    const harness = service();

    await expect(
      harness.service.submit(submission({ contentPackHash: "d".repeat(64) }))
    ).resolves.toMatchObject({ status: "invalid", reason: "binding" });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("refuses a submission past its deadline and play past its authority", async () => {
    const late = service({ now: () => new Date("2026-08-20T00:00:00.000Z") });
    await expect(late.service.submit(submission())).resolves.toMatchObject({
      status: "expired",
      reason: "submission"
    });

    const overrun = service({ now: () => new Date("2026-08-08T12:00:00.000Z") });
    await expect(
      overrun.service.submit(
        submission({ terminalAt: "2026-08-08T00:00:00.000Z" })
      )
    ).resolves.toMatchObject({ status: "expired", reason: "play" });
    expect(overrun.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("never puts detailed replay data into persistent storage", async () => {
    const harness = service();

    await harness.service.submit(submission());

    const persisted = JSON.stringify(harness.recordSubmission.mock.calls);
    expect(persisted).not.toContain("optionId");
    expect(persisted).not.toContain("questionRevisionId");
    expect(persisted).not.toContain("actions");
    const stored = JSON.parse(persisted)[0][0];
    expect(stored).toEqual({
      idempotencyKey: "offline_submit_01J1MOSSWATCH",
      runId: RUN_ID,
      accepted: true,
      outcome: "won",
      score: expect.any(Number),
      moves: expect.any(Number),
      elapsedMs: expect.any(Number),
      replayResult: expect.objectContaining({
        status: "won"
      })
    });
    expect(stored.replayResult).not.toHaveProperty("journalEvents");
    expect(stored.replayResult).not.toHaveProperty("actionLog");
  });
  it("refuses a terminal instant in the future or before the receipt", async () => {
    const harness = service();

    await expect(
      harness.service.submit(
        submission({ terminalAt: "2026-08-01T00:00:00.000Z" })
      )
    ).resolves.toMatchObject({ status: "invalid", reason: "terminal-time" });
    await expect(
      harness.service.submit(
        submission({ terminalAt: "2026-07-30T00:00:00.000Z" })
      )
    ).resolves.toMatchObject({ status: "invalid", reason: "terminal-time" });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("refuses a malformed idempotency key before touching the database", async () => {
    const harness = service();

    await expect(
      harness.service.submit(submission({ idempotencyKey: "short" }))
    ).resolves.toMatchObject({ status: "invalid", reason: "idempotency-key" });
    expect(harness.recordSubmission).not.toHaveBeenCalled();
  });

  it("does not report an acceptance the ledger could not record", async () => {
    const harness = service({
      recordSubmission: async () => ({
        state: /** @type {const} */ ("no-live-receipt")
      })
    });

    await expect(harness.service.submit(submission())).resolves.toMatchObject({
      status: "expired",
      reason: "submission"
    });
    expect(harness.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("finishes a first attempt that died between the ledger and the write", async () => {
    let firstAttempt = true;
    const harness = service({
      applyCloudOutcome: async () => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error("cloud write failed");
        }
      }
    });

    await expect(harness.service.submit(submission())).rejects.toThrow(
      "cloud write failed"
    );
    // The retry finds the ledger row present but unapplied, and completes it
    // rather than reporting a success that never happened.
    await expect(harness.service.submit(submission())).resolves.toMatchObject({
      status: "accepted",
      duplicate: true
    });
    expect(harness.completeSubmission).toHaveBeenCalledWith(
      "offline_submit_01J1MOSSWATCH"
    );
  });
});

describe("Offline replay uses the receipt-bound ruleset", () => {
  it("passes the stored ruleset revision into the engine configuration", async () => {
    /** @type {unknown[]} */
    const configCalls = [];
    const harness = service({
      labyrinthConfigFor: (
        /** @type {string} */ levelId,
        /** @type {number} */ labyrinthNumber,
        /** @type {string} */ rulesetRevision
      ) => {
        configCalls.push([levelId, labyrinthNumber, rulesetRevision]);
        return getLabyrinthConfig(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (levelId),
          labyrinthNumber
        );
      }
    });

    await harness.service.submit(submission());

    // Without the third argument every regional Trail Twist action replays
    // against Classic Rules, no-ops, and terminally rejects a Run that was
    // played legitimately — the one failure the Classic-only fixtures cannot
    // surface on their own.
    expect(configCalls).toEqual([
      [
        DAILY_REPLAY_FIXTURE.levelId,
        DAILY_REPLAY_FIXTURE.labyrinthNumber,
        "classic-v1"
      ]
    ]);
  });
});
