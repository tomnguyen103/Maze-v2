import { ClassroomAccessDeniedError } from "./classroom-context.js";
import { withTenantContext } from "./tenant-context.js";

/** @param {Record<string, unknown>} row */
function classroom(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role)
  };
}

/** @param {Record<string, unknown>} row */
function progress(row) {
  return {
    studentName: String(row.student_name),
    objectiveId: String(row.objective_id),
    correct: Number(row.correct_count),
    wrong: Number(row.wrong_count),
    hints: Number(row.hint_count),
    skips: Number(row.skip_count),
    total: Number(row.total_count)
  };
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
export function createClassroomStore(pool) {
  /**
   * @param {{
   *   query: (
   *     sql: string,
   *     values?: unknown[]
   *   ) => Promise<{ rows: Record<string, unknown>[] }>
   * }} database
   * @param {string} userId
   * @param {string} classroomId
   */
  async function requireTeacherInTransaction(database, userId, classroomId) {
    const membership = await database.query(
      `SELECT role
       FROM classroom_memberships
       WHERE classroom_id = $1
         AND clerk_user_id = $2`,
      [classroomId, userId]
    );
    if (membership.rows[0]?.role !== "teacher") {
      throw new ClassroomAccessDeniedError();
    }
    return "teacher";
  }

  return {
    /** @param {string} userId */
    listForUser(userId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const result = await database.query(
            `SELECT
               classrooms.id,
               classrooms.name,
               classroom_memberships.role
             FROM classroom_memberships
             JOIN classrooms
               ON classrooms.id = classroom_memberships.classroom_id
             WHERE classroom_memberships.clerk_user_id = $1
             ORDER BY classrooms.name, classrooms.id
             LIMIT 100`,
            [userId]
          );
          return result.rows.map(classroom);
        }
      );
    },

    /** @param {string} userId @param {string} classroomId */
    requireTeacher(userId, classroomId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        (database) =>
          requireTeacherInTransaction(database, userId, classroomId)
      );
    },

    /** @param {string} userId @param {string} classroomId */
    progressForTeacher(userId, classroomId) {
      return withTenantContext(
        pool,
        { explorerId: userId, classroomId },
        async (database) => {
          await requireTeacherInTransaction(database, userId, classroomId);
          const result = await database.query(
            `SELECT
               student_name,
               objective_id,
               correct_count,
               wrong_count,
               hint_count,
               skip_count,
               total_count,
               truncated
             FROM read_classroom_progress($1)`,
            [classroomId]
          );
          return {
            progress: result.rows.map(progress),
            truncated: result.rows[0]?.truncated === true
          };
        }
      );
    }
  };
}
