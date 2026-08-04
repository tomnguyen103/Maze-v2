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
     * @param {boolean | null} [autoJoinEnabled] ADR 0023: auto-join is
     *   opt-in, so a first registration defaults to off. `null` means the
     *   caller said nothing, which leaves an already-armed Classroom armed —
     *   re-registering a domain is not a decision about auto-join. It used to
     *   be a `TRUE` literal in SQL, so registering armed it and
     *   re-registering re-armed it.
     */
    async registerDomain(userId, classroomId, domain, autoJoinEnabled = null) {
      try {
        const result = await database.query(
          `SELECT domain, auto_join_enabled
           FROM register_classroom_domain($1, $2, $3, $4)`,
          [
            classroomId,
            userId,
            domain,
            autoJoinEnabled === null || autoJoinEnabled === undefined
              ? null
              : autoJoinEnabled === true
          ]
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
