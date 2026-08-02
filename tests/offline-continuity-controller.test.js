import { describe, expect, it, vi } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  OFFLINE_ACTION_LOG_KEY,
  OFFLINE_CONTENT_PACK_KEY,
  OFFLINE_RECEIPT_KEY,
  OFFLINE_RUN_RECORD_KEY
} from "../src/game/offline-local-scrub.js";
import { createOfflineContinuityController } from "../src/game/offline-continuity-controller.js";

/** @typedef {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision: string, contentPackHash: string, questId?: string }} TestRunIdentity */

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    getItem: /** @param {string} key */ (key) => values.get(key) ?? null,
    setItem: /** @param {string} key @param {string} value */ (key, value) =>
      values.set(key, value),
    removeItem: /** @param {string} key */ (key) => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

/** @param {ReturnType<typeof createRun>} run @returns {TestRunIdentity} */
function createRunIdentity(run) {
  return {
    runId: "run_offline_controller_01",
    seed: run.seed,
    levelId: "bright-start",
    labyrinthNumber: 1,
    rulesetRevision: run.ruleset.revision,
    contentPackHash: "pack-v1"
  };
}

/**
 * @param {TestRunIdentity} identity
 * @returns {import("../shared/offline-receipt.js").OfflineReceipt}
 */
function createReceipt(identity) {
  return /** @type {import("../shared/offline-receipt.js").OfflineReceipt} */ ({
    schema: "echo-maze-offline-receipt/1",
    algorithm: "ecdsa-p256-sha256",
    keyId: "test-key",
    binding: {
      runId: identity.runId,
      playerId: "user_offline_01",
      deviceInstallationHash: "device-hash",
      seed: identity.seed,
      levelId: identity.levelId,
      labyrinthNumber: identity.labyrinthNumber,
      rulesetRevision: identity.rulesetRevision,
      contentPackHash: identity.contentPackHash,
      ...(identity.questId ? { questId: identity.questId } : {}),
      issuedAt: "2026-08-01T12:00:00.000Z",
      playExpiresAt: "2026-08-08T12:00:00.000Z",
      submissionExpiresAt: "2026-08-10T12:00:00.000Z"
    },
    signature: "test-signature"
  });
}

function createAssetPackage() {
  return {
    version: "pack-v1",
    assets: [
      { url: "/play.js", scope: "public" },
      { url: "/content/bright-start.json", scope: "account" }
    ]
  };
}

