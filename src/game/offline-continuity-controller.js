import {
  offlineIdempotencyKey,
  reconcileOfflineRun,
  verificationLabel
} from "./offline-continuity.js";
import {
  OFFLINE_ACTION_LOG_KEY,
  OFFLINE_CONTENT_PACK_KEY,
  OFFLINE_DEVICE_BINDING_KEY,
  OFFLINE_RECEIPT_KEY,
  OFFLINE_RUN_RECORD_KEY
} from "./offline-local-scrub.js";
import {
  createRunActionLogV2,
  tryAppendRunActionV2
} from "./run-action-log-v2.js";
import { normalizeOfflineAssetPackage } from "../../shared/offline-asset-package.js";

const ACTION_LOG_SCHEMA = "echo-maze-offline-action-log/1";
const RUN_RECORD_SCHEMA = "echo-maze-offline-run-record/1";
const ACCOUNT_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The durable browser boundary for Offline Continuity. The game engine still
 * owns every Run transition; this module owns only the receipt-bound package,
 * the version 2 action log, the outcome-only terminal record, and the worker's
 * version reference.
 *
 * @typedef {import("./run-action-log-v2.js").RunActionLogV2} RunActionLogV2
 * @typedef {import("../../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 * @typedef {{
 *   runId: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   rulesetRevision: string,
 *   contentPackHash: string,
 *   questId?: string
 * }} OfflineRunIdentity
 * @typedef {{
 *   runId: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   rulesetRevision?: string,
 *   contentPackHash?: string
 * }} OfflineRunLocator
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem?: (key: string) => unknown
 * }} StorageLike
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {unknown} value
 * @returns {value is OfflineRunIdentity}
 */
function isRunIdentity(value) {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.seed === "string" &&
    typeof value.levelId === "string" &&
    Number.isInteger(value.labyrinthNumber) &&
    typeof value.rulesetRevision === "string" &&
    typeof value.contentPackHash === "string" &&
    (value.questId === undefined || typeof value.questId === "string")
  );
}

/** @param {OfflineRunIdentity} left @param {OfflineRunIdentity} right */
function sameRunIdentity(left, right) {
  return (
    left.runId === right.runId &&
    left.seed === right.seed &&
    left.levelId === right.levelId &&
    left.labyrinthNumber === right.labyrinthNumber &&
    left.rulesetRevision === right.rulesetRevision &&
    left.contentPackHash === right.contentPackHash &&
    left.questId === right.questId
  );
}

/** @param {unknown} value @returns {value is OfflineReceipt} */
function isReceipt(value) {
  return (
    isRecord(value) &&
    isRecord(value.binding) &&
    typeof value.binding.runId === "string" &&
    typeof value.binding.deviceInstallationHash === "string" &&
    typeof value.binding.seed === "string" &&
    typeof value.binding.levelId === "string" &&
    Number.isInteger(value.binding.labyrinthNumber) &&
    typeof value.binding.rulesetRevision === "string" &&
    typeof value.binding.contentPackHash === "string" &&
    (value.binding.questId === undefined ||
      typeof value.binding.questId === "string") &&
    typeof value.binding.playExpiresAt === "string" &&
    typeof value.binding.submissionExpiresAt === "string"
  );
}

/** @param {OfflineReceipt} receipt @param {OfflineRunIdentity} run */
function receiptMatchesRun(receipt, run) {
  return (
    receipt.binding.runId === run.runId &&
    receipt.binding.seed === run.seed &&
    receipt.binding.levelId === run.levelId &&
    receipt.binding.labyrinthNumber === run.labyrinthNumber &&
    receipt.binding.rulesetRevision === run.rulesetRevision &&
    receipt.binding.contentPackHash === run.contentPackHash &&
    (run.questId === undefined
      ? receipt.binding.questId === undefined
      : receipt.binding.questId === run.questId)
  );
}

