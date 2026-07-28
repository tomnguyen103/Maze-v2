import { deletedUserHash } from "./deleted-user-guard.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows?: Record<string, unknown>[] }>,
 *     release: () => void
 *   }>
 * }} pool
 */
export function createUserDeletionStore(pool) {
  return {
    /** @param {string} userId */
    async deleteUser(userId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [userId]
        );
        await client.query(
          `INSERT INTO deleted_user_tombstones (clerk_user_id_hash)
           VALUES ($1)
           ON CONFLICT (clerk_user_id_hash) DO UPDATE SET
             deleted_at = NOW()`,
          [deletedUserHash(userId)]
        );
        await client.query(
          `DELETE FROM cloud_quest_progress
           WHERE clerk_user_id = $1`,
          [userId]
        );
        await client.query(
          `DELETE FROM explorer_access_settings
           WHERE clerk_user_id = $1`,
          [userId]
        );
        await client.query(
          `DELETE FROM players
           WHERE clerk_user_id = $1`,
          [userId]
        );
        await client.query(
          `DELETE FROM player_access
           WHERE clerk_user_id = $1`,
          [userId]
        );
        const verification = await client.query(
          `SELECT
             EXISTS (
               SELECT 1 FROM deleted_user_tombstones
               WHERE clerk_user_id_hash = $2
             ) AS tombstone_present,
             NOT EXISTS (
               SELECT 1 FROM cloud_quest_progress
               WHERE clerk_user_id = $1
             ) AS cloud_deleted,
             NOT EXISTS (
               SELECT 1 FROM players
               WHERE clerk_user_id = $1
             ) AS player_deleted,
             NOT EXISTS (
               SELECT 1 FROM score_entries
               WHERE player_id = $1
             ) AS scores_deleted,
             NOT EXISTS (
               SELECT 1 FROM player_access
               WHERE clerk_user_id = $1
             ) AS access_deleted,
             NOT EXISTS (
               SELECT 1 FROM run_access_grants
               WHERE player_id = $1
             ) AS grants_deleted,
             NOT EXISTS (
               SELECT 1 FROM lifetime_purchases
               WHERE player_id = $1
             ) AS purchases_deleted,
              NOT EXISTS (
                SELECT 1 FROM learning_journals
                WHERE clerk_user_id = $1
              ) AS journal_deleted,
              NOT EXISTS (
                SELECT 1 FROM explorer_access_settings
                WHERE clerk_user_id = $1
              ) AS settings_deleted`,
          [userId, deletedUserHash(userId)]
        );
        if (!deletionVerified(verification.rows?.[0])) {
          throw new Error("Account deletion verification failed.");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

/** @param {unknown} row */
function deletionVerified(row) {
  return Boolean(
    row &&
    typeof row === "object" &&
    Object.values(row).length === 9 &&
    Object.values(row).every((value) => value === true)
  );
}
