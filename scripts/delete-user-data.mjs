import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDatabasePool } from "../server/database.js";
import { deletedUserHash } from "../server/deleted-user-guard.js";
import { createUserDeletionStore } from "../server/user-deletion-store.js";

const REQUIRED_CONFIRMATION = "DELETE APPLICATION DATA";

/**
 * @param {{
 *   pool: Parameters<typeof createUserDeletionStore>[0],
 *   userId: unknown,
 *   confirmation: unknown,
 *   confirmationHash: unknown
 * }} input
 */
export async function deleteUserApplicationData(input) {
  if (typeof input.userId !== "string" || input.userId.trim() === "") {
    throw new Error("A Clerk user id is required.");
  }
  if (input.confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error("Deletion confirmation is invalid.");
  }
  if (input.confirmationHash !== deletedUserHash(input.userId)) {
    throw new Error("Deletion confirmation digest does not match.");
  }

  await createUserDeletionStore(input.pool).deleteUser(input.userId);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  const pool = createDatabasePool(connectionString);
  try {
    await deleteUserApplicationData({
      pool,
      userId: process.env.ECHO_MAZE_DELETE_USER_ID,
      confirmation: process.env.ECHO_MAZE_DELETE_CONFIRM,
      confirmationHash: process.env.ECHO_MAZE_DELETE_CONFIRM_SHA256
    });
    console.log("Application data deletion verified.");
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    console.error("Application data deletion failed.");
    process.exitCode = 1;
  });
}
