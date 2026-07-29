import { withTenantContext } from "./tenant-context.js";

/** @param {Record<string, unknown>} row */
function mapEntry(row) {
  return {
    ...(row.rank === undefined ? {} : { rank: Number(row.rank) }),
    username: String(row.username),
    score: Number(row.score),
    moves: Number(row.moves)
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
export function createDailyStore(pool) {
  return {
    /** @param {string} date @param {number} [limit] */
    async getLeaderboard(date, limit = 10) {
      const result = await pool.query(
        `SELECT
           ROW_NUMBER() OVER (
             ORDER BY
               entries.score DESC,
               entries.moves ASC,
               entries.achieved_at ASC,
               entries.player_id ASC
           ) AS rank,
           players.username,
           entries.score,
           entries.moves
         FROM verified_daily_entries AS entries
         JOIN players ON players.clerk_user_id = entries.player_id
         WHERE entries.daily_date = $1::date
         ORDER BY
           entries.score DESC,
           entries.moves ASC,
           entries.achieved_at ASC,
           entries.player_id ASC
         LIMIT $2`,
        [date, Math.min(10, Math.max(1, Math.trunc(limit)))]
      );
      return result.rows.map(mapEntry);
    },

    /**
     * @param {string} userId
     * @param {{
     *   idempotencyKey: string,
     *   date: string,
     *   dailyVersion: number,
     *   username: string,
     *   score: number,
     *   wardensDefeated: number,
     *   echoesCollected: number,
     *   moves: number,
     *   elapsedMs: number
     * }} entry
     */
    async submitVerifiedEntry(userId, entry) {
      if (!pool.connect) {
        throw new Error("Verified Daily storage requires a transactional pool.");
      }
      const transactionalPool =
        /** @type {typeof pool & { connect: NonNullable<typeof pool.connect> }} */ (
          pool
        );
      return withTenantContext(
        transactionalPool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const values = [
            userId,
            entry.date,
            entry.idempotencyKey,
            entry.dailyVersion,
            entry.score,
            entry.wardensDefeated,
            entry.echoesCollected,
            entry.moves,
            entry.elapsedMs
          ];
          await database.query(
            `SELECT pg_advisory_xact_lock(
               hashtextextended($1 || ':' || $2::text, 0)
             )`,
            [userId, entry.date]
          );
          const existing = await database.query(
            `SELECT
               submissions.response_score AS score,
               submissions.response_moves AS moves,
               submissions.best_result
             FROM verified_daily_submissions AS submissions
             WHERE submissions.player_id = $1
               AND submissions.daily_date = $2::date
               AND submissions.idempotency_key = $3
             LIMIT 1`,
            [userId, entry.date, entry.idempotencyKey]
          );
          if (existing.rows[0]) {
            return {
              duplicate: true,
              improved: false,
              bestResult:
                /** @type {"created" | "improved" | "unchanged"} */ (
                 existing.rows[0].best_result
                ),
              entry: mapEntry({
                ...existing.rows[0],
                username: entry.username
              })
            };
          }

          const previous = await database.query(
            `SELECT
               entries.score,
               entries.moves
             FROM verified_daily_entries AS entries
             WHERE entries.player_id = $1
               AND entries.daily_date = $2::date
             FOR UPDATE OF entries`,
            [userId, entry.date]
          );
          const previousBest = previous.rows[0] ?? null;
          const candidateImproves =
            previousBest === null ||
            entry.score > Number(previousBest.score) ||
            (
              entry.score === Number(previousBest.score) &&
              entry.moves < Number(previousBest.moves)
            );
          /** @type {"created" | "improved" | "unchanged"} */
          const bestResult =
            previousBest === null
              ? "created"
              : candidateImproves
                ? "improved"
                : "unchanged";
          const responseScore = candidateImproves
            ? entry.score
            : Number(previousBest?.score);
          const responseMoves = candidateImproves
            ? entry.moves
            : Number(previousBest?.moves);

          await database.query(
            `INSERT INTO verified_daily_submissions (
               player_id,
               daily_date,
               idempotency_key,
               daily_version,
               score,
               wardens_defeated,
               echoes_collected,
               moves,
               elapsed_ms,
               best_result,
               response_score,
               response_moves
             )
             VALUES (
               $1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
             )`,
            [...values, bestResult, responseScore, responseMoves]
          );
          /** @type {Record<string, unknown> | null} */
          let stored = previousBest
            ? { ...previousBest, username: entry.username }
            : null;
          if (candidateImproves) {
            const promoted = await database.query(
              `WITH upserted AS (
                 INSERT INTO verified_daily_entries (
                   player_id,
                   daily_date,
                   daily_version,
                   source_idempotency_key,
                   score,
                   wardens_defeated,
                   echoes_collected,
                   moves,
                   elapsed_ms
                 )
                 VALUES ($1, $2::date, $4, $3, $5, $6, $7, $8, $9)
                 ON CONFLICT (player_id, daily_date) DO UPDATE SET
                   daily_version = EXCLUDED.daily_version,
                   source_idempotency_key = EXCLUDED.source_idempotency_key,
                   score = EXCLUDED.score,
                   wardens_defeated = EXCLUDED.wardens_defeated,
                   echoes_collected = EXCLUDED.echoes_collected,
                   moves = EXCLUDED.moves,
                   elapsed_ms = EXCLUDED.elapsed_ms,
                   achieved_at = NOW()
                 WHERE
                   EXCLUDED.score > verified_daily_entries.score
                   OR (
                     EXCLUDED.score = verified_daily_entries.score
                     AND EXCLUDED.moves < verified_daily_entries.moves
                   )
                  RETURNING score, moves
                )
                SELECT score, moves
                FROM upserted`,
               values
             );
            stored = promoted.rows[0]
              ? { ...promoted.rows[0], username: entry.username }
              : null;
          }
          if (!stored) {
            throw new Error("Verified Daily entry could not be saved.");
          }
          return {
            duplicate: false,
            improved: candidateImproves,
            bestResult,
            entry: mapEntry(stored)
          };
        }
      );
    }
  };
}
