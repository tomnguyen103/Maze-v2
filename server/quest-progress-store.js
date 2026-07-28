import { normalizeQuestProgress } from "../src/game/quest-progress.js";
import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";
import { withTenantContext } from "./tenant-context.js";
import { assertClassroomMembership } from "./classroom-context.js";

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
 * @typedef {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} QueryDatabase
 */

/**
 * @param {QueryDatabase & {
 *   connect: () => Promise<QueryDatabase & {
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createQuestProgressStore(pool) {
  /**
   * @param {QueryDatabase} database
   * @param {string} userId
   * @param {string | null} classroomId
   */
  async function get(database, userId, classroomId) {
    const result = await database.query(
      `SELECT ${COLUMNS}
       FROM cloud_quest_progress
       WHERE clerk_user_id = $1
         AND classroom_id IS NOT DISTINCT FROM $2`,
      [userId, classroomId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  return {
    /** @param {string} userId @param {string | null} [classroomId] */
    get(userId, classroomId = null) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (client) => {
          await assertClassroomMembership(client, userId, classroomId);
          return get(client, userId, classroomId);
        }
      );
    },
    /**
     * @param {string} userId
     * @param {number} expectedRevision
     * @param {NonNullable<ReturnType<typeof normalizeQuestProgress>>} progress
     * @param {string | null} [classroomId]
     */
    async save(userId, expectedRevision, progress, classroomId = null) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (database) => {
          await assertClassroomMembership(database, userId, classroomId);
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
            progress.complete,
            classroomId
          ];
          const result = expectedRevision === 0
            ? await database.query(
            `WITH ${activeUserGuardCtes("$12")},
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
               complete,
               classroom_id
             )
             SELECT
               $1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10, $11
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
              classroomId,
              deletedUserHash(userId)
            ]
              )
            : await database.query(
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
               AND classroom_id IS NOT DISTINCT FROM $12
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
          const deleted = await database.query(
            `SELECT 1
             FROM deleted_user_tombstones
             WHERE clerk_user_id_hash = $1`,
            [deletedUserHash(userId)]
          );
          if (deleted.rows.length) {
            throw new DeletedUserError();
          }
          const record = await get(database, userId, classroomId);
          const duplicate =
            record !== null &&
            JSON.stringify(record.progress) === JSON.stringify(progress);
          return {
            record,
            conflict: !duplicate,
            duplicate
          };
        }
      );
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
