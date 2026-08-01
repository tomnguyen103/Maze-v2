import { withTenantContext } from "./tenant-context.js";

/** @param {unknown} value */
function instant(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Database adapter for the existing migration 0024 definer functions. The
 * raw device nonce never reaches this module; callers pass only the derived
 * HMAC digest.
 *
 * @param {Parameters<typeof withTenantContext>[0]} pool
 */
export function createOfflineReceiptStore(pool) {
  return {
    /** @param {string} userId @param {Record<string, unknown>} binding */
    async issueReceipt(userId, binding) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT issue_offline_run_receipt(
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
             ) AS issued`,
            [
              binding.runId,
              binding.deviceInstallationHash,
              userId,
              binding.seed,
              binding.labyrinthNumber,
              binding.levelId,
              binding.contentPackHash,
              binding.issuedAt,
              binding.playExpiresAt,
              binding.submissionExpiresAt,
              binding.rulesetRevision
            ]
          );
          return result.rows?.[0]?.issued === true;
        }
      );
    },

    /**
     * @param {string} userId
     * @param {string} runId
     * @param {string} deviceInstallationHash
     */
    async readReceipt(userId, runId, deviceInstallationHash) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (client) => {
          const result = await client.query(
            `SELECT *
             FROM read_offline_run_receipt($1, $2)`,
            [runId, deviceInstallationHash]
          );
          const row = result.rows?.[0];
          if (!row) {
            return null;
          }
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
      );
    }
  };
}
