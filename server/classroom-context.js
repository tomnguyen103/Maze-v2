export class ClassroomContextError extends Error {
  constructor() {
    super("Classroom context is invalid.");
    this.name = "ClassroomContextError";
  }
}

export class ClassroomAccessDeniedError extends Error {
  constructor() {
    super("Classroom Membership is required.");
    this.name = "ClassroomAccessDeniedError";
  }
}

/**
 * @param {{ headers: Record<string, string | string[] | undefined> }} request
 */
export function classroomIdFromRequest(request) {
  const value = request.headers["x-echo-maze-classroom-id"];
  if (value === undefined) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !/^org_[A-Za-z0-9_-]{3,120}$/.test(value)
  ) {
    throw new ClassroomContextError();
  }
  return value;
}

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} database
 * @param {string} userId
 * @param {string | null} classroomId
 */
export async function assertClassroomMembership(
  database,
  userId,
  classroomId
) {
  if (classroomId === null) {
    return null;
  }
  const result = await database.query(
    `SELECT role
     FROM classroom_memberships
     WHERE classroom_id = $1
       AND clerk_user_id = $2`,
    [classroomId, userId]
  );
  if (!result.rows[0]) {
    throw new ClassroomAccessDeniedError();
  }
  return String(result.rows[0].role);
}
