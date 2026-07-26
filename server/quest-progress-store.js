import { normalizeQuestProgress } from "../src/game/quest-progress.js";
import {
  activeUserGuardCtes,
  deletedUserHash
} from "./deleted-user-guard.js";

const COLUMNS = `
  schema_version,
  quest_id,
  level_id,
  labyrinth_number,
  completed_labyrinths,
  used_map_fingerprints,
  used_question_ids,
  next_question_ordinal,
  complete,
  revision,
  updated_at
`;

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createQuestProgressStore(pool) {
  /** @param {string} userId */
  async function get(userId) {
    const result = await pool.query(
      `SELECT ${COLUMNS}
       FROM cloud_quest_progress
       WHERE clerk_user_id = $1`,
      [userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  return {
    get,
    /**
     * @param {string} userId
     * @param {number} expectedRevision
     * @param {NonNullable<ReturnType<typeof normalizeQuestProgress>>} progress
     */
    async save(userId, expectedRevision, progress) {
      const writeValues = [
        userId,
        expectedRevision,
        progress.version,
        progress.questId,
        progress.levelId,
        progress.labyrinthNumber,
        progress.completedLabyrinths,
        JSON.stringify(progress.usedMapFingerprints),
        JSON.stringify(progress.usedQuestionIds),
        progress.nextQuestionOrdinal,
        progress.complete
      ];
      const result = expectedRevision === 0
        ? await pool.query(
            `WITH ${activeUserGuardCtes("$11")},
             ensured_access AS (
               INSERT INTO player_access (clerk_user_id)
               SELECT $1
               FROM active_user
               ON CONFLICT (clerk_user_id) DO NOTHING
               RETURNING clerk_user_id
             ),
             available_access AS (
               SELECT clerk_user_id FROM ensured_access
               UNION ALL
               SELECT clerk_user_id
               FROM player_access
               WHERE clerk_user_id = $1
                 AND EXISTS (SELECT 1 FROM active_user)
             )
             INSERT INTO cloud_quest_progress (
               clerk_user_id,
               schema_version,
               quest_id,
               level_id,
               labyrinth_number,
               completed_labyrinths,
               used_map_fingerprints,
               used_question_ids,
               next_question_ordinal,
               complete
             )
             SELECT
               $1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10
             FROM available_access
             LIMIT 1
             ON CONFLICT DO NOTHING
             RETURNING ${COLUMNS}`,
            [
              userId,
              progress.version,
              progress.questId,
              progress.levelId,
              progress.labyrinthNumber,
              progress.completedLabyrinths,
              JSON.stringify(progress.usedMapFingerprints),
              JSON.stringify(progress.usedQuestionIds),
              progress.nextQuestionOrdinal,
              progress.complete,
              deletedUserHash(userId)
            ]
          )
        : await pool.query(
            `UPDATE cloud_quest_progress
             SET
               schema_version = $3,
               quest_id = $4,
               level_id = $5,
               labyrinth_number = $6,
               completed_labyrinths = $7,
               used_map_fingerprints = $8::JSONB,
               used_question_ids = $9::JSONB,
               next_question_ordinal = $10,
               complete = $11,
               revision = revision + 1,
               updated_at = NOW()
             WHERE clerk_user_id = $1
               AND revision = $2
             RETURNING ${COLUMNS}`,
            writeValues
          );
      if (result.rows[0]) {
        return {
          record: mapRecord(result.rows[0]),
          conflict: false,
          duplicate: false
        };
      }
      const record = await get(userId);
      const duplicate =
        record !== null &&
        JSON.stringify(record.progress) === JSON.stringify(progress);
      return {
        record,
        conflict: !duplicate,
        duplicate
      };
    }
  };
}

/** @param {Record<string, unknown>} row */
function mapRecord(row) {
  const progress = normalizeQuestProgress({
    version: Number(row.schema_version),
    questId: row.quest_id,
    levelId: row.level_id,
    labyrinthNumber: Number(row.labyrinth_number),
    completedLabyrinths: Number(row.completed_labyrinths),
    usedMapFingerprints: row.used_map_fingerprints,
    usedQuestionIds: row.used_question_ids,
    nextQuestionOrdinal: Number(row.next_question_ordinal),
    complete: row.complete
  });
  if (!progress) {
    throw new Error("Stored Cloud Quest Progress is invalid.");
  }
  return {
    progress,
    revision: Number(row.revision),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
