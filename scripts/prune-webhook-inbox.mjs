#!/usr/bin/env node
// Removes settled webhook deliveries past their retention window.
//
// Processed rows have already had their payload cleared at the moment they
// succeeded. Dead rows still carry theirs, and a Clerk user.deleted payload
// holds the raw Clerk id that the deletion tombstone exists to avoid storing —
// so this is what stops an unprocessable delivery retaining an identity forever.
//
// Exit codes: 0 pruned, 2 could not run.
//
// Usage: node scripts/prune-webhook-inbox.mjs [--older-than-days 30]

import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createWebhookInboxStore } from "../server/webhook-inbox.js";

const DAYS_ARGUMENT = process.argv.indexOf("--older-than-days");
const days = DAYS_ARGUMENT === -1 ? 30 : Number(process.argv[DAYS_ARGUMENT + 1]);

if (!Number.isFinite(days) || days < 1 || days > 3650) {
  console.error("--older-than-days must be between 1 and 3650.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to prune the webhook inbox.");
  process.exit(2);
}

const pool = new Pool({
  connectionString: normalizeDatabaseConnectionString(connectionString),
  max: 1
});

try {
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
  const pruned = await store.prune({
    olderThanMs: days * 24 * 60 * 60 * 1000
  });
  console.log(`PRUNED ${pruned} settled webhook deliveries older than ${days}d.`);
} catch (error) {
  console.error(
    "ERROR the webhook inbox could not be pruned.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  await pool.end();
}
