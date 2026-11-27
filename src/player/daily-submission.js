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

/** @type {Record<string, { kicker: string, summary: string, say: string }>} */
const OUTCOME_TEXT = {
  created: {
    kicker: "verified replay",
    summary: "Your first checked score joined today’s Verified Daily Board.",
    say: "Daily escape verified. Your first entry joined the board."
  },
  improved: {
    kicker: "verified replay",
    summary: "Your checked score improved today’s Verified Daily best.",
    say: "Daily escape verified. Your board best improved."
  },
  kept: {
    kicker: "verified replay",
    summary:
      "Replay passed. Your existing Verified Daily best stays on the board.",
    say: "Daily escape verified. Your existing board best remains."
  },
  "signed-out": {
    kicker: "sign in needed",
    summary:
      "Sign in before a future escape can join the verified board.",
    say: "Daily result remains local. Sign in for future verified entries."
  },
  "profile-required": {
    kicker: "username needed",
    summary:
      "Create a username before a future escape can join the verified board.",
    say: "Daily result remains local. Create a username for future verified entries."
  },
  rejected: {
    kicker: "replay not verified",
    summary:
      "This result did not pass the replay check. Local Daily play still works.",
    say: "Daily replay was not verified. Your local result is unchanged."
  },
  "network-failure": {
    kicker: "replay not sent",
    summary:
      "The network could not reach the verified board. Your local Daily result is unchanged.",
    say: "Network could not verify the Daily result. Local result unchanged."
  },
  unavailable: {
    kicker: "verification unavailable",
    summary:
      "The verified board could not be reached. Your local Daily result is unchanged.",
    say: "Verified Daily service unavailable. Local result unchanged."
  }
};

/**
 * Result-dialog text for a verified Daily submission, or null for an unknown state.
 * @param {{ state: string, bestResult?: string }} result
 */
export function describeVerifiedDailyOutcome(result) {
  const text =
    OUTCOME_TEXT[
      result.state !== "verified"
        ? result.state
        : result.bestResult === "created" || result.bestResult === "improved"
          ? result.bestResult
          : "kept"
    ];
  return text ? { ...text, verified: result.state === "verified" } : null;
}
