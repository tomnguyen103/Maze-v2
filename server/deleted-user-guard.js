import { createHash } from "node:crypto";

export class DeletedUserError extends Error {
  constructor() {
    super("This deleted account cannot accept new player data.");
    this.name = "DeletedUserError";
  }
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
