import { deletedUserHash } from "./deleted-user-guard.js";
import { setTenantContext } from "./tenant-context.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows?: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createUserDeletionStore(pool) {
  return {
    /** @param {string} userId */
    async deleteUser(userId) {
      const client = await pool.connect();
      let released = false;
      try {
        await client.query("BEGIN");
        await setTenantContext(client, {
          explorerId: userId,
          classroomId: null
        });
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
          `DELETE FROM echo_fossil_collections
           WHERE player_id = $1`,
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
              ) AS settings_deleted,
              NOT EXISTS (
                SELECT 1 FROM classroom_memberships
                WHERE clerk_user_id = $1
              ) AS memberships_deleted,
              NOT EXISTS (
                SELECT 1 FROM verified_daily_submissions
                WHERE player_id = $1
              ) AS verified_daily_submissions_deleted,
              NOT EXISTS (
                SELECT 1 FROM verified_daily_entries
                WHERE player_id = $1
              ) AS verified_daily_entries_deleted,
              -- Tolerates a deploy that lands before migration 0023: without
              -- the regclass guard the whole statement raises "relation does
              -- not exist", the transaction rolls back, and every account
              -- deletion fails rather than just this assertion.
              (
                to_regclass('public.daily_trail_contributions') IS NULL
                OR NOT EXISTS (
                  SELECT 1 FROM daily_trail_contributions
                  WHERE player_id = $1
                )
              ) AS daily_trail_contributions_deleted,
              (
                to_regclass('public.offline_run_receipts') IS NULL
                OR NOT EXISTS (
                  SELECT 1 FROM offline_run_receipts
                  WHERE player_id = $1
                )
              ) AS offline_run_receipts_deleted,
               (
                 to_regclass('public.offline_pending_submissions') IS NULL
                 OR NOT EXISTS (
                   SELECT 1 FROM offline_pending_submissions
                   WHERE player_id = $1
                 )
               ) AS offline_pending_submissions_deleted,
               (
                 to_regclass('public.echo_fossil_collections') IS NULL
                 OR NOT EXISTS (
                   SELECT 1 FROM echo_fossil_collections
                   WHERE player_id = $1
                 )
               ) AS echo_fossils_deleted`,
          [userId, deletedUserHash(userId)]
        );
        if (!deletionVerified(verification.rows?.[0])) {
          throw new Error("Account deletion verification failed.");
        }
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          client.release(true);
          released = true;
        }
        throw error;
      } finally {
        if (!released) {
          client.release();
        }
      }
    }
  };
}

// Named rather than counted: a positional count passes unchanged when a
// future edit swaps one assertion for another, which is the one mistake this
// guard exists to catch. Extended by hand for every new personal table.
const DELETION_ASSERTIONS = Object.freeze([
  "tombstone_present",
  "cloud_deleted",
  "player_deleted",
  "scores_deleted",
  "access_deleted",
  "grants_deleted",
  "purchases_deleted",
  "journal_deleted",
  "settings_deleted",
  "memberships_deleted",
  "verified_daily_submissions_deleted",
  "verified_daily_entries_deleted",
  "daily_trail_contributions_deleted",
  "offline_run_receipts_deleted",
  "offline_pending_submissions_deleted",
  "echo_fossils_deleted"
]);

/** @param {unknown} row */
function deletionVerified(row) {
  if (!row || typeof row !== "object") {
    return false;
  }
  const verified = /** @type {Record<string, unknown>} */ (row);
  return (
    Object.keys(verified).length === DELETION_ASSERTIONS.length &&
    DELETION_ASSERTIONS.every((assertion) => verified[assertion] === true)
  );
}
