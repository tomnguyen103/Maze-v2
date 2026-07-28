import { ClassroomDomainConflictError } from "./classroom-domain.js";

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} database
 */
export function createClassroomDomainStore(database) {
  return {
    /**
     * @param {string} userId
     * @param {string} classroomId
     * @param {string} domain
     */
    async registerDomain(userId, classroomId, domain) {
      try {
        const result = await database.query(
          `SELECT domain, auto_join_enabled
           FROM register_classroom_domain($1, $2, $3)`,
          [classroomId, userId, domain]
        );
        return domainRecord(result.rows[0]);
      } catch (error) {
        const databaseError = error && typeof error === "object"
          ? /** @type {Record<string, unknown>} */ (error)
          : {};
        if (databaseError.code === "23505") {
          throw new ClassroomDomainConflictError();
        }
        throw error;
      }
    },

    /** @param {string} userId @param {string} classroomId */
    async domainForTeacher(userId, classroomId) {
      const result = await database.query(
        `SELECT domain, auto_join_enabled
         FROM read_classroom_domain($1, $2)`,
        [classroomId, userId]
      );
      return result.rows[0] ? domainRecord(result.rows[0]) : null;
    },

    /** @param {string} domain */
    async classroomForDomain(domain) {
      const result = await database.query(
        "SELECT classroom_for_verified_domain($1) AS classroom_id",
        [domain]
      );
      const id = result.rows[0]?.classroom_id;
      return typeof id === "string" && id ? id : null;
    }
  };
}

/** @param {Record<string, unknown> | undefined} row */
function domainRecord(row) {
  if (!row) {
    throw new Error("Verified Classroom Domain was not stored.");
  }
  return {
    domain: String(row.domain),
    autoJoinEnabled: row.auto_join_enabled === true
  };
}
