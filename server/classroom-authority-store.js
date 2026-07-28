/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} database
 */
export function createClassroomAuthorityStore(database) {
  /**
   * @param {string} sql
   * @param {unknown[]} values
   */
  async function apply(sql, values) {
    const result = await database.query(sql, values);
    return result.rows[0]?.applied === true;
  }

  return {
    /** @param {{ id: string, name: string, occurredAt: number }} classroom */
    upsertClassroom({ id, name, occurredAt }) {
      return apply(
        "SELECT sync_classroom($1, $2, $3) AS applied",
        [id, name, occurredAt]
      );
    },
    /** @param {{ id: string, occurredAt: number }} classroom */
    deleteClassroom({ id, occurredAt }) {
      return apply(
        "SELECT delete_classroom($1, $2) AS applied",
        [id, occurredAt]
      );
    },
    /**
     * @param {{
     *   id: string,
     *   classroomId: string,
     *   userId: string,
     *   role: "teacher" | "student",
     *   occurredAt: number
     * }} membership
     */
    upsertMembership({ id, classroomId, userId, role, occurredAt }) {
      return apply(
        "SELECT sync_classroom_membership($1, $2, $3, $4, $5) AS applied",
        [id, classroomId, userId, role, occurredAt]
      );
    },
    /** @param {{ id: string, occurredAt: number }} membership */
    deleteMembership({ id, occurredAt }) {
      return apply(
        "SELECT delete_classroom_membership($1, $2) AS applied",
        [id, occurredAt]
      );
    }
  };
}
