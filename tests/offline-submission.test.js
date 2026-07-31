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
import { getDailyQuestion } from "../src/game/daily-labyrinth.js";
import {
  DAILY_REPLAY_CONFIG,
  DAILY_REPLAY_FIXTURE,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";

const DEVICE = "a".repeat(64);
const PACK_HASH = "b".repeat(64);
const RUN_ID = "offline_run_01J1MOSSWATCH";
const ISSUED_AT = "2026-07-31T00:00:00.000Z";
const TERMINAL_AT = "2026-07-31T01:00:00.000Z";

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
  return {
    runId: RUN_ID,
    playerId: "user_moss",
    deviceInstallationHash: DEVICE,
    seed: DAILY_REPLAY_FIXTURE.seed,
    levelId: DAILY_REPLAY_FIXTURE.levelId,
    labyrinthNumber: DAILY_REPLAY_FIXTURE.labyrinthNumber,
    rulesetRevision: "classic-v1",
    contentPackHash: PACK_HASH
  };
}

function signedReceipt() {
  return createOfflineReceiptSigner({ privateKey, keyId: "offline-test" }).issue(
    {
      runId: RUN_ID,
      playerId: "user_moss",
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
  const applyCloudOutcome = vi.fn(async () => {});
  const recordSubmission = vi.fn(
    async (/** @type {{ idempotencyKey: string }} */ submission) => {
      if (recorded.has(submission.idempotencyKey)) {
        return { recorded: false };
      }
      recorded.add(submission.idempotencyKey);
      return { recorded: true };
    }
  );
  const { pack } = winningOfflineRun();
  return {
    recordSubmission,
    applyCloudOutcome,
    service: createOfflineSubmissionService({
      verifyReceipt: (receipt) =>
        createOfflineReceiptVerifier({ keys: [jwk] }).verify(receipt),
      loadReceipt: async () => storedReceipt(),
      labyrinthConfigFor: (levelId, labyrinthNumber) =>
        getLabyrinthConfig(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (levelId),
          labyrinthNumber
        ),
      contentPackFor: async () => ({
        hash: PACK_HASH,
        questionForRevision: (revisionId) => pack.get(revisionId) ?? null
      }),
      recordSubmission,
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

    const overrun = service({ now: () => new Date("2026-08-08T00:00:00.000Z") });
    await expect(
      overrun.service.submit(
        submission({ terminalAt: "2026-08-08T00:00:00.000Z" })
      )
    ).resolves.toMatchObject({ status: "expired", reason: "play" });
    expect(overrun.applyCloudOutcome).not.toHaveBeenCalled();
  });

  it("never puts a selected option identifier into persistent storage", async () => {
    const harness = service();

    await harness.service.submit(submission());

    const persisted = JSON.stringify(harness.recordSubmission.mock.calls);
    expect(persisted).not.toContain("optionId");
    expect(persisted).not.toContain("questionRevisionId");
    expect(persisted).not.toContain("actions");
    expect(JSON.parse(persisted)[0][0]).toEqual({
      idempotencyKey: "offline_submit_01J1MOSSWATCH",
      runId: RUN_ID,
      accepted: true,
      outcome: "won",
      score: expect.any(Number),
      moves: expect.any(Number),
      elapsedMs: expect.any(Number)
    });
  });
});
