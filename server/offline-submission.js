import {
  offlinePlayAuthorityOpen,
  offlineSubmissionOpen,
  receiptBindingMatches
} from "../shared/offline-receipt.js";
import { ReplayInputError, verifyOfflineRunReplay } from "./run-replay.js";

/**
 * Accepting an offline Run, per ADR 0035.
 *
 * The order here is the whole guarantee. A signature is checked before a
 * binding, a binding before a window, a window before a replay, and the replay
 * before anything at all is written. Nothing reaches Cloud Quest Progress, the
 * Lantern Journal, or a shared score except through a replay that reproduced
 * the Run exactly — a valid receipt on its own proves the Run was admitted,
 * never that the outcome the browser claims is true.
 *
 * @typedef {import("../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 * @typedef {{
 *   status: "accepted" | "rejected" | "expired" | "invalid",
 *   duplicate: boolean,
 *   result?: ReturnType<typeof verifyOfflineRunReplay>,
 *   reason?: string
 * }} OfflineSubmissionOutcome
 */

/**
 * @param {{
 *   verifyReceipt: (receipt: unknown) => (
 *     { valid: true } | { valid: false, reason: string }
 *   ),
 *   loadReceipt: (runId: string) => Promise<{
 *     runId: string,
 *     playerId: string | null,
 *     deviceInstallationHash: string,
 *     seed: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string,
 *     contentPackHash: string
 *   } | null>,
 *   labyrinthConfigFor: (
 *     levelId: string,
 *     labyrinthNumber: number
 *   ) => Parameters<typeof verifyOfflineRunReplay>[1]["config"],
 *   contentPackFor: (receipt: OfflineReceipt) => Promise<{
 *     hash: string,
 *     questionForRevision: Parameters<
 *       typeof verifyOfflineRunReplay
 *     >[1]["questionForRevision"]
 *   } | null>,
 *   recordSubmission: (submission: {
 *     idempotencyKey: string,
 *     runId: string,
 *     accepted: boolean,
 *     outcome: "won" | "lost",
 *     score: number,
 *     moves: number,
 *     elapsedMs: number
 *   }) => Promise<{ recorded: boolean }>,
 *   applyCloudOutcome: (outcome: {
 *     runId: string,
 *     playerId: string | null,
 *     result: ReturnType<typeof verifyOfflineRunReplay>
 *   }) => Promise<void>,
 *   now?: () => Date
 * }} dependencies
 */
export function createOfflineSubmissionService({
  verifyReceipt,
  loadReceipt,
  labyrinthConfigFor,
  contentPackFor,
  recordSubmission,
  applyCloudOutcome,
  now = () => new Date()
}) {
  return {
    /**
     * @param {{
     *   idempotencyKey: string,
     *   receipt: OfflineReceipt,
     *   deviceInstallationHash: string,
     *   contentPackHash: string,
     *   terminalAt: string,
     *   actionLog: unknown
     * }} submission
     * @returns {Promise<OfflineSubmissionOutcome>}
     */
    async submit(submission) {
      const signature = verifyReceipt(submission.receipt);
      if (!signature.valid) {
        return { status: "invalid", duplicate: false, reason: signature.reason };
      }
      const stored = await loadReceipt(submission.receipt.binding.runId);
      if (!stored) {
        return { status: "invalid", duplicate: false, reason: "unknown-run" };
      }
      // The server's own copy is the authority on the binding; the presented
      // receipt only has to agree with it. A receipt copied to another device
      // fails here even though its signature is perfectly valid.
      if (
        !receiptBindingMatches(submission.receipt, {
          runId: stored.runId,
          deviceInstallationHash: submission.deviceInstallationHash,
          seed: stored.seed,
          levelId: stored.levelId,
          labyrinthNumber: stored.labyrinthNumber,
          rulesetRevision: stored.rulesetRevision,
          contentPackHash: stored.contentPackHash
        }) ||
        stored.deviceInstallationHash !== submission.deviceInstallationHash ||
        stored.contentPackHash !== submission.contentPackHash
      ) {
        return { status: "invalid", duplicate: false, reason: "binding" };
      }

      const terminalAt = new Date(submission.terminalAt);
      if (Number.isNaN(terminalAt.getTime())) {
        return { status: "invalid", duplicate: false, reason: "terminal-time" };
      }
      if (!offlineSubmissionOpen(submission.receipt, terminalAt, now())) {
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      if (offlinePlayAuthorityOpen(submission.receipt, terminalAt)) {
        // A terminal instant inside the play window is the normal case. One
        // outside it means play continued past the authority it was granted.
      } else {
        return { status: "expired", duplicate: false, reason: "play" };
      }

      const pack = await contentPackFor(submission.receipt);
      if (!pack || pack.hash !== stored.contentPackHash) {
        return { status: "invalid", duplicate: false, reason: "content-pack" };
      }

      /** @type {ReturnType<typeof verifyOfflineRunReplay>} */
      let result;
      try {
        result = verifyOfflineRunReplay(submission.actionLog, {
          seed: stored.seed,
          config: labyrinthConfigFor(stored.levelId, stored.labyrinthNumber),
          questionForRevision: pack.questionForRevision
        });
      } catch (error) {
        if (error instanceof ReplayInputError) {
          // Terminal rejection: recorded so a retry cannot re-run it, and no
          // cloud write is attempted, so cloud state is byte-identical to
          // what it was before this submission arrived.
          await recordSubmission({
            idempotencyKey: submission.idempotencyKey,
            runId: stored.runId,
            accepted: false,
            outcome: "lost",
            score: 0,
            moves: 0,
            elapsedMs: 0
          });
          return { status: "rejected", duplicate: false, reason: "replay" };
        }
        throw error;
      }

      // The ledger decides, not the caller. A retry under the same key finds
      // the row already present and returns without writing a second time.
      const { recorded } = await recordSubmission({
        idempotencyKey: submission.idempotencyKey,
        runId: stored.runId,
        accepted: true,
        outcome: result.status === "won" ? "won" : "lost",
        score: result.score,
        moves: result.moves,
        elapsedMs: result.elapsedMs
      });
      if (!recorded) {
        return { status: "accepted", duplicate: true, result };
      }

      await applyCloudOutcome({
        runId: stored.runId,
        playerId: stored.playerId,
        result
      });
      return { status: "accepted", duplicate: false, result };
    }
  };
}
