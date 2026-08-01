import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";

const FREE_RUN_LIMIT = 3;

export class RunAccessConflictError extends Error {
  constructor() {
    super("That Run id is already bound to a different Labyrinth.");
    this.name = "RunAccessConflictError";
  }
}

/** @param {Record<string, unknown>} row */
function accessState(row) {
  const used = Number(row.free_runs_used ?? 0);
  const membershipState = String(row.membership_state ?? "none");
  return {
    freeRunsRemaining: Math.max(0, FREE_RUN_LIMIT - used),
    state: membershipState === "active"
      ? "member"
      : membershipState === "refunded" || membershipState === "disputed"
        ? "membership-blocked"
        : used >= FREE_RUN_LIMIT
          ? "blocked"
          : "free"
  };
}

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>,
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: () => void
 *   }>
 * }} pool
 */
export function createRunAccessStore(pool) {
  return {
    /** @param {string} userId */
    async getAccess(userId) {
      const result = await pool.query(
        `WITH ${activeUserGuardCtes("$2")},
         ensured_access AS (
           INSERT INTO player_access (clerk_user_id)
           SELECT $1
           FROM active_user
           ON CONFLICT (clerk_user_id) DO NOTHING
           RETURNING free_runs_used, membership_state
         ),
         available_access AS (
           SELECT free_runs_used, membership_state
           FROM ensured_access
           UNION ALL
           SELECT free_runs_used, membership_state
           FROM player_access
           WHERE clerk_user_id = $1
             AND EXISTS (SELECT 1 FROM active_user)
         )
         SELECT free_runs_used, membership_state
         FROM available_access
         LIMIT 1`,
        [userId, deletedUserHash(userId)]
      );
      if (!result.rows[0]) throw new DeletedUserError();
      return accessState(result.rows[0] ?? {});
    },

    /**
     * Reads the exact Personal Run grant without creating a new one. Offline
     * Continuity is an extension of admission, never a second admission path.
     *
     * @param {string} userId
     * @param {string} runId
     */
    async getRunGrant(userId, runId) {
      const result = await pool.query(
        `WITH ${activeUserGuardCtes("$2")}
         SELECT run_id, seed, level_id, labyrinth_number, grant_source
         FROM run_access_grants
         WHERE player_id = $1
           AND run_id = $3
           AND EXISTS (SELECT 1 FROM active_user)`,
        [userId, deletedUserHash(userId), runId]
      );
      const grant = result.rows[0];
      return grant
        ? {
            runId: String(grant.run_id),
            seed: String(grant.seed),
            levelId: String(grant.level_id),
            labyrinthNumber: Number(grant.labyrinth_number),
            grantSource: String(grant.grant_source ?? "free")
          }
        : null;
    },

    /**
     * @param {string} userId
     * @param {{
     *   runId: string,
     *   seed: string,
     *   levelId: string,
     *   labyrinthNumber: number
     * }} run
     */
    async authorizeRun(userId, run) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const guard = await client.query(
          `WITH ${activeUserGuardCtes("$2")},
           ensured_access AS (
             INSERT INTO player_access (clerk_user_id)
             SELECT $1
             FROM active_user
             ON CONFLICT (clerk_user_id) DO NOTHING
           )
           SELECT NOT EXISTS (SELECT 1 FROM active_user) AS deleted`,
          [userId, deletedUserHash(userId)]
        );
        if (guard.rows[0]?.deleted === true) throw new DeletedUserError();
        const accessResult = await client.query(
          `SELECT free_runs_used, membership_state
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [userId]
        );
        const existing = await client.query(
          `SELECT
             run_id,
             seed,
             level_id,
             labyrinth_number,
             grant_source
           FROM run_access_grants
           WHERE player_id = $1 AND run_id = $2`,
          [userId, run.runId]
        );
        if (existing.rows.length > 0) {
          const granted = existing.rows[0];
          if (
            granted.seed !== run.seed ||
            granted.level_id !== run.levelId ||
            Number(granted.labyrinth_number) !== run.labyrinthNumber
          ) {
            throw new RunAccessConflictError();
          }
          await client.query("COMMIT");
          return {
            allowed: true,
            duplicate: true,
            ...accessState(accessResult.rows[0] ?? {}),
            state: granted.grant_source === "lifetime" ? "member" : "free"
          };
        }

        const access = accessState(accessResult.rows[0] ?? {});
        if (access.state === "member") {
          await client.query(
            `INSERT INTO run_access_grants (
               player_id,
               run_id,
               seed,
               level_id,
               labyrinth_number,
               grant_source
             )
             VALUES ($1, $2, $3, $4, $5, 'lifetime')
             ON CONFLICT (player_id, run_id) DO NOTHING`,
            [
              userId,
              run.runId,
              run.seed,
              run.levelId,
              run.labyrinthNumber
            ]
          );
          await client.query("COMMIT");
          return {
            allowed: true,
            duplicate: false,
            ...access
          };
        }

        if (access.state === "membership-blocked") {
          await client.query("COMMIT");
          return {
            allowed: false,
            duplicate: false,
            ...access
          };
        }

        if (access.freeRunsRemaining === 0) {
          await client.query("COMMIT");
          return {
            allowed: false,
            duplicate: false,
            ...access
          };
        }

        await client.query(
          `INSERT INTO run_access_grants (
             player_id,
             run_id,
             seed,
             level_id,
             labyrinth_number,
             grant_source
           )
           VALUES ($1, $2, $3, $4, $5, 'free')
           ON CONFLICT (player_id, run_id) DO NOTHING`,
          [
            userId,
            run.runId,
            run.seed,
            run.levelId,
            run.labyrinthNumber
          ]
        );
        const updated = await client.query(
          `UPDATE player_access
           SET free_runs_used = free_runs_used + 1,
               updated_at = NOW()
           WHERE clerk_user_id = $1
           RETURNING free_runs_used, membership_state`,
          [userId]
        );
        await client.query("COMMIT");
        return {
          allowed: true,
          duplicate: false,
          ...accessState(updated.rows[0] ?? {})
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
