import { ClassroomAccessDeniedError } from "./classroom-context.js";
import { withTenantContext } from "./tenant-context.js";

/** @param {Record<string, unknown>} row */
function expedition(row) {
  return {
    id: String(row.id),
    classroomId: String(row.classroom_id),
    atlasRegion: Number(row.atlas_region),
    levelId: String(row.level_id),
    learningDeckId: String(row.learning_deck_id),
    learningDeckRevision: String(row.learning_deck_revision),
    status: String(row.status),
    completionDate: completionDate(row.completion_date)
  };
}

/** @param {unknown} value */
function completionDate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

/**
 * Forced RLS answers a denied tenant write with a permission error and the
 * definer functions raise an access-denied message; both mean the same thing
 * to the route: this Explorer has no authority here.
 *
 * @param {unknown} error
 */
function mapDatabaseError(error) {
  const code = /** @type {{ code?: string }} */ (error)?.code;
  const message = error instanceof Error ? error.message : "";
  if (code === "42501" || message.includes("access denied")) {
    return new ClassroomAccessDeniedError();
  }
  return error;
}

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
export function createClassExpeditionStore(pool) {
  return {
    /** @param {string} userId @param {string} classroomId */
    listExpeditions(userId, classroomId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (database) => {
          const result = await database.query(
            `SELECT
               id,
               classroom_id,
               atlas_region,
               level_id,
               learning_deck_id,
               learning_deck_revision,
               status,
               completion_date
             FROM class_expeditions
             WHERE classroom_id = $1
             ORDER BY created_at DESC, id
             LIMIT 50`,
            [classroomId]
          );
          return result.rows.map(expedition);
        }
      );
    },

    /**
     * @param {string} userId
     * @param {string} classroomId
     * @param {{
     *   expeditionId: string,
     *   atlasRegion: number,
     *   levelId: string,
     *   learningDeckId: string,
     *   learningDeckRevision: string,
     *   completionDate: string | null
     * }} input
     */
    async createExpedition(userId, classroomId, input) {
      try {
        return await withTenantContext(
          pool,
          { explorerId: userId, classroomId },
          async (database) => {
            const result = await database.query(
              `INSERT INTO class_expeditions (
                 id,
                 classroom_id,
                 atlas_region,
                 level_id,
                 learning_deck_id,
                 learning_deck_revision,
                 completion_date,
                 created_by
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING
                 id,
                 classroom_id,
                 atlas_region,
                 level_id,
                 learning_deck_id,
                 learning_deck_revision,
                 status,
                 completion_date`,
              [
                input.expeditionId,
                classroomId,
                input.atlasRegion,
                input.levelId,
                input.learningDeckId,
                input.learningDeckRevision,
                input.completionDate,
                userId
              ]
            );
            return expedition(result.rows[0]);
          }
        );
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },

    /**
     * @param {string} userId
     * @param {string} classroomId
     * @param {string} expeditionId
     * @param {"open" | "closed"} status
     */
    async setExpeditionStatus(userId, classroomId, expeditionId, status) {
      try {
        return await withTenantContext(
          pool,
          { explorerId: userId, classroomId },
          async (database) => {
            const result = await database.query(
              "SELECT close_class_expedition($1, $2) AS status",
              [expeditionId, status]
            );
            return {
              id: expeditionId,
              status: String(result.rows[0]?.status)
            };
          }
        );
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }
  };
}
