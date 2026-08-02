/**
 * Offline Continuity Receipt shape and windows, per ADR 0034.
 *
 * A receipt proves one exact Run was admitted online. It is not an
 * entitlement: it authorises continuing that Run and nothing else — no second
 * Run, no configuration change, no purchase, no Daily submission, and no
 * direct cloud write. The binding below is the whole receipt, which is what
 * makes that claim checkable rather than merely stated.
 *
 * @typedef {{
 *   runId: string,
 *   playerId: string | null,
 *   questId?: string,
 *   deviceInstallationHash: string,
 *   seed: string,
 *   levelId: "bright-start" | "trail-scout" | "maze-master",
 *   labyrinthNumber: number,
 *   rulesetRevision: string,
 *   contentPackHash: string,
 *   issuedAt: string,
 *   playExpiresAt: string,
 *   submissionExpiresAt: string,
 *   learningDeckId?: string,
 *   learningDeckRevision?: string,
 *   initialQuestionOrdinal?: number,
 *   initialUsedQuestionIds?: string[]
 * }} OfflineReceiptBinding
 * @typedef {{
 *   schema: string,
 *   algorithm: string,
 *   keyId: string,
 *   binding: OfflineReceiptBinding,
 *   signature: string
 * }} OfflineReceipt
 */

export const OFFLINE_RECEIPT_SCHEMA = "echo-maze-offline-receipt/1";
export const OFFLINE_RECEIPT_ALGORITHM = "ecdsa-p256-sha256";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Play authority ends here, or at terminal state, whichever comes first. */
export const OFFLINE_PLAY_WINDOW_MS = 7 * DAY_MS;
/** The hard cap on submission validity, however late the Run ends. */
export const OFFLINE_SUBMISSION_WINDOW_MS = 9 * DAY_MS;
/** How long a terminal Run stays submittable, within that cap. */
export const OFFLINE_TERMINAL_GRACE_MS = 48 * HOUR_MS;

/**
 * The exact bytes both sides sign and verify. Built as an ordered array rather
 * than by serialising the object, because JSON key order is not a contract and
 * a verifier that disagreed with the signer about it would reject every valid
 * receipt.
 *
 * @param {{ schema: string, algorithm: string, keyId: string, binding: OfflineReceiptBinding }} receipt
 */
export function offlineReceiptSigningInput({
  schema,
  algorithm,
  keyId,
  binding
}) {
  const fields = [
    schema,
    algorithm,
    keyId,
    binding.runId,
    binding.playerId ?? "",
    binding.deviceInstallationHash,
    binding.seed,
    binding.levelId,
    binding.labyrinthNumber,
    binding.rulesetRevision,
    binding.contentPackHash,
    binding.learningDeckId ?? "",
    binding.learningDeckRevision ?? "",
    binding.initialQuestionOrdinal ?? "",
    JSON.stringify(binding.initialUsedQuestionIds ?? []),
    binding.issuedAt,
    binding.playExpiresAt,
    binding.submissionExpiresAt
  ];
  // Appending the Quest identity keeps receipts issued before this field was
  // introduced verifiable while binding every newly issued receipt to the
  // exact Quest whose boundary it may advance.
  if (binding.questId !== undefined) {
    fields.push(binding.questId);
  }
  return JSON.stringify(fields);
}

/**
 * Every field a copied receipt would have to lie about. A receipt presented
 * for a different device, Run, seed, Level, Labyrinth, ruleset, or content
 * pack fails here before its signature is ever checked.
 *
 * @param {OfflineReceipt} receipt
 * @param {{
 *   runId: string,
 *   questId?: string,
 *   deviceInstallationHash: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   rulesetRevision: string,
 *   contentPackHash: string,
 *   learningDeckId?: string,
 *   learningDeckRevision?: string,
 *   initialQuestionOrdinal?: number,
 *   initialUsedQuestionIds?: string[]
 * }} claim
 */
export function receiptBindingMatches(receipt, claim) {
  const binding = receipt?.binding;
  return Boolean(
    binding &&
      binding.runId === claim.runId &&
      (claim.questId === undefined || binding.questId === claim.questId) &&
      binding.deviceInstallationHash === claim.deviceInstallationHash &&
      binding.seed === claim.seed &&
      binding.levelId === claim.levelId &&
      binding.labyrinthNumber === claim.labyrinthNumber &&
      binding.rulesetRevision === claim.rulesetRevision &&
      binding.contentPackHash === claim.contentPackHash &&
      (claim.learningDeckId === undefined ||
        binding.learningDeckId === claim.learningDeckId) &&
      (claim.learningDeckRevision === undefined ||
        binding.learningDeckRevision === claim.learningDeckRevision) &&
      (claim.initialQuestionOrdinal === undefined ||
        binding.initialQuestionOrdinal === claim.initialQuestionOrdinal) &&
      (claim.initialUsedQuestionIds === undefined ||
        JSON.stringify(binding.initialUsedQuestionIds ?? []) ===
          JSON.stringify(claim.initialUsedQuestionIds))
  );
}

/**
 * @param {OfflineReceipt} receipt
 * @param {Date} now
 */
export function offlinePlayAuthorityOpen(receipt, now) {
  return now.getTime() < Date.parse(receipt.binding.playExpiresAt);
}

/**
 * A terminal Run stays submittable for 48 hours, but never past the receipt's
 * signed cap. The terminal instant is not known at issue, so the receipt
 * carries the cap and the deadline is the earlier of the two.
 *
 * @param {OfflineReceipt} receipt
 * @param {Date} terminalAt
 */
export function offlineSubmissionDeadline(receipt, terminalAt) {
  const capped = Date.parse(receipt.binding.submissionExpiresAt);
  const granted = terminalAt.getTime() + OFFLINE_TERMINAL_GRACE_MS;
  return new Date(Math.min(capped, granted)).toISOString();
}

/**
 * @param {OfflineReceipt} receipt
 * @param {Date} terminalAt
 * @param {Date} now
 */
export function offlineSubmissionOpen(receipt, terminalAt, now) {
  return now.getTime() < Date.parse(offlineSubmissionDeadline(receipt, terminalAt));
}

/**
 * The two instants the server stores alongside the receipt it signed.
 *
 * @param {string} issuedAt
 */
export function offlineReceiptWindows(issuedAt) {
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued)) {
    throw new Error("Offline receipt needs a valid issue time.");
  }
  return {
    playExpiresAt: new Date(issued + OFFLINE_PLAY_WINDOW_MS).toISOString(),
    submissionExpiresAt: new Date(
      issued + OFFLINE_SUBMISSION_WINDOW_MS
    ).toISOString()
  };
}
