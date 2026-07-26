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
