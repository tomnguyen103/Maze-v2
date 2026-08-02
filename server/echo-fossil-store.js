import {
  createFossilCollection,
  mergeEchoFossilCollections,
  normalizeFossilCollection
} from "../src/game/quest-fossils.js";
import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";
import { withTenantContext } from "./tenant-context.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createEchoFossilStore(pool) {
  return {
    /** @param {string} userId @param {string} questId */
    async getFossils(userId, questId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const result = await database.query(
            `SELECT quest_id, collection
             FROM echo_fossil_collections
             WHERE player_id = $1
               AND quest_id = $2`,
            [userId, questId]
          );
          const row = result.rows[0];
          const collection = normalizeFossilCollection(row?.collection);
          return {
            collection: collection?.questId === questId
              ? collection
              : createFossilCollection(questId)
          };
        }
      );
    },

    /** @param {string} userId @param {unknown} input */
    async saveFossils(userId, input) {
      const collection = normalizeFossilCollection(input);
      if (!collection) {
        throw new Error("Echo Fossil Collection is invalid.");
      }
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const existingResult = await database.query(
            `SELECT quest_id, collection
             FROM echo_fossil_collections
             WHERE player_id = $1
             FOR UPDATE`,
            [userId]
          );
          const existing = existingResult.rows[0];
          const stored = normalizeFossilCollection(existing?.collection);
          const merged = stored?.questId === collection.questId
            ? mergeEchoFossilCollections(collection, stored)
            : collection;
          const result = await database.query(
            `WITH ${activeUserGuardCtes("$4")},
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
         INSERT INTO echo_fossil_collections (
           player_id,
           quest_id,
           collection
         )
         SELECT $1, $2, $3::jsonb
         FROM available_access
         LIMIT 1
         ON CONFLICT (player_id) DO UPDATE SET
           quest_id = EXCLUDED.quest_id,
           collection = EXCLUDED.collection,
           updated_at = NOW()
         RETURNING quest_id, collection`,
            [
              userId,
              merged.questId,
              JSON.stringify(merged),
              deletedUserHash(userId)
            ]
          );
          const row = result.rows[0];
          if (!row) {
            throw new DeletedUserError();
          }
          const saved = normalizeFossilCollection(row.collection);
          if (!saved || saved.questId !== merged.questId) {
            throw new Error("Stored Echo Fossil Collection is invalid.");
          }
          return { collection: saved };
        }
      );
    }
  };
}
