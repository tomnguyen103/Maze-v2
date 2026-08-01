import {
  offlinePlayAuthorityOpen,
  offlineSubmissionOpen,
  receiptBindingMatches
} from "../shared/offline-receipt.js";
import { ReplayInputError, verifyOfflineRunReplay } from "./run-replay.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{12,128}$/;

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
 *   loadReceipt: (runId: string, deviceInstallationHash: string) => Promise<{
 *     runId: string,
 *     playerId: string | null,
 *     deviceInstallationHash: string,
 *     seed: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string,
 *     contentPackHash: string,
 *     issuedAt: string,
 *     playExpiresAt: string,
 *     submissionExpiresAt: string
 *   } | null>,
 *   labyrinthConfigFor: (
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string
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
 *   }) => Promise<{
 *     state: "recorded" | "duplicate" | "no-live-receipt",
 *     recorded?: {
 *       outcome: "won" | "lost",
 *       score: number,
 *       moves: number,
 *       elapsedMs: number
 *     } | null
 *   }>,
 *   completeSubmission: (idempotencyKey: string) => Promise<void>,
 *   pendingApply?: (idempotencyKey: string) => Promise<boolean>,
 *   applyCloudOutcome: (outcome: {
 *     runId: string,
 *     playerId: string | null,
 *     receipt: {
 *       runId: string,
 *       playerId: string | null,
 *       deviceInstallationHash: string,
 *       seed: string,
 *       levelId: string,
 *       labyrinthNumber: number,
 *       rulesetRevision: string,
 *       contentPackHash: string,
 *       issuedAt: string,
 *       playExpiresAt: string,
 *       submissionExpiresAt: string
 *     },
 *     result: ReturnType<typeof verifyOfflineRunReplay> & {
 *       journalEvents?: {
 *         questionId: string,
 *         topicId: string,
 *         learningObjectiveId: string,
 *         difficultyBand: string,
 *         outcome: "correct" | "wrong" | "hint" | "skip"
 *       }[]
 *     }
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
  completeSubmission,
  pendingApply = async () => false,
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
     *   actionLog: unknown,
     *   playerId?: string
     * }} submission
     * @returns {Promise<OfflineSubmissionOutcome>}
     */
    async submit(submission) {
      if (!IDEMPOTENCY_PATTERN.test(String(submission.idempotencyKey))) {
        return {
          status: "invalid",
          duplicate: false,
          reason: "idempotency-key"
        };
      }
      const signature = verifyReceipt(submission.receipt);
      if (!signature.valid) {
        return { status: "invalid", duplicate: false, reason: signature.reason };
      }
      const stored = await loadReceipt(
        submission.receipt.binding.runId,
        submission.deviceInstallationHash
      );
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
      const at = now();
      // A client-declared terminal instant decides both windows, so it is
      // bounded on both sides first: it cannot be in the future, and it
      // cannot precede the moment the receipt was issued. Without this a
      // client could play past its play authority and then claim it
      // finished on day one.
      if (
        Number.isNaN(terminalAt.getTime()) ||
        terminalAt.getTime() > at.getTime() ||
        terminalAt.getTime() < Date.parse(stored.issuedAt)
      ) {
        return { status: "invalid", duplicate: false, reason: "terminal-time" };
      }
      // Both windows are read from the server's own row, never from the
      // copy the client presented. The signature covers those fields, but
      // the stored row is the thing the server actually promised.
      const authority = {
        binding: {
          playExpiresAt: stored.playExpiresAt,
          submissionExpiresAt: stored.submissionExpiresAt
        }
      };
      if (
        !offlineSubmissionOpen(
          /** @type {OfflineReceipt} */ (authority),
          terminalAt,
          at
        )
      ) {
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      // A terminal instant inside the play window is the normal case. One
      // outside it means play continued past the authority it was granted.
      if (
        !offlinePlayAuthorityOpen(
          /** @type {OfflineReceipt} */ (authority),
          terminalAt
        )
      ) {
        return { status: "expired", duplicate: false, reason: "play" };
      }

      const pack = await contentPackFor(submission.receipt);
      if (!pack || pack.hash !== stored.contentPackHash) {
        return { status: "invalid", duplicate: false, reason: "content-pack" };
      }

      /** @type {ReturnType<typeof verifyOfflineRunReplay> & { journalEvents?: { questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[] }} */
      let result;
      /** @type {{ questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[]} */
      const journalEvents = [];
      try {
        result = verifyOfflineRunReplay(submission.actionLog, {
          seed: stored.seed,
          // The ruleset the receipt bound, not the Labyrinth's default. Without
          // it every regional Trail Twist action replays against Classic Rules,
          // no-ops, and terminally rejects a Run that was played legitimately.
          config: labyrinthConfigFor(
            stored.levelId,
            stored.labyrinthNumber,
            stored.rulesetRevision
          ),
          questionForRevision: pack.questionForRevision,
          onAction: (run, action) => {
            const question = run.challenge?.question;
            if (!question) {
              return;
            }
            const outcome =
              action.type === "answer-question"
                ? action.answerId === question.answerId
                  ? "correct"
                  : "wrong"
                : action.type === "skip-question"
                  ? "skip"
                  : action.type === "reveal-hint"
                    ? "hint"
                    : null;
            if (!outcome) {
              return;
            }
            journalEvents.push({
              questionId: question.id,
              topicId: question.topicId,
              learningObjectiveId: question.learningObjectiveId,
              difficultyBand: question.difficultyBand,
              outcome
            });
          }
        });
        result = { ...result, journalEvents };
      } catch (error) {
        if (error instanceof ReplayInputError) {
          // Terminal rejection: recorded so a retry cannot re-run it, and no
          // cloud write is attempted, so cloud state is byte-identical to
          // what it was before this submission arrived.
          const rejection = await recordSubmission({
            idempotencyKey: submission.idempotencyKey,
            runId: stored.runId,
            accepted: false,
            outcome: "lost",
            score: 0,
            moves: 0,
            elapsedMs: 0
          });
          if (rejection.state === "no-live-receipt") {
            // The rejection could not be recorded, so claiming it was
            // durable would be a lie the retry path relies on.
            return { status: "expired", duplicate: false, reason: "submission" };
          }
          return { status: "rejected", duplicate: false, reason: "replay" };
        }
        throw error;
      }

      // The ledger decides, not the caller.
      const { state, recorded } = await recordSubmission({
        idempotencyKey: submission.idempotencyKey,
        runId: stored.runId,
        accepted: true,
        outcome: result.status === "won" ? "won" : "lost",
        score: result.score,
        moves: result.moves,
        elapsedMs: result.elapsedMs
      });
      if (state === "no-live-receipt") {
        // Nothing was written, so reporting an acceptance would tell the
        // Explorer a result was verified that the server never took.
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      // What cloud state holds, not what this request replayed. The idempotency
      // key is client-chosen, so a second, different action log can arrive under
      // a spent key; both replay cleanly and only the first was ever stored.
      // Only the four fields the ledger stores are overridden; the rest of the
      // shape stays as replayed, because the ledger holds no record of them.
      const ledgerResult = recorded
        ? {
            ...result,
            status: recorded.outcome,
            score: recorded.score,
            moves: recorded.moves,
            elapsedMs: recorded.elapsedMs
          }
        : result;

      if (state === "duplicate" && !(await pendingApply(submission.idempotencyKey))) {
        return { status: "accepted", duplicate: true, result: ledgerResult };
      }

      // Reached either on the first record, or on a retry whose first
      // attempt died between the ledger row and the cloud write. The
      // completion flag is what makes the second case finishable rather
      // than silently lost.
      await applyCloudOutcome({
        runId: stored.runId,
        playerId: stored.playerId,
        receipt: stored,
        result: ledgerResult
      });
      await completeSubmission(submission.idempotencyKey);
      return {
        status: "accepted",
        duplicate: state === "duplicate",
        result: ledgerResult
      };
    }
  };
}