describe("offline continuity controller", () => {
  it("keeps the signed Quest identity bound during offline recovery", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-QUEST-II", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "echo-hush-v1" }
    });
    const identity = {
      ...createRunIdentity(run),
      questId: "quest_ii_controller_123"
    };
    const receipt = createReceipt(identity);
    const controller = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });

    await expect(
      controller.prepare({
        run: identity,
        receipt: {
          ...receipt,
          binding: {
            ...receipt.binding,
            questId: "quest_ii_other_456"
          }
        },
        assetPackage: createAssetPackage(),
        verified: true
      })
    ).resolves.toMatchObject({ ok: false, reason: "binding" });

    await expect(
      controller.prepare({
        run: identity,
        receipt,
        assetPackage: createAssetPackage(),
        verified: true
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it("persists a receipt-bound v2 log and recovers it after a controller restart", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-SEED", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const receipt = createReceipt(identity);
    const assetPackage = createAssetPackage();
    const worker = {
      setRunState: async () => ({ ok: true }),
      release: async () => ({ ok: true })
    };
    const controller = createOfflineContinuityController({
      storage,
      workerClient: worker,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });

    await expect(
      controller.prepare({
        run: identity,
        receipt,
        assetPackage,
        verified: true
      })
    ).resolves.toMatchObject({ ok: true });

    const next = applyAction(run, { type: "pulse" });
    await expect(
      controller.recordTransition({
        run: identity,
        previous: run,
        action: { type: "pulse" },
        next
      })
    ).resolves.toMatchObject({ ok: true, durable: true });

    const restarted = createOfflineContinuityController({
      storage,
      workerClient: worker,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:01:00.000Z"),
      accountScope: "user_offline_01"
    });
    await expect(restarted.recover(identity)).resolves.toMatchObject({
      ok: true,
      status: "ready",
      actionLog: { version: 2, actions: [{ type: "pulse", elapsedMs: 0 }] }
    });
    expect(storage.getItem(OFFLINE_RECEIPT_KEY)).toContain(identity.runId);
    expect(storage.getItem(OFFLINE_CONTENT_PACK_KEY)).toContain("pack-v1");
  });

  it("stores a bounded outcome-only pending record at the terminal boundary", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-TERMINAL", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const controller = createOfflineContinuityController({
      storage,
      workerClient: {
        setRunState: async () => ({ ok: true }),
        release: async () => ({ ok: true })
      },
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });
    await controller.prepare({
      run: identity,
      receipt: createReceipt(identity),
      assetPackage: createAssetPackage(),
      verified: true
    });

    const terminalRun = /** @type {ReturnType<typeof createRun>} */ ({
      ...run,
      status: "won",
      score: 420,
      moves: 3,
      elapsedMs: 1250
    });
    await expect(
      controller.recordTerminal({
        run: identity,
        terminalRun,
        outcome: "won",
        terminalAt: new Date("2026-08-01T13:02:00.000Z")
      })
    ).resolves.toMatchObject({
      ok: true,
      durable: true,
      record: {
        runId: identity.runId,
        playerId: "user_offline_01",
        verification: "pending",
        outcome: "won",
        playAuthorityOpen: true
      }
    });

    const record = JSON.parse(
      /** @type {string} */ (storage.getItem(OFFLINE_RUN_RECORD_KEY) ?? "")
    );
    expect(record).toMatchObject({
      runId: identity.runId,
      outcome: "won",
      verification: "pending"
    });
    expect(JSON.stringify(storage.dump())).not.toMatch(
      /prompt|choiceText|hint|feedback|lens|explanation/i
    );
    expect(
      /** @type {string} */ (storage.getItem(OFFLINE_ACTION_LOG_KEY) ?? "")
    ).toContain('"version":2');
  });

  it("keeps the same package and idempotency key through a transport retry", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-RETRY", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const worker = {
      setRunState: async () => ({ ok: true }),
      release: vi.fn(async () => ({ ok: true }))
    };
    const submitOfflineRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "accepted", duplicate: false });
    const controller = createOfflineContinuityController({
      storage,
      workerClient: worker,
      submitOfflineRun,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });
    const receipt = createReceipt(identity);
    await controller.prepare({
      run: identity,
      receipt,
      assetPackage: createAssetPackage(),
      verified: true
    });
    const next = applyAction(run, { type: "pulse" });
    await controller.recordTransition({
      run: identity,
      previous: run,
      action: { type: "pulse" },
      next
    });
    await controller.recordTerminal({
      run: identity,
      terminalRun: /** @type {ReturnType<typeof createRun>} */ ({
        ...next,
        status: "won",
        score: 420
      }),
      outcome: "won",
      terminalAt: new Date("2026-08-01T13:02:00.000Z")
    });

    await expect(controller.reconcile()).resolves.toMatchObject({
      status: "pending",
      retry: true
    });
    expect(storage.getItem(OFFLINE_ACTION_LOG_KEY)).toContain('"version":2');
    const firstSubmission = submitOfflineRun.mock.calls[0][0];

    await expect(controller.reconcile()).resolves.toMatchObject({
      status: "accepted",
      verification: "verified",
      retry: false
    });
    const secondSubmission = submitOfflineRun.mock.calls[1][0];
    expect(secondSubmission.idempotencyKey).toBe(firstSubmission.idempotencyKey);
    expect(secondSubmission.actionLog).toEqual(firstSubmission.actionLog);
    expect(storage.getItem(OFFLINE_ACTION_LOG_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_RECEIPT_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_CONTENT_PACK_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(OFFLINE_RUN_RECORD_KEY) ?? "{}")).toMatchObject({
      verification: "verified",
      label: ""
    });
    expect(worker.release).toHaveBeenCalledWith(identity.runId);
  });

  it("keeps the worker lease until terminal cleanup succeeds", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-CLEANUP", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const worker = {
      setRunState: async () => ({ ok: true }),
      release: vi.fn(async () => ({ ok: true }))
    };
    const controller = createOfflineContinuityController({
      storage,
      workerClient: worker,
      submitOfflineRun: async () => ({ status: "accepted", duplicate: false }),
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });
    await controller.prepare({
      run: identity,
      receipt: createReceipt(identity),
      assetPackage: createAssetPackage(),
      verified: true
    });
    await controller.recordTerminal({
      run: identity,
      terminalRun: /** @type {ReturnType<typeof createRun>} */ ({
        ...run,
        status: "won",
        score: 420
      }),
      outcome: "won",
      terminalAt: new Date("2026-08-01T13:02:00.000Z")
    });

    const removeItem = storage.removeItem;
    const setItem = storage.setItem;
    storage.removeItem = () => {
      throw new Error("storage locked");
    };
    storage.setItem = (key, value) => {
      if (
        value === "" &&
        [
          OFFLINE_RECEIPT_KEY,
          OFFLINE_CONTENT_PACK_KEY,
          OFFLINE_ACTION_LOG_KEY
        ].includes(key)
      ) {
        return new Map();
      }
      return setItem(key, value);
    };

    await expect(controller.reconcile()).resolves.toMatchObject({
      status: "accepted",
      verification: "verified",
      retry: true,
      cleared: false
    });
    expect(worker.release).not.toHaveBeenCalled();

    storage.removeItem = removeItem;
    storage.setItem = setItem;
    await expect(controller.reconcile()).resolves.toMatchObject({
      status: "verified",
      verification: "verified",
      retry: false,
      cleared: true
    });
    expect(worker.release).toHaveBeenCalledOnce();
    expect(worker.release).toHaveBeenCalledWith(identity.runId);
  });

  it("keeps only an outcome-only unverified record after terminal rejection", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-REJECTED", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const submitOfflineRun = vi.fn(async () => /** @type {{ status: "rejected", duplicate: boolean }} */ ({
      status: "rejected",
      duplicate: false
    }));
    const controller = createOfflineContinuityController({
      storage,
      submitOfflineRun,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });
    await controller.prepare({
      run: identity,
      receipt: createReceipt(identity),
      assetPackage: createAssetPackage(),
      verified: true
    });
    const next = applyAction(run, { type: "pulse" });
    await controller.recordTransition({
      run: identity,
      previous: run,
      action: { type: "pulse" },
      next
    });
    await controller.recordTerminal({
      run: identity,
      terminalRun: /** @type {ReturnType<typeof createRun>} */ ({
        ...next,
        status: "lost"
      }),
      outcome: "lost"
    });

    await expect(controller.reconcile()).resolves.toMatchObject({
      status: "rejected",
      verification: "unverified",
      retry: false
    });
    const stored = JSON.parse(storage.getItem(OFFLINE_RUN_RECORD_KEY) ?? "{}");
    expect(stored).toMatchObject({
      outcome: "lost",
      verification: "unverified",
      label: "Offline—unverified"
    });
    expect(JSON.stringify(stored)).not.toMatch(/prompt|choice|action|route/i);
    expect(storage.getItem(OFFLINE_ACTION_LOG_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_RECEIPT_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_CONTENT_PACK_KEY)).toBeNull();
  });

  it("re-verifies a stored receipt and rejects late transitions after terminal state", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-BOUNDARY", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const receipt = createReceipt(identity);
    const worker = { setRunState: async () => ({ ok: true }) };
    const controller = createOfflineContinuityController({
      storage,
      workerClient: worker,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });
    await controller.prepare({
      run: identity,
      receipt,
      assetPackage: createAssetPackage(),
      verified: true
    });
    const terminalRun = /** @type {ReturnType<typeof createRun>} */ ({
      ...run,
      status: "won"
    });
    await controller.recordTerminal({
      run: identity,
      terminalRun,
      outcome: "won"
    });

    const next = applyAction(run, { type: "pulse" });
    await expect(
      controller.recordTransition({
        run: identity,
        previous: run,
        action: { type: "pulse" },
        next
      })
    ).resolves.toMatchObject({ ok: false, reason: "terminal" });
    await expect(controller.recover(identity)).resolves.toMatchObject({
      ok: true,
      status: "terminal"
    });

    const tampered = createStorage();
    for (const [key, value] of Object.entries(storage.dump())) {
      tampered.setItem(key, value);
    }
    const rejecting = createOfflineContinuityController({
      storage: tampered,
      receiptVerifier: {
        verify: async () => ({ valid: false, reason: "signature" })
      }
    });
    await expect(rejecting.recover(identity)).resolves.toMatchObject({
      ok: false,
      reason: "signature"
    });
  });

  it("rejects a copied package when its account or device binding changes", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-COPIED", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const receipt = createReceipt(identity);
    const controller = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01",
      getDeviceInstallationHash: () => "device-hash"
    });
    await expect(
      controller.prepare({
        run: identity,
        receipt,
        assetPackage: createAssetPackage(),
        verified: true
      })
    ).resolves.toMatchObject({ ok: true });

    const copied = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01",
      getDeviceInstallationHash: () => "other-device"
    });
    await expect(copied.recover(identity)).resolves.toMatchObject({
      ok: false,
      reason: "binding"
    });
  });

  it("replaces an older outcome-only record when preparing a new Run", async () => {
    const storage = createStorage();
    storage.setItem(
      OFFLINE_RUN_RECORD_KEY,
      JSON.stringify({
        schema: "echo-maze-offline-run-record/1",
        runId: "old-run",
        outcome: "won",
        verification: "unverified"
      })
    );
    const run = createRun("OFFLINE-CONTROLLER-NEW-RUN", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const controller = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });

    await expect(
      controller.prepare({
        run: identity,
        receipt: createReceipt(identity),
        assetPackage: createAssetPackage(),
        verified: true
      })
    ).resolves.toMatchObject({ ok: true });
    expect(storage.getItem(OFFLINE_RUN_RECORD_KEY)).toBeNull();
  });

  it("cancels a prepared non-terminal Run without clearing another Run", async () => {
    const storage = createStorage();
    const worker = { release: vi.fn(async () => ({ ok: true })) };
    const run = createRun("OFFLINE-CONTROLLER-CANCEL", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const controller = createOfflineContinuityController({
      storage,
      workerClient: worker,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      accountScope: "user_offline_01"
    });

    await controller.prepare({
      run: identity,
      receipt: createReceipt(identity),
      assetPackage: createAssetPackage(),
      verified: true
    });
    await expect(controller.cancelPreparedRun(identity.runId)).resolves.toEqual({
      ok: true,
      durable: true,
      cleared: true
    });

    expect(storage.getItem(OFFLINE_RECEIPT_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_CONTENT_PACK_KEY)).toBeNull();
    expect(storage.getItem(OFFLINE_ACTION_LOG_KEY)).toBeNull();
    expect(worker.release).toHaveBeenCalledWith(identity.runId);
  });

  it("reports quota failure without leaving a partial durable package", async () => {
    const run = createRun("OFFLINE-CONTROLLER-QUOTA", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    const values = new Map();
    let writes = 0;
    const storage = {
      getItem: /** @param {string} key */ (key) => values.get(key) ?? null,
      setItem: /** @param {string} key @param {string} value */ (key, value) => {
        writes += 1;
        if (writes > 2) {
          throw new Error("QuotaExceededError");
        }
        values.set(key, value);
      },
      removeItem: /** @param {string} key */ (key) => values.delete(key)
    };
    const controller = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => new Date("2026-08-01T13:00:00.000Z"),
      accountScope: "user_offline_01"
    });

    await expect(
      controller.prepare({
        run: identity,
        receipt: createReceipt(identity),
        assetPackage: createAssetPackage(),
        verified: true
      })
    ).resolves.toMatchObject({ ok: false, reason: "quota" });
    expect(values.size).toBe(0);
  });

  it("pauses recording when the signed play window has expired", async () => {
    const storage = createStorage();
    const run = createRun("OFFLINE-CONTROLLER-EXPIRY", {
      size: 9,
      echoCount: 1,
      wardenCount: 0,
      ruleset: { atlasRegionId: "foundation", revision: "classic-v1" }
    });
    const identity = createRunIdentity(run);
    let currentTime = new Date("2026-08-01T13:00:00.000Z");
    const controller = createOfflineContinuityController({
      storage,
      receiptVerifier: { verify: async () => ({ valid: true }) },
      now: () => currentTime,
      accountScope: "user_offline_01"
    });
    await controller.prepare({
      run: identity,
      receipt: createReceipt(identity),
      assetPackage: createAssetPackage(),
      verified: true
    });
    currentTime = new Date("2026-08-08T12:00:00.000Z");

    const next = applyAction(run, { type: "pulse" });
    await expect(
      controller.recordTransition({
        run: identity,
        previous: run,
        action: { type: "pulse" },
        next
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "expired",
      status: "paused-local-recovery"
    });
  });
});
