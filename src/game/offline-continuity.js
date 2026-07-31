import {
  offlinePlayAuthorityOpen,
  offlineSubmissionOpen,
  receiptBindingMatches
} from "../../shared/offline-receipt.js";
import {
  OFFLINE_ACTION_LOG_KEY,
  OFFLINE_RECEIPT_KEY,
  OFFLINE_RUN_RECORD_KEY
} from "./offline-local-scrub.js";

/**
 * The Continue Offline player flow, per ADRs 0034 and 0035.
 *
 * Three things decide everything here. Continue Offline is offered only for an
 * eligible Guest or Personal Run holding a receipt that verifies and still has
 * play authority. A Class Run is never offered it — a disconnected client
 * cannot establish that Membership and assignment authority are still active,
 * so it is preserved as paused local recovery and resumed only after an online
 * recheck of both. And the label an Explorer sees is always the truth about
 * verification, never an optimistic guess.
 *
 * @typedef {import("../../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 * @typedef {"pending" | "verified" | "unverified"} VerificationState
 */

export const PENDING_VERIFICATION_LABEL = "Pending verification";
export const OFFLINE_UNVERIFIED_LABEL = "Offline—unverified";

/** @param {VerificationState} state */
export function verificationLabel(state) {
  if (state === "pending") {
    return PENDING_VERIFICATION_LABEL;
  }
  return state === "unverified" ? OFFLINE_UNVERIFIED_LABEL : "";
}

/**
 * @param {{
 *   receipt: OfflineReceipt | null,
 *   verified: boolean,
 *   classroomId: string | null,
 *   run: {
 *     runId: string,
 *     seed: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string
 *   },
 *   deviceInstallationHash: string,
 *   contentPackHash: string,
 *   now: Date
 * }} context
 * @returns {{ offered: boolean, reason?: string }}
 */
export function offlineContinuityOffer(context) {
  if (context.classroomId) {
    // Not "no receipt yet" but "never": ADR 0034 makes Class Play ineligible,
    // and offering it here would promise something the server refuses to sign.
    return { offered: false, reason: "class-run" };
  }
  if (!context.receipt || !context.verified) {
    return { offered: false, reason: "receipt" };
  }
  if (
    !receiptBindingMatches(context.receipt, {
      runId: context.run.runId,
      deviceInstallationHash: context.deviceInstallationHash,
      seed: context.run.seed,
      levelId: context.run.levelId,
      labyrinthNumber: context.run.labyrinthNumber,
      rulesetRevision: context.run.rulesetRevision,
      contentPackHash: context.contentPackHash
    })
  ) {
    return { offered: false, reason: "binding" };
  }
  if (!offlinePlayAuthorityOpen(context.receipt, context.now)) {
    return { offered: false, reason: "expired" };
  }
  return { offered: true };
}

/**
 * What happens to a Class Run when the network drops. Never a deletion: the
 * Run is preserved exactly as it was, and continuing requires both authorities
 * to be rechecked online.
 */
export function classRunNetworkLoss() {
  return {
    preserved: "paused-local-recovery",
    resumeRequires: Object.freeze(["membership", "assignment"])
  };
}

/**
 * Play authority running out mid-Run is not a loss of progress. The Run is
 * preserved as paused Active Run Recovery and Continue Offline asks for a
 * reconnection instead.
 *
 * @param {OfflineReceipt} receipt
 * @param {Date} now
 */
export function offlinePlayExpiry(receipt, now) {
  if (offlinePlayAuthorityOpen(receipt, now)) {
    return { expired: false };
  }
  return {
    expired: true,
    preserved: "paused-local-recovery",
    resumeRequires: Object.freeze(["reconnect"])
  };
}

/**
 * Reconciles one reconnect. The label is derived from the server's answer, and
 * the detailed log is deleted the moment verification resolves either way —
 * success or terminal rejection. A transport failure resolves nothing, so the
 * log stays and the retry reuses the same idempotency key.
 *
 * @param {{
 *   outcome: {
 *     status: "accepted" | "rejected" | "expired" | "invalid",
 *     duplicate?: boolean
 *   } | null,
 *   transportFailed?: boolean
 * }} reconciliation
 * @returns {{
 *   verification: VerificationState,
 *   label: string,
 *   discardDetailedLog: boolean,
 *   retry: boolean,
 *   cloudWritten: boolean
 * }}
 */
export function reconcileOfflineRun({ outcome, transportFailed = false }) {
  if (transportFailed || !outcome) {
    return {
      verification: "pending",
      label: PENDING_VERIFICATION_LABEL,
      discardDetailedLog: false,
      retry: true,
      cloudWritten: false
    };
  }
  if (outcome.status === "accepted") {
    return {
      verification: "verified",
      label: "",
      discardDetailedLog: true,
      retry: false,
      cloudWritten: outcome.duplicate !== true
    };
  }
  // Rejected, expired, and invalid are all terminal: the Run keeps its local
  // memory and its honest label, and nothing cloud-side moved.
  return {
    verification: "unverified",
    label: OFFLINE_UNVERIFIED_LABEL,
    discardDetailedLog: true,
    retry: false,
    cloudWritten: false
  };
}

/**
 * Missing the submission deadline keeps the outcome-only local Run Record and
 * discards the detailed log. Expiry never deletes what the Explorer did.
 *
 * @param {OfflineReceipt} receipt
 * @param {Date} terminalAt
 * @param {Date} now
 */
export function offlineSubmissionExpiry(receipt, terminalAt, now) {
  if (offlineSubmissionOpen(receipt, terminalAt, now)) {
    return { expired: false, discardDetailedLog: false };
  }
  return {
    expired: true,
    discardDetailedLog: true,
    verification: /** @type {VerificationState} */ ("unverified"),
    label: OFFLINE_UNVERIFIED_LABEL,
    keepsRunRecord: true
  };
}

/**
 * One key per Run, minted once and reused by every retry. Deriving it from the
 * Run rather than from the attempt is what makes a retry idempotent instead of
 * merely usually harmless.
 *
 * @param {string} runId
 */
export function offlineIdempotencyKey(runId) {
  return `offline_${runId}`;
}

/**
 * The local artefacts this flow writes, so the sign-out scrub and this module
 * cannot drift apart about what "the offline state" is.
 */
export const OFFLINE_CONTINUITY_KEYS = Object.freeze({
  receipt: OFFLINE_RECEIPT_KEY,
  actionLog: OFFLINE_ACTION_LOG_KEY,
  runRecord: OFFLINE_RUN_RECORD_KEY
});
