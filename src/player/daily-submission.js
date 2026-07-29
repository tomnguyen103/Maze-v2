import { createRunIdempotencyKey } from "./player-client.js";

/**
 * @param {{
 *   version: number,
 *   date: string,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   questionStartOrdinal: number
 * }} daily
 * @param {import("../game/run-action-log.js").RunActionLog} actionLog
 * @param {{
 *   seed: string,
 *   status: string,
 *   score: number,
 *   wardensDefeated: number,
 *   echoes: { collected: boolean }[],
 *   moves: number,
 *   elapsedMs: number
 * }} run
 */
export function createVerifiedDailySubmission(daily, actionLog, run) {
  const elapsedMs = Math.max(0, Math.round(run.elapsedMs));
  const claimed = {
    status: run.status,
    score: run.score,
    wardensDefeated: run.wardensDefeated,
    echoesCollected: run.echoes.filter((echo) => echo.collected).length,
    moves: run.moves,
    elapsedMs
  };
  return {
    idempotencyKey: createRunIdempotencyKey(
      {
        seed: daily.seed,
        moves: run.moves,
        elapsedMs,
        score: run.score
      },
      daily.levelId,
      daily.labyrinthNumber
    ),
    contract: {
      version: daily.version,
      date: daily.date,
      seed: daily.seed,
      levelId: daily.levelId,
      labyrinthNumber: daily.labyrinthNumber,
      questionStartOrdinal: daily.questionStartOrdinal
    },
    actionLog,
    claimed
  };
}
