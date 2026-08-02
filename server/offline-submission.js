import {
  offlineSubmissionOpen,
  receiptBindingMatches
} from "../shared/offline-receipt.js";
import { createOfflineQuestionSequence } from "./offline-content-pack.js";
import { ReplayInputError, verifyOfflineRunReplay } from "./run-replay.js";
import { reviewedQuestionForId } from "../src/learning/lantern-journal.js";

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
 * Keeps the idempotency snapshot sufficient to retry cloud Journal effects
 * without retaining Question ids, selected options, or the detailed replay.
 *
 * @param {ReturnType<typeof verifyOfflineRunReplay> & { journalEvents?: { questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[] }} result
 */
function compactReplayResult(result) {
  const summary = new Map();
  for (const event of result.journalEvents ?? []) {
    const journalQuestion = reviewedQuestionForId(event.questionId);
    if (
      !journalQuestion ||
      typeof event.topicId !== "string" ||
      typeof event.learningObjectiveId !== "string" ||
      typeof event.difficultyBand !== "string" ||
      journalQuestion.topicId !== event.topicId ||
      journalQuestion.learningObjectiveId !== event.learningObjectiveId ||
      journalQuestion.difficultyBand !== event.difficultyBand ||
      !["correct", "wrong", "hint", "skip"].includes(event.outcome)
    ) {
      continue;
    }
    const key = JSON.stringify([
      event.topicId,
      event.learningObjectiveId,
      event.difficultyBand,
      event.outcome
    ]);
    const current = summary.get(key) ?? {
      topicId: event.topicId,
      learningObjectiveId: event.learningObjectiveId,
      difficultyBand: event.difficultyBand,
      outcome: event.outcome,
      count: 0
    };
    current.count += 1;
    summary.set(key, current);
  }
  return {
    status: result.status,
    seed: result.seed,
    score: result.score,
    wardensDefeated: result.wardensDefeated,
    echoesCollected: result.echoesCollected,
    moves: result.moves,
    elapsedMs: result.elapsedMs,
    ...(summary.size > 0 ? { journalSummary: [...summary.values()] } : {})
  };
}

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
 *     questId?: string,
 *     issuedAt: string,
 *     playExpiresAt: string,
 *     submissionExpiresAt: string,
 *     learningDeckId?: string,
 *     learningDeckRevision?: string,
 *     initialQuestionOrdinal?: number,
 *     initialUsedQuestionIds?: string[]
 *   } | null>,
 *   labyrinthConfigFor: (
 *     levelId: string,
 *     labyrinthNumber: number,
 *     rulesetRevision: string
 *   ) => Parameters<typeof verifyOfflineRunReplay>[1]["config"],
 *   contentPackFor: (receipt: OfflineReceipt, actionLog: unknown) => Promise<{
 *     hash: string,
 *     questionForRevision: Parameters<
 *       typeof verifyOfflineRunReplay
 *     >[1]["questionForRevision"]
 *     publishedQuestionRevisions?: {
 *       question: ReturnType<typeof import("../src/questions/question-bank.js")["getBundledQuestion"]>,
 *       levelId: string,
 *       difficultyBand: string,
 *       questionOrdinal: number
 *     }[]
 *   } | null>,
 *   recordSubmission: (submission: {
 *     idempotencyKey: string,
 *     runId: string,
 *     accepted: boolean,
 *     outcome: "won" | "lost",
 *     score: number,
 *     moves: number,
 *     elapsedMs: number,
 *     replayResult?: ReturnType<typeof verifyOfflineRunReplay> & {
 *       journalEvents?: {
 *         questionId: string,
 *         topicId: string,
 *         learningObjectiveId: string,
 *         difficultyBand: string,
 *         outcome: "correct" | "wrong" | "hint" | "skip"
 *       }[]
 *       journalSummary?: {
 *         topicId: string,
 *         learningObjectiveId: string,
 *         difficultyBand: string,
 *         outcome: "correct" | "wrong" | "hint" | "skip",
 *         count: number
 *       }[]
 *     }
 *   }) => Promise<{
 *     state: "recorded" | "duplicate" | "no-live-receipt",
 *     recorded?: {
 *       accepted: boolean,
 *       outcome: "won" | "lost",
 *       score: number,
 *       moves: number,
 *       elapsedMs: number,
 *       idempotencyKey: string,
 *       result?: ReturnType<typeof verifyOfflineRunReplay> & {
 *         journalEvents?: {
 *           questionId: string,
 *           topicId: string,
 *           learningObjectiveId: string,
 *           difficultyBand: string,
 *           outcome: "correct" | "wrong" | "hint" | "skip"
 *         }[]
 *         journalSummary?: {
 *           topicId: string,
 *           learningObjectiveId: string,
 *           difficultyBand: string,
 *           outcome: "correct" | "wrong" | "hint" | "skip",
 *           count: number
 *         }[]
 *       }
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
 *       questId?: string,
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
           contentPackHash: stored.contentPackHash,
           questId: stored.questId,
           learningDeckId: stored.learningDeckId,
          learningDeckRevision: stored.learningDeckRevision,
          initialQuestionOrdinal: stored.initialQuestionOrdinal,
          initialUsedQuestionIds: stored.initialUsedQuestionIds
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
      if (at.getTime() >= Date.parse(stored.submissionExpiresAt)) {
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      if (at.getTime() >= Date.parse(stored.playExpiresAt)) {
        return { status: "expired", duplicate: false, reason: "play" };
      }
      if (
        !offlineSubmissionOpen(
          /** @type {OfflineReceipt} */ (authority),
          terminalAt,
          at
        )
      ) {
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      const pack = await contentPackFor(
        submission.receipt,
        submission.actionLog
      );
      if (!pack || pack.hash !== stored.contentPackHash) {
        return { status: "invalid", duplicate: false, reason: "content-pack" };
      }

      /** @type {ReturnType<typeof verifyOfflineRunReplay> & { journalEvents?: { questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[] }} */
      let result;
      /** @type {{ questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[]} */
      const journalEvents = [];
      const questionSequence = createOfflineQuestionSequence(
        stored,
        pack?.publishedQuestionRevisions ?? []
      );
      try {
        /**
         * @param {string} revisionId
         * @param {{ run: ReturnType<typeof import("../src/game/game-session.js").createRun> } | undefined} [context]
         */
        const questionForRevision = (revisionId, context = undefined) => {
          const expected = context?.run
            ? questionSequence?.next(context.run)
            : null;
          if (questionSequence && !expected) {
            throw new ReplayInputError(
              "Replay Question sequence is exhausted or invalid."
            );
          }
          const expectedRevision = expected
            ? (expected.reviewedRevisionId ?? expected.id)
            : revisionId;
          if (questionSequence && expectedRevision !== revisionId) {
            throw new ReplayInputError(
              "Replay Question does not match the trusted Challenge sequence."
            );
          }
          const question = pack.questionForRevision(expectedRevision);
          if (!question) {
            throw new ReplayInputError(
              "Reviewed Question Revision is not in the receipt-bound content pack."
            );
          }
          return question;
        };
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
          questionForRevision,
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

      const compactResult = compactReplayResult(result);
      const cloudResult = {
        ...result,
        ...(compactResult.journalSummary
          ? { journalSummary: compactResult.journalSummary }
          : {})
      };

      // The ledger decides, not the caller.
      const { state, recorded } = await recordSubmission({
        idempotencyKey: submission.idempotencyKey,
        runId: stored.runId,
        accepted: true,
        outcome: result.status === "won" ? "won" : "lost",
        score: result.score,
        moves: result.moves,
        elapsedMs: result.elapsedMs,
        replayResult: compactResult
      });
      if (state === "no-live-receipt") {
        // Nothing was written, so reporting an acceptance would tell the
        // Explorer a result was verified that the server never took.
        return { status: "expired", duplicate: false, reason: "submission" };
      }
      // What cloud state holds, not what this request replayed. The idempotency
      // key is client-chosen, so a second, different action log can arrive under
      // a spent key; both replay cleanly and only the first was ever stored.
      const ledgerKey = recorded?.idempotencyKey ?? submission.idempotencyKey;
      // A recorded retry must apply the complete first replay result. The
      // coarse fields alone are not enough to reconstruct Journal or Quest
      // effects when a second request carries a different valid log.
      const ledgerResult = recorded?.result
        ? recorded.result
        : recorded
          ? {
              ...result,
              status: recorded.outcome,
              score: recorded.score,
              moves: recorded.moves,
              elapsedMs: recorded.elapsedMs
            }
          : cloudResult;

      if (state === "duplicate") {
        if (!recorded) {
          // The key belongs to another Run. The ledger deliberately exposes
          // no other Run's outcome, so this retry cannot be reported as
          // accepted.
          return { status: "expired", duplicate: true, reason: "submission" };
        }
        if (recorded.accepted === false) {
          // Replay rejections are durable terminal outcomes too. Never turn a
          // recorded rejection into a verified result on transport retry.
          return { status: "rejected", duplicate: true, reason: "replay" };
        }
        if (!recorded.result) {
          // An accepted ledger row without its complete replay snapshot cannot
          // safely finish a cloud retry: the current request may carry a
          // different valid log, and the coarse columns cannot rebuild the
          // Journal or Quest effects of the first one.
          return { status: "expired", duplicate: true, reason: "submission" };
        }
        if (!(await pendingApply(ledgerKey))) {
          return { status: "accepted", duplicate: true, result: ledgerResult };
        }
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
      await completeSubmission(ledgerKey);
      return {
        status: "accepted",
        duplicate: state === "duplicate",
        result: ledgerResult
      };
    }
  };
}
