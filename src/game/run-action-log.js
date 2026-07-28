export const RUN_ACTION_LOG_VERSION = 1;
export const RUN_ACTION_LOG_MAX_ACTIONS = 1024;

/** @typedef {ReturnType<(typeof import("./game-session.js"))["createRun"]>} GameRun */
/**
 * @typedef {{
 *   type: "move",
 *   direction: "up" | "right" | "down" | "left",
 *   elapsedMs: number
 * } | {
 *   type: "pulse",
 *   elapsedMs: number
 * } | {
 *   type: "answer-question",
 *   answerId: string,
 *   elapsedMs: number
 * } | {
 *   type: "skip-question",
 *   elapsedMs: number
 * }} RunActionEntry
 * @typedef {{
 *   version: 1,
 *   actions: RunActionEntry[]
 * }} RunActionLog
 */

/** @returns {RunActionLog} */
export function createRunActionLog() {
  return { version: RUN_ACTION_LOG_VERSION, actions: [] };
}

/**
 * @param {RunActionLog} log
 * @param {GameRun} previous
 * @param {Parameters<(typeof import("./game-session.js"))["applyAction"]>[1]} action
 * @param {GameRun} next
 * @returns {RunActionLog}
 */
export function appendRunAction(log, previous, action, next) {
  const entry = replayEntry(previous, action, next);
  if (!entry) {
    return log;
  }
  if (log.actions.length >= RUN_ACTION_LOG_MAX_ACTIONS) {
    throw new Error("Run Action Log has too many actions.");
  }
  return {
    version: RUN_ACTION_LOG_VERSION,
    actions: [...log.actions, entry]
  };
}

/**
 * @param {GameRun} previous
 * @param {Parameters<(typeof import("./game-session.js"))["applyAction"]>[1]} action
 * @param {GameRun} next
 * @returns {RunActionEntry | null}
 */
function replayEntry(previous, action, next) {
  const elapsedMs = Math.max(0, Math.round(next.elapsedMs));
  if (
    action.type === "move" &&
    next.moves === previous.moves + 1
  ) {
    return { type: "move", direction: action.direction, elapsedMs };
  }
  if (
    action.type === "pulse" &&
    next.moves === previous.moves + 1
  ) {
    return { type: "pulse", elapsedMs };
  }
  if (
    action.type === "answer-question" &&
    previous.status === "challenge" &&
    previous.challenge?.question &&
    next !== previous
  ) {
    return {
      type: "answer-question",
      answerId: action.answerId,
      elapsedMs
    };
  }
  if (
    action.type === "skip-question" &&
    previous.status === "challenge" &&
    previous.challenge?.question &&
    next !== previous
  ) {
    return { type: "skip-question", elapsedMs };
  }
  return null;
}
