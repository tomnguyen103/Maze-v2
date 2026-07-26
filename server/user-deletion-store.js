import { deletedUserHash } from "./deleted-user-guard.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (sql: string, values?: unknown[]) => Promise<unknown>,
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
          `DELETE FROM players
           WHERE clerk_user_id = $1`,
          [userId]
        );
        await client.query(
          `DELETE FROM player_access
           WHERE clerk_user_id = $1`,
          [userId]
        );
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
