import { ClassroomAccessDeniedError } from "./classroom-context.js";
import { InputError } from "./player-validation.js";
import { withTenantContext } from "./tenant-context.js";

/**
 * A Grant request that is well-formed and authorized but conflicts with the
 * assignment's current state: closed assignment, exhausted capacity, missing
 * paid License, or a different non-terminal Run already holding the Grant.
 */
export class ClassExpeditionStateError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ClassExpeditionStateError";
  }
}

export const STATE_MESSAGES = [
  "Class Expedition is closed.",
  "Class Expedition capacity is fully assigned.",
  "Class Expedition has no paid base License.",
  "Classroom Run Grant conflict.",
  "Classroom Run Grant not found.",
  "Classroom Run outcome already recorded."
];

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
  const state = STATE_MESSAGES.find((known) => message.includes(known));
  if (state) {
    return new ClassExpeditionStateError(state);
  }
  if (message.includes("outside the assigned Atlas Region")) {
    return new InputError("Labyrinth is outside the assigned Atlas Region.");
  }
  // Two simultaneous first Grants for the same Labyrinth race past the
  // row lock (no row exists yet); the primary key wins the race and the
  // loser retries into the idempotent duplicate path.
  if (code === "23505" && message.includes("classroom_run_grants")) {
    return new ClassExpeditionStateError("Classroom Run Grant conflict.");
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
     * @param {{ runId: string, labyrinthNumber: number }} input
     */
    async issueRunGrant(userId, classroomId, expeditionId, input) {
      try {
        return await withTenantContext(
          pool,
          { explorerId: userId, classroomId },
          async (database) => {
            const result = await database.query(
              "SELECT * FROM issue_classroom_run_grant($1, $2, $3::SMALLINT)",
              [expeditionId, input.runId, input.labyrinthNumber]
            );
            const row = result.rows[0] ?? {};
            return {
              runId: String(row.out_run_id),
              status: String(row.out_status),
              seatNumber: Number(row.out_seat_number),
              duplicate: row.out_duplicate === true
            };
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
     * @param {{
     *   runId: string,
     *   labyrinthNumber: number,
     *   outcome: "escaped" | "defeated"
     * }} input
     */
    async recordRunOutcome(userId, classroomId, expeditionId, input) {
      try {
        return await withTenantContext(
          pool,
          { explorerId: userId, classroomId },
          async (database) => {
            const result = await database.query(
              "SELECT record_classroom_run_outcome($1, $2::SMALLINT, $3, $4) AS ok",
              [
                expeditionId,
                input.labyrinthNumber,
                input.runId,
                input.outcome
              ]
            );
            return result.rows[0]?.ok === true;
          }
        );
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },

    /**
     * Teacher aggregates: class counts only, straight from the definer
     * reader. No Student name, identifier, or ordering ever reaches this
     * shape, and a non-Teacher caller simply receives no rows.
     *
     * @param {string} userId
     * @param {string} classroomId
     * @param {string} expeditionId
     */
    async progressForExpedition(userId, classroomId, expeditionId) {
      const rows = await withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (database) => {
          const result = await database.query(
            "SELECT * FROM read_class_expedition_progress($1, $2)",
            [classroomId, expeditionId]
          );
          return result.rows;
        }
      );
      if (rows.length === 0) {
        throw new ClassroomAccessDeniedError();
      }
      return {
        startedStudentCount: Number(rows[0]?.started_student_count ?? 0),
        regionCompleteCount: Number(rows[0]?.region_complete_count ?? 0),
        labyrinths: rows.map((row) => ({
          labyrinthNumber: Number(row.labyrinth_number),
          completedCount: Number(row.completed_count)
        }))
      };
    },

    /**
     * @param {string} userId
     * @param {string} classroomId
     * @param {string} expeditionId
     */
    listOwnGrants(userId, classroomId, expeditionId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (database) => {
          const result = await database.query(
            `SELECT labyrinth_number, run_id, status
             FROM classroom_run_grants
             WHERE expedition_id = $1 AND clerk_user_id = $2
             ORDER BY labyrinth_number`,
            [expeditionId, userId]
          );
          return result.rows.map((row) => ({
            labyrinthNumber: Number(row.labyrinth_number),
            runId: String(row.run_id),
            status: String(row.status)
          }));
        }
      );
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
