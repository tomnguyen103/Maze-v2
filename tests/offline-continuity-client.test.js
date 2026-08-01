import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_DEVICE_NONCE_KEY
} from "../src/game/offline-device.js";
import { createOfflineContinuityClient } from "../src/game/offline-continuity-client.js";

const RUN = {
  runId: "access_01J1MOSSWATCH",
  seed: "MOSS-WATCH-11",
  levelId: "trail-scout",
  labyrinthNumber: 4
};
const RECEIPT = {
  schema: "echo-maze-offline-receipt/1",
  binding: {
    runId: RUN.runId,
    seed: RUN.seed,
    levelId: RUN.levelId,
    labyrinthNumber: RUN.labyrinthNumber
  }
};
/** @type {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} */
const ASSET_PACKAGE = {
  version: "build_01MOSS",
  assets: [{ url: "/index.html", scope: "public" }]
};

function storage() {
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value),
    /** @param {string} key */
    removeItem: (key) => values.delete(key)
  };
}

function cryptoLike() {
  return /** @type {{ randomUUID: () => string }} */ (
    /** @type {unknown} */ ({ randomUUID: () => "installation_nonce_01MOSS" })
  );
}

describe("Offline Continuity browser boundary", () => {
  it("verifies before pinning the exact server-returned package", async () => {
    const localStorage = storage();
    const issueOfflineReceipt = vi.fn(async () => ({
      receipt: RECEIPT,
      assetPackage: ASSET_PACKAGE
    }));
    const verify = vi.fn(async () => ({ valid: true }));
    const pin = vi.fn(async () => ({ ok: true, version: ASSET_PACKAGE.version }));
    const client = createOfflineContinuityClient({
      playerController: { issueOfflineReceipt },
      receiptVerifier: { verify },
      workerClient: { pin },
      storage: localStorage,
      cryptoLike: cryptoLike(),
      accountScope: "user_01MOSS"
    });

    await expect(client.issueAndPin(RUN)).resolves.toMatchObject({ ok: true });
    expect(localStorage.getItem(OFFLINE_DEVICE_NONCE_KEY)).toBe(
      "installation_nonce_01MOSS"
    );
    expect(issueOfflineReceipt).toHaveBeenCalledWith(
      RUN,
      "installation_nonce_01MOSS"
    );
    expect(verify).toHaveBeenCalledWith(RECEIPT);
    expect(pin).toHaveBeenCalledWith(ASSET_PACKAGE, {
      accountScope: "user_01MOSS"
    });
  });

  it("does not pin an unverifiable receipt and reports a failed pin", async () => {
    const issueOfflineReceipt = vi.fn(async () => ({
      receipt: RECEIPT,
      assetPackage: ASSET_PACKAGE
    }));
    const pin = vi.fn(async () => ({ ok: false, reason: "timeout" }));
    const client = createOfflineContinuityClient({
      playerController: { issueOfflineReceipt },
      receiptVerifier: {
        verify: async () => ({ valid: false, reason: "signature" })
      },
      workerClient: { pin },
      storage: storage(),
      cryptoLike: cryptoLike()
    });

    await expect(client.issueAndPin(RUN)).resolves.toMatchObject({
      ok: false,
      reason: "receipt"
    });
    expect(pin).not.toHaveBeenCalled();

    const pinFailure = createOfflineContinuityClient({
      playerController: { issueOfflineReceipt },
      receiptVerifier: { verify: async () => ({ valid: true }) },
      workerClient: { pin },
      storage: storage(),
      cryptoLike: cryptoLike()
    });
    await expect(pinFailure.issueAndPin(RUN)).resolves.toMatchObject({
      ok: false,
      reason: "pin"
    });

    const mismatched = createOfflineContinuityClient({
      playerController: { issueOfflineReceipt },
      receiptVerifier: { verify: async () => ({ valid: true }) },
      workerClient: { pin: vi.fn(async () => ({ ok: true })) },
      storage: storage(),
      cryptoLike: cryptoLike()
    });
    issueOfflineReceipt.mockResolvedValueOnce({
      receipt: { ...RECEIPT, binding: { ...RECEIPT.binding, runId: "other-run" } },
      assetPackage: ASSET_PACKAGE
    });
    await expect(mismatched.issueAndPin(RUN)).resolves.toMatchObject({
      ok: false,
      reason: "binding"
    });
  });
});