/** @param {unknown} value @returns {RunActionLogV2 | null} */
function readActionLog(value) {
  if (!isRecord(value) || value.schema !== ACTION_LOG_SCHEMA) {
    return null;
  }
  const log = value.actionLog;
  if (
    !isRecord(log) ||
    log.version !== 2 ||
    !Array.isArray(log.actions)
  ) {
    return null;
  }
  return /** @type {RunActionLogV2} */ (log);
}

/** @param {StorageLike} storage @param {string} key */
function readJson(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {StorageLike} storage @param {string} key @param {unknown} value */
function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

/** @param {unknown} value @param {Date} now */
function isExpired(value, now) {
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  return !Number.isFinite(timestamp) || now.getTime() >= timestamp;
}

/** @param {unknown} value */
function terminalOutcome(value) {
  return value === "won" || value === "lost" ? value : null;
}

/** @param {unknown} value */
function runRecord(value) {
  if (!isRecord(value) || value.schema !== RUN_RECORD_SCHEMA) {
    return null;
  }
  const outcome = terminalOutcome(value.outcome);
  if (
    typeof value.runId !== "string" ||
    !outcome ||
    (value.verification !== "pending" &&
      value.verification !== "verified" &&
      value.verification !== "unverified")
  ) {
    return null;
  }
  return value;
}

/** @param {unknown} value @returns {boolean} */
function validAccountScope(value) {
  return typeof value === "string" && ACCOUNT_SCOPE_PATTERN.test(value);
}

/**
 * @param {{
 *   storage?: StorageLike | null,
 *   workerClient?: {
 *     setRunState?: (message: {
 *       runId: string,
 *       version: string,
 *       terminal: boolean,
 *       durable: boolean,
 *       accountScope?: string
 *     }) => Promise<unknown>,
 *     release?: (runId: string) => Promise<unknown>
 *   } | null,
 *   receiptVerifier?: {
 *     verify: (receipt: unknown) => Promise<{ valid: boolean, reason?: string }>
 *   } | null,
 *   submitOfflineRun?: ((submission: {
 *     idempotencyKey: string,
 *     receipt: OfflineReceipt,
 *     deviceInstallationHash: string,
 *     contentPackHash: string,
 *     terminalAt: string,
 *     actionLog: RunActionLogV2
 *   }) => Promise<{ status: "accepted" | "rejected" | "expired" | "invalid", duplicate?: boolean }>) | null,
 *   now?: () => Date,
 *   accountScope?: string | null,
 *   getDeviceInstallationHash?: (runId: string) => string | null
 * }} [dependencies]
 */
export function createOfflineContinuityController({
  storage = globalThis.localStorage,
  workerClient = null,
  receiptVerifier = null,
  submitOfflineRun = null,
  now = () => new Date(),
  accountScope: initialAccountScope = null,
  getDeviceInstallationHash
} = {}) {
  let accountScope = initialAccountScope;
  /** @returns {StorageLike | null} */
  function targetStorage() {
    return storage ?? null;
  }

  /** @param {OfflineRunIdentity} run @param {OfflineReceipt} receipt */
  function validateBinding(run, receipt) {
    if (!isRunIdentity(run) || !isReceipt(receipt)) {
      return { ok: false, reason: "binding" };
    }
    if (!receiptMatchesRun(receipt, run)) {
      return { ok: false, reason: "binding" };
    }
    const playerId = receipt.binding.playerId ?? null;
    if (
      (accountScope !== null && playerId !== accountScope) ||
      (accountScope === null && playerId !== null)
    ) {
      return { ok: false, reason: "binding" };
    }
    if (getDeviceInstallationHash) {
      try {
        if (
          getDeviceInstallationHash(receipt.binding.runId) !==
          receipt.binding.deviceInstallationHash
        ) {
          return { ok: false, reason: "binding" };
        }
      } catch {
        return { ok: false, reason: "binding" };
      }
    }
    return { ok: true };
  }

  /** @param {OfflineReceipt} receipt */
  async function verifyStoredReceipt(receipt) {
    if (!receiptVerifier) {
      return { ok: false, reason: "receipt" };
    }
    try {
      const result = await receiptVerifier.verify(receipt);
      return result.valid === true
        ? { ok: true }
        : { ok: false, reason: result.reason ?? "receipt" };
    } catch {
      return { ok: false, reason: "receipt" };
    }
  }

  /** @param {OfflineRunIdentity} run @param {boolean} terminal @param {boolean} durable */
  /**
   * @param {OfflineRunIdentity} run
   * @param {boolean} terminal
   * @param {boolean} durable
   * @returns {Promise<{ ok?: boolean, reason?: string, [key: string]: unknown }>}
   */
  async function setWorkerState(run, terminal, durable) {
    if (!workerClient?.setRunState) {
      return { ok: true };
    }
    if (accountScope !== null && !validAccountScope(accountScope)) {
      return { ok: false, reason: "account-scope" };
    }
    try {
      const target = targetStorage();
      const result = await workerClient.setRunState({
        runId: run.runId,
        version: target
          ? readJson(target, OFFLINE_CONTENT_PACK_KEY)?.version ?? ""
          : "",
        terminal,
        durable,
        ...(accountScope ? { accountScope } : {})
      });
      if (
        isRecord(result) &&
        typeof result.ok === "boolean"
      ) {
        return {
          ok: result.ok,
          ...(typeof result.reason === "string"
            ? { reason: result.reason }
            : {})
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "worker" };
    }
  }

  /**
   * @param {{
   *   run: OfflineRunIdentity,
   *   receipt: OfflineReceipt,
   *   assetPackage: unknown,
   *   verified?: boolean
   * }} input
   */
  async function prepare({ run, receipt, assetPackage, verified = false }) {
    const target = targetStorage();
    if (!target) {
      return { ok: false, reason: "storage" };
    }
    if (!verified) {
      return { ok: false, reason: "receipt" };
    }
    const binding = validateBinding(run, receipt);
    if (!binding.ok) {
      return binding;
    }
    if (isExpired(receipt.binding.playExpiresAt, now())) {
      return { ok: false, reason: "expired" };
    }
    let normalizedPackage;
    try {
      normalizedPackage = normalizeOfflineAssetPackage(assetPackage);
    } catch {
      return { ok: false, reason: "package" };
    }
    if (
      normalizedPackage.assets.some((asset) => asset.scope === "account") &&
      !validAccountScope(accountScope)
    ) {
      return { ok: false, reason: "account-scope" };
    }

    const existingLog = readJson(target, OFFLINE_ACTION_LOG_KEY);
    const existingRecord = runRecord(readJson(target, OFFLINE_RUN_RECORD_KEY));
    if (isRecord(existingLog) && isRunIdentity(existingLog.run)) {
      if (
        !sameRunIdentity(existingLog.run, run) &&
        (!existingRecord || existingRecord.verification === "pending")
      ) {
        return { ok: false, reason: "active-run" };
      }
      if (sameRunIdentity(existingLog.run, run)) {
        const existingReceipt = readJson(target, OFFLINE_RECEIPT_KEY);
        const existingPackage = readJson(target, OFFLINE_CONTENT_PACK_KEY);
        const existingActionLog = readActionLog(existingLog);
        if (existingRecord) {
          return { ok: false, reason: "terminal" };
        }
        if (
          isReceipt(existingReceipt) &&
          JSON.stringify(existingReceipt) === JSON.stringify(receipt) &&
          isRecord(existingPackage) &&
          existingPackage.version === normalizedPackage.version &&
          existingActionLog
        ) {
          const worker = await setWorkerState(run, false, false);
          if (worker?.ok === false) {
            return { ok: false, reason: "worker", worker };
          }
          return { ok: true, durable: true, reused: true, worker };
        }
      }
    }

    const staleTerminalRecord = Boolean(
      existingRecord &&
        existingRecord.verification !== "pending" &&
        (!isRecord(existingLog) ||
          !isRunIdentity(existingLog.run) ||
          !sameRunIdentity(existingLog.run, run))
    );

    try {
      if (staleTerminalRecord) {
        if (target.removeItem) {
          target.removeItem(OFFLINE_RUN_RECORD_KEY);
        } else {
          target.setItem(OFFLINE_RUN_RECORD_KEY, "");
        }
      }
      writeJson(target, OFFLINE_RECEIPT_KEY, receipt);
      writeJson(target, OFFLINE_CONTENT_PACK_KEY, normalizedPackage);
      writeJson(target, OFFLINE_ACTION_LOG_KEY, {
        schema: ACTION_LOG_SCHEMA,
        run,
        recordable: true,
        actionLog: createRunActionLogV2()
      });
    } catch {
      discardDetailedState(target);
      return { ok: false, reason: "quota" };
    }

    const worker = await setWorkerState(run, false, false);
    if (worker?.ok === false) {
      const reason =
        isRecord(worker) && typeof worker.reason === "string"
          ? worker.reason
          : "worker";
      return { ok: false, reason, worker };
    }
    return { ok: true, durable: true, worker };
  }

  /** @param {string | null} nextAccountScope */
  function setAccountScope(nextAccountScope) {
    accountScope = nextAccountScope;
  }

  /**
   * @param {{
   *   run: OfflineRunIdentity,
   *   previous: Parameters<typeof tryAppendRunActionV2>[1],
   *   action: Parameters<typeof tryAppendRunActionV2>[2],
   *   next: Parameters<typeof tryAppendRunActionV2>[3]
   * }} transition
   */
  async function recordTransition({ run, previous, action, next }) {
    const target = targetStorage();
    if (!target) {
      return { ok: false, reason: "storage", durable: false };
    }
    const envelope = readJson(target, OFFLINE_ACTION_LOG_KEY);
    const receipt = readJson(target, OFFLINE_RECEIPT_KEY);
    const current = readActionLog(envelope);
    if (
      !isRecord(envelope) ||
      !isRunIdentity(envelope.run) ||
      !isReceipt(receipt) ||
      !receiptMatchesRun(receipt, run) ||
      !current
    ) {
      return { ok: false, reason: "unprepared", durable: false };
    }
    if (!sameRunIdentity(envelope.run, run)) {
      return { ok: false, reason: "binding", durable: false };
    }
    if (
      envelope.terminal === true ||
      runRecord(readJson(target, OFFLINE_RUN_RECORD_KEY))
    ) {
      return { ok: false, reason: "terminal", durable: false };
    }
    if (envelope.recordable === false) {
      return { ok: false, reason: "unrecordable", durable: false };
    }
    if (isExpired(receipt.binding.playExpiresAt, now())) {
      return {
        ok: false,
        reason: "expired",
        status: "paused-local-recovery",
        durable: false
      };
    }
    const nextLog = tryAppendRunActionV2(current, previous, action, next);
    if (!nextLog) {
      try {
        writeJson(target, OFFLINE_ACTION_LOG_KEY, {
          ...envelope,
          recordable: false,
          actionLog: current
        });
      } catch {
        // The in-memory result is still not presented as verified; no storage
        // error can turn an overflow into a claim of replayability.
      }
      return { ok: false, reason: "log-overflow", durable: false };
    }
    if (nextLog.actions.length === current.actions.length) {
      return { ok: true, durable: true, recorded: false, actionLog: current };
    }
    try {
      writeJson(target, OFFLINE_ACTION_LOG_KEY, {
        ...envelope,
        actionLog: nextLog
      });
    } catch {
      return { ok: false, reason: "quota", durable: false };
    }
    return { ok: true, durable: true, recorded: true, actionLog: nextLog };
  }

  /**
   * @param {{
   *   run: OfflineRunIdentity,
   *   terminalRun: Parameters<typeof tryAppendRunActionV2>[1],
   *   outcome: "won" | "lost",
   *   terminalAt?: Date
   * }} terminal
   */
  async function recordTerminal({
    run,
    terminalRun,
    outcome,
    terminalAt = now()
  }) {
    const target = targetStorage();
    if (!target) {
      return { ok: false, reason: "storage", durable: false };
    }
    const envelope = readJson(target, OFFLINE_ACTION_LOG_KEY);
    const receipt = readJson(target, OFFLINE_RECEIPT_KEY);
    const current = readActionLog(envelope);
    if (
      !isRecord(envelope) ||
      !isRunIdentity(envelope.run) ||
      !sameRunIdentity(envelope.run, run) ||
      !isReceipt(receipt) ||
      !receiptMatchesRun(receipt, run) ||
      !current
    ) {
      return { ok: false, reason: "unprepared", durable: false };
    }
    const terminal = terminalOutcome(outcome);
    if (!terminal) {
      return { ok: false, reason: "outcome", durable: false };
    }
    const recordable = envelope.recordable !== false;
    const playAuthorityOpen = !isExpired(receipt.binding.playExpiresAt, terminalAt);
    const verification = recordable && playAuthorityOpen ? "pending" : "unverified";
    const record = {
      schema: RUN_RECORD_SCHEMA,
      runId: run.runId,
      playerId: receipt.binding.playerId ?? null,
      seed: run.seed,
      levelId: run.levelId,
      labyrinthNumber: run.labyrinthNumber,
      rulesetRevision:
        run.rulesetRevision ?? receipt.binding.rulesetRevision,
      contentPackHash: run.contentPackHash,
      ...(typeof run.questId === "string" ? { questId: run.questId } : {}),
      outcome: terminal,
      score: Math.max(0, Math.round(terminalRun.score)),
      moves: Math.max(0, Math.round(terminalRun.moves)),
      elapsedMs: Math.max(0, Math.round(terminalRun.elapsedMs)),
      echoesCollected: terminalRun.echoes.filter((echo) => echo.collected).length,
      echoTotal: terminalRun.echoes.length,
      terminalAt: terminalAt.toISOString(),
      verification,
      label: verificationLabel(verification),
      playAuthorityOpen,
      idempotencyKey: offlineIdempotencyKey(run.runId),
      ...(verification === "unverified"
        ? { reason: recordable ? "expired" : "unrecordable" }
        : {})
    };
    try {
      writeJson(target, OFFLINE_RUN_RECORD_KEY, record);
      writeJson(target, OFFLINE_ACTION_LOG_KEY, {
        ...envelope,
        terminal: true,
        actionLog: current
      });
    } catch {
      return { ok: false, reason: "quota", durable: false, record };
    }

    const worker = await setWorkerState(run, true, true);
    return {
      ok: true,
      durable: worker?.ok !== false,
      record,
      worker
    };
  }

  /** @param {OfflineRunLocator} run */
  async function recover(run) {
    const target = targetStorage();
    if (!target) {
      return { ok: false, reason: "storage" };
    }
    const receipt = readJson(target, OFFLINE_RECEIPT_KEY);
    if (!isReceipt(receipt)) {
      return { ok: false, reason: "receipt" };
    }
    const receiptVerification = await verifyStoredReceipt(receipt);
    if (!receiptVerification.ok) {
      return receiptVerification;
    }
    const recoveredRun = /** @type {OfflineRunIdentity} */ ({
      runId: run.runId,
      seed: run.seed,
      levelId: run.levelId,
      labyrinthNumber: run.labyrinthNumber,
      rulesetRevision:
        run.rulesetRevision ?? receipt.binding.rulesetRevision,
      contentPackHash: run.contentPackHash ?? receipt.binding.contentPackHash,
      ...(typeof receipt.binding.questId === "string"
        ? { questId: receipt.binding.questId }
        : {})
    });
    const binding = validateBinding(recoveredRun, receipt);
    if (!binding.ok) {
      return binding;
    }
    const envelope = readJson(target, OFFLINE_ACTION_LOG_KEY);
    const actionLog = readActionLog(envelope);
    if (!isRecord(envelope) || !actionLog || !isRunIdentity(envelope.run)) {
      return { ok: false, reason: "action-log" };
    }
    const assetPackage = readJson(target, OFFLINE_CONTENT_PACK_KEY);
    try {
      normalizeOfflineAssetPackage(assetPackage);
    } catch {
      return { ok: false, reason: "package" };
    }
    if (!sameRunIdentity(envelope.run, recoveredRun)) {
      return { ok: false, reason: "binding" };
    }
    const record = runRecord(readJson(target, OFFLINE_RUN_RECORD_KEY));
    if (record?.verification === "pending") {
      return {
        ok: true,
        status: "terminal",
        run: recoveredRun,
        receipt,
        assetPackage,
        actionLog,
        record
      };
    }
    if (isExpired(receipt.binding.playExpiresAt, now())) {
      return {
        ok: false,
        status: "paused-local-recovery",
        reason: "expired",
        run: recoveredRun,
        receipt,
        assetPackage,
        actionLog
      };
    }
    return {
      ok: true,
      status: envelope.recordable === false ? "unverified" : "ready",
      run: recoveredRun,
      receipt,
      assetPackage,
      actionLog,
      record
    };
  }

  /** @param {StorageLike} target */
  function discardDetailedState(target) {
    let cleared = true;
    for (const key of [
      OFFLINE_RECEIPT_KEY,
      OFFLINE_CONTENT_PACK_KEY,
      OFFLINE_ACTION_LOG_KEY,
      OFFLINE_DEVICE_BINDING_KEY
    ]) {
      try {
        if (target.removeItem) {
          target.removeItem(key);
        } else {
          target.setItem(key, "");
        }
        if (target.getItem(key) !== null && target.getItem(key) !== "") {
          target.setItem(key, "");
        }
        if (target.getItem(key) !== null && target.getItem(key) !== "") {
          cleared = false;
        }
      } catch {
        try {
          target.setItem(key, "");
          if (target.getItem(key) !== "") {
            cleared = false;
          }
        } catch {
          cleared = false;
        }
      }
    }
    return cleared;
  }

  /** @param {Record<string, unknown>} record @param {"pending" | "verified" | "unverified"} verification @param {string} label @param {string | undefined} reason */
  function outcomeOnlyRecord(record, verification, label, reason) {
    return {
      schema: RUN_RECORD_SCHEMA,
      runId: record.runId,
      playerId: record.playerId ?? null,
      seed: record.seed,
      levelId: record.levelId,
      labyrinthNumber: record.labyrinthNumber,
      rulesetRevision: record.rulesetRevision,
      contentPackHash: record.contentPackHash,
      ...(typeof record.questId === "string"
        ? { questId: record.questId }
        : {}),
      outcome: record.outcome,
      score: record.score,
      moves: record.moves,
      elapsedMs: record.elapsedMs,
      echoesCollected: record.echoesCollected,
      echoTotal: record.echoTotal,
      terminalAt: record.terminalAt,
      verification,
      label,
      playAuthorityOpen: record.playAuthorityOpen,
      idempotencyKey: record.idempotencyKey,
      ...(reason ? { reason } : {})
    };
  }

  /** @param {Record<string, unknown>} value */
  function submissionOutcome(value) {
    if (
      !isRecord(value) ||
      !["accepted", "rejected", "expired", "invalid"].includes(
        String(value.status)
      )
    ) {
      return null;
    }
    return /** @type {{ status: "accepted" | "rejected" | "expired" | "invalid", duplicate?: boolean }} */ ({
      status: value.status,
      duplicate: value.duplicate === true
    });
  }

  /**
   * Submits the one pending terminal package. A response is terminal only
   * after the server has answered with an explicit replay outcome; every
   * transport or local-storage failure leaves the same action log and key for
   * the next reconnect.
   */
  async function reconcile() {
    const target = targetStorage();
    if (!target) {
      return { status: "pending", retry: true, reason: "storage" };
    }
    const storedRecord = runRecord(readJson(target, OFFLINE_RUN_RECORD_KEY));
    if (!storedRecord) {
      return { status: "none", retry: false, cloudWritten: false };
    }
    const record = storedRecord;
    const storageTarget = target;
    const storedRunId = /** @type {string} */ (record.runId);

    if (record.verification !== "pending") {
      const storedVerification = /** @type {"verified" | "unverified"} */ (
        record.verification
      );
      const label = verificationLabel(
        storedVerification
      );
      try {
        writeJson(
          storageTarget,
          OFFLINE_RUN_RECORD_KEY,
          outcomeOnlyRecord(record, storedVerification, label, undefined)
        );
      } catch {
        return { status: "pending", retry: true, reason: "storage" };
      }
      const cleared = discardDetailedState(storageTarget);
      if (!cleared) {
        return {
          status: storedVerification,
          verification: storedVerification,
          retry: true,
          reason: "storage",
          cloudWritten: storedVerification === "verified",
          cleared: false
        };
      }
      await release(storedRunId);
      return {
        status: storedVerification,
        verification: storedVerification,
        retry: false,
        cloudWritten: storedVerification === "verified",
        cleared
      };
    }

    const envelope = readJson(storageTarget, OFFLINE_ACTION_LOG_KEY);
    const receipt = readJson(storageTarget, OFFLINE_RECEIPT_KEY);
    const actionLog = readActionLog(envelope);
    const runCandidate = {
      runId: record.runId,
      seed: record.seed,
      levelId: record.levelId,
      labyrinthNumber: record.labyrinthNumber,
      rulesetRevision: record.rulesetRevision,
      contentPackHash: record.contentPackHash,
      ...(typeof record.questId === "string"
        ? { questId: record.questId }
        : {})
    };
    const run = /** @type {OfflineRunIdentity} */ (runCandidate);
    const packageReady =
      isRunIdentity(run) &&
      isReceipt(receipt) &&
      receiptMatchesRun(receipt, run) &&
      validateBinding(run, receipt).ok &&
      isRecord(envelope) &&
      envelope.terminal === true &&
      envelope.recordable !== false &&
      Boolean(actionLog) &&
      typeof record.terminalAt === "string";

    /** @param {"accepted" | "rejected" | "expired" | "invalid"} status @param {string} reason @param {boolean} duplicate */
    async function finalize(status, reason, duplicate = false) {
      const reconciliation = reconcileOfflineRun({
        outcome: { status, duplicate }
      });
      const nextRecord = outcomeOnlyRecord(
        record,
        reconciliation.verification,
        reconciliation.label,
        reconciliation.verification === "unverified" ? reason : undefined
      );
      try {
        writeJson(storageTarget, OFFLINE_RUN_RECORD_KEY, nextRecord);
      } catch {
        return {
          status: "pending",
          verification: "pending",
          retry: true,
          reason: "storage"
        };
      }
      const cleared = discardDetailedState(storageTarget);
      if (!cleared) {
        return {
          status,
          verification: reconciliation.verification,
          label: reconciliation.label,
          retry: true,
          reason: "storage",
          cloudWritten: reconciliation.cloudWritten,
          cleared: false
        };
      }
      await release(storedRunId);
      return {
        status,
        verification: reconciliation.verification,
        label: reconciliation.label,
        retry: false,
        cloudWritten: reconciliation.cloudWritten,
        cleared
      };
    }

    if (!submitOfflineRun) {
      return { status: "pending", retry: true, reason: "unavailable" };
    }
    if (!packageReady) {
      return finalize("invalid", "local-package");
    }

    const verifiedReceipt = /** @type {OfflineReceipt} */ (receipt);
    const verifiedActionLog = /** @type {RunActionLogV2} */ (actionLog);
    const terminalAt = /** @type {string} */ (record.terminalAt);
    let response;
    try {
      response = await submitOfflineRun({
        idempotencyKey: offlineIdempotencyKey(run.runId),
        receipt: verifiedReceipt,
        deviceInstallationHash: verifiedReceipt.binding.deviceInstallationHash,
        contentPackHash: verifiedReceipt.binding.contentPackHash,
        terminalAt,
        actionLog: verifiedActionLog
      });
    } catch {
      return {
        ...reconcileOfflineRun({ outcome: null, transportFailed: true }),
        status: "pending",
        reason: "transport"
      };
    }
    const outcome = submissionOutcome(
      /** @type {Record<string, unknown>} */ (response)
    );
    if (!outcome) {
      return {
        ...reconcileOfflineRun({ outcome: null, transportFailed: true }),
        status: "pending",
        reason: "response"
      };
    }
    return finalize(outcome.status, outcome.status, outcome.duplicate);
  }

  /** @param {{ run: OfflineRunIdentity, reason?: string }} input */
  async function markUnrecordable({ run, reason = "unrecordable" }) {
    const target = targetStorage();
    if (!target) {
      return { ok: false, reason: "storage", durable: false };
    }
    const envelope = readJson(target, OFFLINE_ACTION_LOG_KEY);
    const receipt = readJson(target, OFFLINE_RECEIPT_KEY);
    const current = readActionLog(envelope);
    if (
      !isRecord(envelope) ||
      !isRunIdentity(envelope.run) ||
      !sameRunIdentity(envelope.run, run) ||
      !isReceipt(receipt) ||
      !receiptMatchesRun(receipt, run) ||
      !current
    ) {
      return { ok: false, reason: "unprepared", durable: false };
    }
    if (envelope.recordable === false) {
      return { ok: true, durable: true, recorded: false, reason };
    }
    try {
      writeJson(target, OFFLINE_ACTION_LOG_KEY, {
        ...envelope,
        recordable: false,
        unrecordableReason: reason,
        actionLog: current
      });
    } catch {
      return { ok: false, reason: "quota", durable: false };
    }
    return { ok: true, durable: true, recorded: true, reason };
  }

  /**
   * Discards a non-terminal prepared Run after online play has ended before
   * Offline Continuity became active. The run id check makes this narrow: a
   * late preparation cannot clear a newer Run's local authority.
   *
   * @param {string} runId
   */
  async function cancelPreparedRun(runId) {
    const target = targetStorage();
    if (target) {
      const envelope = readJson(target, OFFLINE_ACTION_LOG_KEY);
      const record = runRecord(readJson(target, OFFLINE_RUN_RECORD_KEY));
      if (
        isRecord(envelope) &&
        isRunIdentity(envelope.run) &&
        envelope.run.runId === runId &&
        envelope.terminal !== true &&
        record?.verification !== "pending"
      ) {
        const cleared = discardDetailedState(target);
        await release(runId);
        return { ok: cleared, durable: cleared, cleared };
      }
    }
    await release(runId);
    return { ok: true, durable: true, cleared: false };
  }

  /** @param {string} runId */
  async function release(runId) {
    const target = targetStorage();
    if (workerClient?.release) {
      try {
        await workerClient.release(runId);
      } catch {
        // Local state remains the source of truth if the worker has restarted.
      }
    }
    return { ok: Boolean(target) };
  }

  return {
    prepare,
    recordTransition,
    recordTerminal,
    recover,
    reconcile,
    markUnrecordable,
    cancelPreparedRun,
    setAccountScope,
    release
  };
}
