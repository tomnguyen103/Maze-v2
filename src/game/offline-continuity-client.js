import {
  loadOrCreateOfflineDeviceInstallationNonce
} from "./offline-device.js";
import { createConfiguredOfflineReceiptVerifier } from "./offline-receipt-config.js";
import { createOfflineWorkerClient } from "./offline-worker-client.js";

/** @typedef {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} OfflineAssetPackage */

/**
 * The browser boundary for the first Offline Continuity slice. Receipt
 * verification happens before the worker sees a package, and the worker only
 * receives the exact manifest returned with that verified receipt.
 *
 * @param {{
 *   playerController: {
 *     issueOfflineReceipt: (
 *       run: { runId: string, seed: string, levelId: string, labyrinthNumber: number },
 *       deviceInstallationNonce: string
 *     ) => Promise<{ receipt: unknown, assetPackage: OfflineAssetPackage }>
 *   },
 *   receiptVerifier?: { verify: (receipt: unknown) => Promise<{ valid: boolean, reason?: string }> } | null,
 *   workerClient?: {
 *     pin: (assetPackage: OfflineAssetPackage, options?: { accountScope?: string | null }) => Promise<unknown>
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
  accountScope = null
}) {
  /**
   * @param {unknown} receipt
   * @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run
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
          run.labyrinthNumber
    );
  }

  /** @param {unknown} receipt */
  async function verifyReceipt(receipt) {
    if (!receiptVerifier) {
      return { valid: false, reason: "unconfigured" };
    }
    return receiptVerifier.verify(receipt);
  }

  /** @param {OfflineAssetPackage} assetPackage */
  function pinAssetPackage(assetPackage) {
    return workerClient.pin(assetPackage, { accountScope });
  }

  /**
   * Issues, verifies, and pins one exact admitted Run. A failed verification
   * never reaches the worker, and a failed pin is returned to the caller so
   * online play is not presented as offline-ready.
   *
   * @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run
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
    const issued = await playerController.issueOfflineReceipt(
      run,
      deviceInstallationNonce
    );
    const verification = await verifyReceipt(issued.receipt);
    if (!verification.valid) {
      return { ok: false, reason: "receipt", verification };
    }
    if (!receiptMatchesRun(issued.receipt, run)) {
      return { ok: false, reason: "binding", verification };
    }
    const pin = await pinAssetPackage(issued.assetPackage);
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

  return { issueAndPin, verifyReceipt, pinAssetPackage };
}
