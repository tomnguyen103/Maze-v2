import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classRunNetworkLoss,
  offlineContinuityOffer,
  offlineIdempotencyKey,
  offlinePlayExpiry,
  offlineSubmissionExpiry,
  OFFLINE_UNVERIFIED_LABEL,
  PENDING_VERIFICATION_LABEL,
  reconcileOfflineRun
} from "../src/game/offline-continuity.js";
import { createOfflineReceiptSigner } from "../server/offline-receipt.js";

const DEVICE = "a".repeat(64);
const PACK = "b".repeat(64);
const ISSUED_AT = "2026-07-31T00:00:00.000Z";
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const RUN = {
  runId: "offline_run_01J1MOSSWATCH",
  seed: "MOSS-WATCH-11",
  levelId: "trail-scout",
  labyrinthNumber: 4,
  rulesetRevision: "tide-doors-v1"
};

function receipt() {
  return createOfflineReceiptSigner({ privateKey, keyId: "offline-test" }).issue(
    {
      ...RUN,
      levelId: /** @type {"trail-scout"} */ ("trail-scout"),
      playerId: "user_moss",
      classroomId: null,
      deviceInstallationHash: DEVICE,
      contentPackHash: PACK
    },
    { issuedAt: ISSUED_AT }
  );
}

/** @param {Record<string, unknown>} [overrides] */
function context(overrides = {}) {
  return {
    receipt: receipt(),
    verified: true,
    classroomId: null,
    run: RUN,
    deviceInstallationHash: DEVICE,
    contentPackHash: PACK,
    now: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("Continue Offline eligibility", () => {
  it("is offered for an eligible Run holding a valid receipt", () => {
    expect(offlineContinuityOffer(context())).toEqual({ offered: true });
  });

  it("is never offered for a Class Run", () => {
    expect(
      offlineContinuityOffer(context({ classroomId: "org_class_1" }))
    ).toEqual({ offered: false, reason: "class-run" });
  });

  it("is withheld without a receipt, or one that failed verification", () => {
    expect(offlineContinuityOffer(context({ receipt: null }))).toEqual({
      offered: false,
      reason: "receipt"
    });
    expect(offlineContinuityOffer(context({ verified: false }))).toEqual({
      offered: false,
      reason: "receipt"
    });
  });

  it("is withheld when the receipt names another device or Run", () => {
    expect(
      offlineContinuityOffer(
        context({ deviceInstallationHash: "c".repeat(64) })
      )
    ).toEqual({ offered: false, reason: "binding" });
    expect(
      offlineContinuityOffer(
        context({ run: { ...RUN, seed: "OTHER-SEED-1" } })
      )
    ).toEqual({ offered: false, reason: "binding" });
  });

  it("is withheld once play authority has run out", () => {
    expect(
      offlineContinuityOffer(context({ now: new Date("2026-08-08T00:00:00.000Z") }))
    ).toEqual({ offered: false, reason: "expired" });
  });
});

describe("Network loss and expiry preserve rather than delete", () => {
  it("keeps a Class Run as paused recovery pending both authorities", () => {
    expect(classRunNetworkLoss()).toEqual({
      preserved: "paused-local-recovery",
      resumeRequires: ["membership", "assignment"]
    });
  });

  it("keeps a non-terminal Run when play authority expires offline", () => {
    expect(
      offlinePlayExpiry(receipt(), new Date("2026-08-08T00:00:00.000Z"))
    ).toEqual({
      expired: true,
      preserved: "paused-local-recovery",
      resumeRequires: ["reconnect"]
    });
  });

  it("keeps the outcome-only Run Record when the deadline is missed", () => {
    const missed = offlineSubmissionExpiry(
      receipt(),
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-05T00:00:00.000Z")
    );

    expect(missed).toMatchObject({
      expired: true,
      discardDetailedLog: true,
      label: OFFLINE_UNVERIFIED_LABEL,
      keepsRunRecord: true
    });
  });
});

describe("Verification labels", () => {
  it("starts Pending verification and clears on a successful replay", () => {
    const pending = reconcileOfflineRun({ outcome: null });
    expect(pending).toMatchObject({
      label: PENDING_VERIFICATION_LABEL,
      retry: true,
      discardDetailedLog: false
    });

    const accepted = reconcileOfflineRun({ outcome: { status: "accepted" } });
    expect(accepted).toMatchObject({
      verification: "verified",
      label: "",
      discardDetailedLog: true,
      cloudWritten: true
    });
  });

  it("leaves a terminal rejection Offline—unverified with no cloud change", () => {
    for (const status of ["rejected", "expired", "invalid"]) {
      expect(
        reconcileOfflineRun({
          outcome: { status: /** @type {"rejected"} */ (status) }
        })
      ).toEqual({
        verification: "unverified",
        label: OFFLINE_UNVERIFIED_LABEL,
        discardDetailedLog: true,
        retry: false,
        cloudWritten: false
      });
    }
  });

  it("uses the exact wording the contract fixes", () => {
    expect(PENDING_VERIFICATION_LABEL).toBe("Pending verification");
    expect(OFFLINE_UNVERIFIED_LABEL).toBe("Offline—unverified");
  });

  it("keeps the log and retries when transport fails, resolving nothing", () => {
    expect(
      reconcileOfflineRun({ outcome: null, transportFailed: true })
    ).toMatchObject({
      verification: "pending",
      discardDetailedLog: false,
      retry: true,
      cloudWritten: false
    });
  });

  it("reports no second cloud write for a duplicate acceptance", () => {
    expect(
      reconcileOfflineRun({ outcome: { status: "accepted", duplicate: true } })
    ).toMatchObject({ verification: "verified", cloudWritten: false });
  });

  it("mints one idempotency key per Run, whatever the attempt", () => {
    expect(offlineIdempotencyKey(RUN.runId)).toBe(
      `offline_${RUN.runId}`
    );
    expect(offlineIdempotencyKey(RUN.runId)).toBe(
      offlineIdempotencyKey(RUN.runId)
    );
  });
});
