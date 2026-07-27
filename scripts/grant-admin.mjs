#!/usr/bin/env node
// Grants the first admin. Every later role change goes through
// POST /api/admin/users/:id/role, which requires an existing admin — so this
// script exists only to break that circle.
//
// It writes the same audit row the endpoint would, attributed to
// 'system:bootstrap', so a chain-of-custody question about who made the first
// admin has an answer.
//
// Exit codes: 0 granted, 2 could not run.
//
// Usage: node scripts/grant-admin.mjs <clerk-user-id> [--role admin|moderator]

import { Pool } from "pg";
import { createAuditStore } from "../server/audit-store.js";
import { createAuditRecorder, SYSTEM_ACTORS } from "../server/audit.js";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createRoleStore } from "../server/rbac.js";
import { isRole } from "../shared/permissions.js";

// Parsed positionally rather than by filtering out `--` tokens: filtering makes
// a flag's value indistinguishable from the user id, so
// `grant-admin --role moderator user_123` would have granted moderator to the
// literal id "moderator".
const argv = process.argv.slice(2);
/** @type {string | undefined} */
let userId;
let role = "admin";
let parseError = "";
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--role") {
    role = argv[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--role=")) {
    role = argument.slice("--role=".length);
  } else if (argument.startsWith("-")) {
    parseError = `Unknown option ${argument}.`;
  } else if (userId === undefined) {
    userId = argument;
  } else {
    parseError = "Pass exactly one Clerk user id.";
  }
}

if (parseError) {
  console.error(parseError);
  process.exit(2);
}
if (!userId || !/^[A-Za-z0-9_-]{1,255}$/.test(userId)) {
  console.error("Usage: node scripts/grant-admin.mjs <clerk-user-id> [--role admin|moderator]");
  process.exit(2);
}
if (!isRole(role) || role === "player") {
  console.error("--role must be admin or moderator.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to grant a role.");
  process.exit(2);
}

/** @type {Pool | null} */
let pool = null;

try {
  // Constructed inside the handler: normalizeDatabaseConnectionString throws on
  // a malformed URL, which outside `try` would bypass the documented exit code.
  const grantPool = new Pool({
    connectionString: normalizeDatabaseConnectionString(connectionString),
    max: 1,
    // Bounded so a stalled database fails the script rather than hanging a
    // scheduled run forever.
    connectionTimeoutMillis: 10000,
    query_timeout: 60000
  });
  pool = grantPool;
  const adapter = {
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values) {
      const result = await grantPool.query(sql, values);
      return {
        rows: /** @type {Record<string, unknown>[]} */ (result.rows)
      };
    }
  };
  const store = createRoleStore(adapter);
  const current = await store.getRole(userId);
  if (current === role) {
    // Re-running the bootstrap must not rewrite updated_at or file a role.grant
    // for a change that did not happen.
    console.log(`UNCHANGED ${userId} already holds ${role}.`);
    process.exit(0);
  }
  const result = await store.setRole({
    userId,
    role,
    grantedBy: SYSTEM_ACTORS.bootstrap
  });
  const recorder = createAuditRecorder({ store: createAuditStore(grantPool) });
  await recorder.recordAudit(
    { actorId: SYSTEM_ACTORS.bootstrap, actorRole: "system" },
    "role.grant",
    { type: "user_role", id: userId },
    { role: result.previousRole },
    { role }
  );
  if (recorder.failureCount() > 0) {
    // The grant succeeded but its audit row did not. Say so loudly: a role
    // change with no audit row is exactly what the log exists to prevent.
    console.error(
      `WARN role granted but the audit row failed. Reconcile before relying on the log.`
    );
    process.exitCode = 2;
  } else {
    console.log(
      `GRANTED ${role} to ${userId} (was ${result.previousRole}), audited as ${SYSTEM_ACTORS.bootstrap}.`
    );
  }
} catch (error) {
  console.error(
    "ERROR role could not be granted.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  await pool?.end();
}
