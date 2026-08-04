import { createHash } from "node:crypto";

export class DeletedUserError extends Error {
  constructor() {
    super("This deleted account cannot accept new player data.");
    this.name = "DeletedUserError";
  }
}

/**
 * Answer a request that reached a store guarding a deleted account.
 *
 * Four routes classified this and the rest did not, so the same deleted
 * account was a clean 410 on one path and a 500 or 503 on another — and a
 * client reads those as "retry", forever, for an account that will never come
 * back. Every route that can reach a guarded store calls this.
 *
 * @param {unknown} error
 * @param {import("node:http").ServerResponse} response
 * @returns {boolean} whether the error was answered
 */
export function answerDeletedUser(error, response) {
  if (!(error instanceof DeletedUserError)) {
    return false;
  }
  response.statusCode = 410;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ error: "This account has been deleted." }));
  return true;
}

/** @param {string} userId */
export function deletedUserHash(userId) {
  return createHash("sha256").update(userId).digest("hex");
}

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<{ rows?: unknown[] }> }} client
 * @param {string} userId
 */
export async function lockActiveUser(client, userId) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [userId]
  );
  const deleted = await client.query(
    `SELECT 1
     FROM deleted_user_tombstones
     WHERE clerk_user_id_hash = $1`,
    [deletedUserHash(userId)]
  );
  if (deleted.rows?.length) {
    throw new DeletedUserError();
  }
}

/** @param {string} hashParameter */
export function activeUserGuardCtes(hashParameter) {
  return `user_lock AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(hashtextextended($1, 0))
         ),
         active_user AS MATERIALIZED (
           SELECT 1
           FROM user_lock
           WHERE NOT EXISTS (
             SELECT 1
             FROM deleted_user_tombstones
             WHERE clerk_user_id_hash = ${hashParameter}
           )
         )`;
}
