/**
 * Run Action Log version 2, per ADR 0035.
 *
 * Version 1 is the Verified Daily contract and stays exactly as it is: Classic
 * Rules, four entry types, no regional actions. Version 2 exists because an
 * offline Quest Run can use every Trail Twist, and because its answers have to
 * name the exact Reviewed Question Revision the server will replay against —
 * an offline client cannot be handed the Daily's implicit question ordering.
 *
 * What it never carries is reviewed content. An answer entry holds a revision
 * id and a selected option identifier, never the Question, the choice text,
 * the Hint, the feedback, or anything from the Echo Lens. That is what lets
 * the whole log be discarded the moment verification resolves without losing
 * anything the Explorer is owed.
 *
 * @typedef {ReturnType<(typeof import("./game-session.js"))["createRun"]>} GameRun
 * @typedef {{
 *   type: "move",
 *   direction: "up" | "right" | "down" | "left",
 *   elapsedMs: number
 * } | {
 *   type: "pulse",
 *   elapsedMs: number
 * } | {
 *   type: "ring-bell",
 *   elapsedMs: number
 * } | {
 *   type: "reveal-hint",
 *   elapsedMs: number
 * } | {
 *   type: "answer-question",
 *   questionRevisionId: string,
 *   optionId: string,
 *   elapsedMs: number
 * } | {
 *   type: "skip-question",
 *   questionRevisionId: string,
 *   elapsedMs: number
 * }} RunActionV2Entry
 * @typedef {{ version: 2, actions: RunActionV2Entry[] }} RunActionLogV2
 */

export const RUN_ACTION_LOG_V2_VERSION = 2;
export const RUN_ACTION_LOG_V2_MAX_ACTIONS = 4096;

/** @returns {RunActionLogV2} */
export function createRunActionLogV2() {
  return { version: RUN_ACTION_LOG_V2_VERSION, actions: [] };
}

/**
 * Appends one action, or returns null when the protocol bound is reached. A
 * Run that outgrows the log stays playable; it simply cannot be verified, and
 * the caller is the one that has to say so.
 *
 * @param {RunActionLogV2} log
 * @param {GameRun} previous
 * @param {Parameters<(typeof import("./game-session.js"))["applyAction"]>[1]} action
 * @param {GameRun} next
 * @returns {RunActionLogV2 | null}
 */
export function tryAppendRunActionV2(log, previous, action, next) {
  const entry = replayEntryV2(previous, action, next);
  if (!entry) {
    return log;
  }
  if (log.actions.length >= RUN_ACTION_LOG_V2_MAX_ACTIONS) {
    return null;
  }
  return {
    version: RUN_ACTION_LOG_V2_VERSION,
    actions: [...log.actions, entry]
  };
}

/**
 * @param {GameRun} previous
 * @param {Parameters<(typeof import("./game-session.js"))["applyAction"]>[1]} action
 * @param {GameRun} next
 * @returns {RunActionV2Entry | null}
 */
function replayEntryV2(previous, action, next) {
  const elapsedMs = Math.max(0, Math.round(next.elapsedMs));
  if (action.type === "move" && next.moves === previous.moves + 1) {
    return { type: "move", direction: action.direction, elapsedMs };
  }
  if (action.type === "pulse" && next.moves === previous.moves + 1) {
    return { type: "pulse", elapsedMs };
  }
  if (action.type === "ring-bell" && next !== previous) {
    return { type: "ring-bell", elapsedMs };
  }
  if (
    action.type === "reveal-hint" &&
    previous.status === "challenge" &&
    next !== previous
  ) {
    return { type: "reveal-hint", elapsedMs };
  }
  const revisionId = questionRevisionOf(previous);
  if (
    action.type === "answer-question" &&
    previous.status === "challenge" &&
    revisionId &&
    next !== previous
  ) {
    return {
      type: "answer-question",
      questionRevisionId: revisionId,
      optionId: action.answerId,
      elapsedMs
    };
  }
  if (
    action.type === "skip-question" &&
    previous.status === "challenge" &&
    revisionId &&
    next !== previous
  ) {
    return { type: "skip-question", questionRevisionId: revisionId, elapsedMs };
  }
  return null;
}

/**
 * The exact revision the Explorer was shown. Reading it from the Run rather
 * than from the caller is what stops a client naming a different revision than
 * the one it answered.
 *
 * @param {GameRun} run
 */
function questionRevisionOf(run) {
  const question = run.challenge?.question;
  if (!question) {
    return null;
  }
  // `id` is the revision identity, and the only one the server accepts: it
  // resolves the content pack by this field and compares it to the Challenge it
  // replayed. A second field here would name a revision the server rejects.
  const revision = /** @type {{ id?: unknown }} */ (question);
  return typeof revision.id === "string" ? revision.id : null;
}
