#!/usr/bin/env node
// Lists webhook deliveries that exhausted their retries.
//
// A dead row is one the retry loop gave up on, so it represents a state change
// the provider believes happened and we never applied. `GET
// /api/admin/webhooks/dead` serves the same rows to an admin; this stays the
// way to see them from a shell and to gate a deploy on the exit code.
//
// Exit codes: 0 none dead, 1 at least one dead row, 2 could not run.
//
// Usage: node scripts/list-dead-webhooks.mjs [--limit 100]

import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createWebhookInboxStore } from "../server/webhook-inbox.js";

const LIMIT_ARGUMENT = process.argv.indexOf("--limit");
const limit = LIMIT_ARGUMENT === -1 ? 100 : Number(process.argv[LIMIT_ARGUMENT + 1]);

if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
  console.error("--limit must be an integer between 1 and 10000.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to list dead webhooks.");
  process.exit(2);
}

/** @type {Pool | null} */
let pool = null;

try {
  // Constructed inside the handler: normalizeDatabaseConnectionString throws on
  // a malformed URL, which outside `try` would bypass the documented exit code.
  pool = new Pool({
    connectionString: normalizeDatabaseConnectionString(connectionString),
    max: 1,
    // Bounded so a stalled database fails the script rather than hanging a
    // scheduled run forever.
    connectionTimeoutMillis: 10000,
    query_timeout: 60000
  });
  const store = createWebhookInboxStore({
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values) {
      const result = await pool.query(sql, values);
      return {
        rows: /** @type {Record<string, unknown>[]} */ (result.rows)
      };
    }
  });
  const dead = await store.listDead({ limit });
  if (dead.length === 0) {
    console.log("PASS no dead webhook deliveries.");
  } else {
    // Nonzero exit so this can gate a deploy or wake an operator: every row here
    // is a provider state change that was never applied.
    console.error(`FAIL ${dead.length} dead webhook deliveries.`);
    for (const row of dead) {
      console.error(
        `  ${row.provider} ${row.event_id} ${row.event_type} attempts=${row.attempts} last_error=${row.last_error ?? "unknown"} received=${row.received_at}`
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    "ERROR dead webhook deliveries could not be listed.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  await pool?.end();
}
