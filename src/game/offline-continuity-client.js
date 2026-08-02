import {
  loadOrCreateOfflineDeviceInstallationNonce
} from "./offline-device.js";
import { createConfiguredOfflineReceiptVerifier } from "./offline-receipt-config.js";
import { createOfflineWorkerClient } from "./offline-worker-client.js";
import { OFFLINE_DEVICE_BINDING_KEY } from "./offline-local-scrub.js";

/** @typedef {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} OfflineAssetPackage */

/**
 * The browser boundary for the first Offline Continuity slice. Receipt
 * verification happens before the worker sees a package, and the worker only
 * receives the exact manifest returned with that verified receipt.
 *
 * @param {{
 *   playerController: {
 *     issueOfflineReceipt: (
 *       run: { runId: string, seed: string, levelId: string, labyrinthNumber: number, questId?: string },
 *       deviceInstallationNonce: string
 *     ) => Promise<{ receipt: unknown, assetPackage: OfflineAssetPackage }>
 *   },
 *   receiptVerifier?: { verify: (receipt: unknown) => Promise<{ valid: boolean, reason?: string }> } | null,
 *   workerClient?: {
 *     pin: (assetPackage: OfflineAssetPackage, options?: { accountScope?: string | null }) => Promise<unknown>,
 *     setRunState?: (message: { runId: string, version: string, terminal: boolean, durable: boolean, accountScope?: string }) => Promise<unknown>,
 *     release?: (runId: string) => Promise<unknown>,
 *     signOut?: () => Promise<unknown>
 *   },
 *   storage?: { getItem: (key: string) => string | null, setItem: (key: string, value: string) => unknown },
 *   cryptoLike?: { randomUUID?: () => string },
 *   accountScope?: string | null
 * }} dependencies
 */
export function createOfflineContinuityClient({
  playerController,
  receiptVerifier = createConfiguredOfflineReceiptVerifier(),
  workerClient = createOfflineWorkerClient(),
  storage = globalThis.localStorage,
  cryptoLike = globalThis.crypto,
  accountScope: initialAccountScope = null
}) {
  let accountScope = initialAccountScope;
  /** @param {string} runId */
  function deviceInstallationHashFor(runId) {
    try {
      const stored = storage.getItem(OFFLINE_DEVICE_BINDING_KEY);
      const binding = stored ? JSON.parse(stored) : null;
      return binding?.runId === runId &&
        typeof binding.deviceInstallationHash === "string"
        ? binding.deviceInstallationHash
        : null;
    } catch {
      return null;
    }
  }

  /** @param {string} runId @param {unknown} receipt */
  function rememberDeviceBinding(runId, receipt) {
    const binding =
      receipt && typeof receipt === "object"
        ? /** @type {Record<string, unknown>} */ (receipt).binding
        : null;
    if (
      !binding ||
      typeof binding !== "object" ||
      typeof /** @type {Record<string, unknown>} */ (binding).deviceInstallationHash !== "string"
    ) {
      return false;
    }
    try {
      storage.setItem(
        OFFLINE_DEVICE_BINDING_KEY,
        JSON.stringify({
          runId,
          deviceInstallationHash:
            /** @type {Record<string, unknown>} */ (binding)
              .deviceInstallationHash
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param {unknown} receipt
   * @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, questId?: string }} run
   */
  function receiptMatchesRun(receipt, run) {
    if (!receipt || typeof receipt !== "object") {
      return false;
    }
    const binding = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (receipt)
    ).binding;
    return Boolean(
      binding &&
        typeof binding === "object" &&
        /** @type {Record<string, unknown>} */ (binding).runId === run.runId &&
        /** @type {Record<string, unknown>} */ (binding).seed === run.seed &&
        /** @type {Record<string, unknown>} */ (binding).levelId === run.levelId &&
        /** @type {Record<string, unknown>} */ (binding).labyrinthNumber ===
          run.labyrinthNumber &&
        questIdentityMatches(
          /** @type {Record<string, unknown>} */ (binding).questId,
          run.questId
        )
    );
  }

  /** @param {unknown} left @param {unknown} right */
  function questIdentityMatches(left, right) {
    return (
      left === right ||
      (left === undefined && !isQuestIIQuestId(right)) ||
      (right === undefined && !isQuestIIQuestId(left))
    );
  }

  /** @param {unknown} value */
  function isQuestIIQuestId(value) {
    return typeof value === "string" && /^quest_ii_/iu.test(value);
  }

  /** @param {unknown} receipt */
  async function verifyReceipt(receipt) {
    if (!receiptVerifier) {
      return { valid: false, reason: "unconfigured" };
    }
    try {
      return await receiptVerifier.verify(receipt);
    } catch {
      return { valid: false, reason: "receipt" };
    }
  }

  /** @param {OfflineAssetPackage} assetPackage */
  function pinAssetPackage(assetPackage) {
    return workerClient.pin(assetPackage, { accountScope });
  }

  /** @param {string | null} nextAccountScope */
  function setAccountScope(nextAccountScope) {
    accountScope = nextAccountScope;
  }

  /**
   * Issues, verifies, and pins one exact admitted Run. A failed verification
   * never reaches the worker, and a failed pin is returned to the caller so
   * online play is not presented as offline-ready.
   *
   * @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, questId?: string }} run
   */
  async function issueAndPin(run) {
    if (!receiptVerifier) {
      return { ok: false, reason: "unconfigured" };
    }
    let deviceInstallationNonce;
    try {
      deviceInstallationNonce = loadOrCreateOfflineDeviceInstallationNonce(
        storage,
        cryptoLike
      );
    } catch {
      return { ok: false, reason: "device" };
    }
    let issued;
    try {
      issued = await playerController.issueOfflineReceipt(
        run,
        deviceInstallationNonce
      );
    } catch {
      return { ok: false, reason: "issue" };
    }
    if (!issued || typeof issued !== "object") {
      return { ok: false, reason: "issue" };
    }
    const verification = await verifyReceipt(issued.receipt);
    if (!verification.valid) {
      return { ok: false, reason: "receipt", verification };
    }
    if (!receiptMatchesRun(issued.receipt, run)) {
      return { ok: false, reason: "binding", verification };
    }
    if (!rememberDeviceBinding(run.runId, issued.receipt)) {
      return { ok: false, reason: "device", verification };
    }
    let pin;
    try {
      pin = await pinAssetPackage(issued.assetPackage);
    } catch {
      return { ok: false, reason: "pin", verification };
    }
    if (
      !pin ||
      typeof pin !== "object" ||
      /** @type {Record<string, unknown>} */ (pin).ok !== true
    ) {
      return { ok: false, reason: "pin", verification, pin };
    }
    return {
      ok: true,
      receipt: issued.receipt,
      assetPackage: issued.assetPackage,
      verification,
      pin
    };
  }

  return {
    issueAndPin,
    verifyReceipt,
    deviceInstallationHashFor,
    pinAssetPackage,
    setAccountScope,
    workerClient
  };
}
