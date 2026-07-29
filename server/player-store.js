import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";
import { assertClassroomMembership } from "./classroom-context.js";
import { withTenantContext } from "./tenant-context.js";

const PROFILE_COLUMNS = `
  username,
  explorer_palette,
  playground_palette
`;

/** @param {Record<string, unknown>} row */
function mapProfile(row) {
  return {
    username: row.username,
    explorerPalette: row.explorer_palette,
    playgroundPalette: row.playground_palette
  };
}

/** @param {Record<string, unknown>} row */
function mapScoreEntry(row) {
  return {
    ...(row.rank === undefined ? {} : { rank: Number(row.rank) }),
    username: row.username,
    score: Number(row.score),
    levelId: row.level_id,
    labyrinthNumber: Number(row.labyrinth_number),
    moves: Number(row.moves),
    elapsedMs: Number(row.elapsed_ms)
  };
}

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>,
 *   connect?: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createPlayerStore(pool) {
  return {
    /** @param {string} userId */
    async getProfile(userId) {
      const result = await pool.query(
        `SELECT ${PROFILE_COLUMNS}
         FROM players
         WHERE clerk_user_id = $1`,
        [userId]
      );
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    },

    /**
     * @param {string} userId
     * @param {{
     *   username: string,
     *   usernameKey: string,
     *   explorerPalette: string,
     *   playgroundPalette: string
     * }} profile
     */
    async saveProfile(userId, profile) {
      const result = await pool.query(
        `WITH ${activeUserGuardCtes("$6")}
         INSERT INTO players (
           clerk_user_id,
           username,
           username_key,
           explorer_palette,
           playground_palette
         )
         SELECT $1, $2, $3, $4, $5
         FROM active_user
         ON CONFLICT (clerk_user_id) DO UPDATE SET
           username = EXCLUDED.username,
           username_key = EXCLUDED.username_key,
           explorer_palette = EXCLUDED.explorer_palette,
           playground_palette = EXCLUDED.playground_palette,
           updated_at = NOW()
         RETURNING ${PROFILE_COLUMNS}`,
        [
          userId,
          profile.username,
          profile.usernameKey,
          profile.explorerPalette,
          profile.playgroundPalette,
          deletedUserHash(userId)
        ]
      );
      if (!result.rows[0]) throw new DeletedUserError();
      return mapProfile(result.rows[0]);
    },

    /**
     * @param {{ atlasRegionId: string, rulesetRevision: string }} partition
     */
    async getLeaderboard(partition) {
      const result = await pool.query(
        `WITH ranked_by_player AS (
           SELECT
             player_id,
             level_id,
             labyrinth_number,
             moves,
             elapsed_ms,
             score,
             created_at,
             ROW_NUMBER() OVER (
               PARTITION BY player_id
               ORDER BY
                 score DESC,
                 labyrinth_number DESC,
                 moves ASC,
                 elapsed_ms ASC,
                 created_at ASC
             ) AS player_rank
           FROM score_entries
           WHERE escaped = TRUE
             AND classroom_id IS NULL
             AND atlas_region_id = $1
             AND ruleset_revision = $2
         ),
         best_runs AS (
           SELECT *
           FROM ranked_by_player
           WHERE player_rank = 1
         )
         SELECT
           ROW_NUMBER() OVER (
             ORDER BY
               score DESC,
               labyrinth_number DESC,
               moves ASC,
               elapsed_ms ASC,
               best_runs.created_at ASC
           ) AS rank,
           players.username,
           best_runs.score,
           best_runs.level_id,
           best_runs.labyrinth_number,
           best_runs.moves,
           best_runs.elapsed_ms
         FROM best_runs
         JOIN players ON players.clerk_user_id = best_runs.player_id
         ORDER BY
           best_runs.score DESC,
           best_runs.labyrinth_number DESC,
           best_runs.moves ASC,
           best_runs.elapsed_ms ASC,
           best_runs.created_at ASC
         LIMIT 10`,
        [partition.atlasRegionId, partition.rulesetRevision]
      );
      const entries = result.rows.map(mapScoreEntry);
      return {
        entries,
        globalMaxScore: entries[0]?.score ?? 0
      };
    },

    /**
     * @param {string} userId
     * @param {{
     *   idempotencyKey: string,
     *   levelId: string,
     *   labyrinthNumber: number,
     *   seed: string,
     *   wardensDefeated: number,
     *   echoesCollected: number,
     *   moves: number,
     *   elapsedMs: number,
     *   escaped: boolean,
     *   atlasRegionId: string,
     *   rulesetRevision: string,
     *   score: number
     * }} run
     * @param {string | null} [classroomId]
     */
    async submitScore(userId, run, classroomId = null) {
      if (!pool.connect) {
        throw new Error("Score storage requires a transactional pool.");
      }
      const transactionalPool =
        /** @type {typeof pool & { connect: NonNullable<typeof pool.connect> }} */ (
          pool
        );
      return withTenantContext(
        transactionalPool,
        { explorerId: userId, classroomId },
        async (database) => {
          await assertClassroomMembership(database, userId, classroomId);
          const result = await database.query(
        `WITH selected_score AS (
           INSERT INTO score_entries (
             player_id,
             idempotency_key,
             level_id,
             labyrinth_number,
             seed,
             wardens_defeated,
             echoes_collected,
             moves,
             elapsed_ms,
             score,
             escaped,
             classroom_id,
             atlas_region_id,
             ruleset_revision
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13
           )
           ON CONFLICT (player_id, classroom_id, idempotency_key) DO UPDATE SET
             idempotency_key = score_entries.idempotency_key
           RETURNING
             (xmax = 0) AS inserted,
             player_id,
             score,
             level_id,
             labyrinth_number,
             moves,
             elapsed_ms
         )
         SELECT
           selected_score.inserted,
           players.username,
           selected_score.score,
           selected_score.level_id,
           selected_score.labyrinth_number,
           selected_score.moves,
           selected_score.elapsed_ms
         FROM selected_score
         JOIN players ON players.clerk_user_id = selected_score.player_id
         LIMIT 1`,
        [
          userId,
          run.idempotencyKey,
          run.levelId,
          run.labyrinthNumber,
          run.seed,
          run.wardensDefeated,
          run.echoesCollected,
          run.moves,
          run.elapsedMs,
          run.score,
          classroomId,
          run.atlasRegionId,
          run.rulesetRevision
        ]
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Score entry could not be saved.");
      }
      return {
        entry: mapScoreEntry(row),
        duplicate: row.inserted !== true
      };
        }
      );
    }
  };
}
