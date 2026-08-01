import { withTenantContext } from "./tenant-context.js";

/** @param {unknown} value */
function instant(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** @param {Record<string, unknown>} row */
function storedReceipt(row) {
  return {
    runId: String(row.run_id),
    playerId: row.player_id === null ? null : String(row.player_id),
    deviceInstallationHash: String(row.device_installation_hash),
    seed: String(row.seed),
    levelId: String(row.level_id),
    labyrinthNumber: Number(row.labyrinth_number),
    rulesetRevision: String(row.ruleset_revision),
    contentPackHash: String(row.content_pack_hash),
    issuedAt: instant(row.issued_at),
    playExpiresAt: instant(row.play_expires_at),
    submissionExpiresAt: instant(row.submission_expires_at)
  };
}

/**
 * Database adapter for the migration 0024 receipt and pending-submission
 * functions. Every method runs under the authenticated Explorer tenant; the
 * raw action log never reaches this adapter or the database.
 *
 * @param {Parameters<typeof withTenantContext>[0]} pool
 */
export function createOfflineSubmissionStore(pool) {
  return {
    /** @param {string} userId @param {string} runId @param {string} deviceHash */
    async readReceipt(userId, runId, deviceHash) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT *
             FROM read_offline_run_receipt($1, $2)`,
            [runId, deviceHash]
          );
          const row = result.rows?.[0];
          return row ? storedReceipt(row) : null;
        }
      );
    },

    /**
     * @param {string} userId
     * @param {{ idempotencyKey: string, runId: string, accepted: boolean, outcome: "won" | "lost", score: number, moves: number, elapsedMs: number }} submission
     */
    async recordSubmission(userId, submission) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT *
             FROM record_offline_submission($1, $2, $3, $4, $5, $6, $7)`,
            [
              submission.idempotencyKey,
              submission.runId,
              submission.accepted,
              submission.outcome,
              submission.score,
              submission.moves,
              submission.elapsedMs
            ]
          );
          const row = result.rows?.[0];
          if (!row) {
            throw new Error("Offline submission ledger returned no state.");
          }
          return {
            state: /** @type {"recorded" | "duplicate" | "no-live-receipt"} */ (
              String(row.state)
            ),
            ...(row.recorded_outcome === null ||
            row.recorded_outcome === undefined
              ? {}
              : {
                  recorded: {
                    outcome: /** @type {"won" | "lost"} */ (
                      String(row.recorded_outcome)
                    ),
                    score: Number(row.recorded_score),
                    moves: Number(row.recorded_moves),
                    elapsedMs: Number(row.recorded_elapsed_ms)
                  }
                })
          };
        }
      );
    },

    /** @param {string} userId @param {string} idempotencyKey */
    async completeSubmission(userId, idempotencyKey) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT complete_offline_submission($1) AS completed`,
            [idempotencyKey]
          );
          return result.rows?.[0]?.completed === true;
        }
      );
    },

    /** @param {string} userId @param {string} idempotencyKey */
    async pendingApply(userId, idempotencyKey) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT offline_submission_pending_apply($1) AS pending`,
            [idempotencyKey]
          );
          return result.rows?.[0]?.pending === true;
        }
      );
    },

    /**
     * Maintenance runs under the cron secret, not an Explorer tenant. The
     * migration function is security-definer owned and deletes only expired
     * receipt rows; its cascade removes their pending submissions.
     */
    async prune() {
      const database = /** @type {{ query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }} */ (
        /** @type {unknown} */ (pool)
      );
      const result = await database.query(
        "SELECT prune_offline_run_continuity() AS pruned"
      );
      return Number(result.rows?.[0]?.pruned ?? 0);
    }
  };
}
