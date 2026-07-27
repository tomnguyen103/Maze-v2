#!/usr/bin/env node
// Deletes rate-limit counters whose window has long closed.
//
// Guest buckets are keyed by a daily-rotating address hash, so yesterday's rows
// can never be hit again — they are dead weight rather than state. Signed-in
// buckets are reused, but their rows are rewritten in place.
//
// Exit codes: 0 pruned, 2 could not run.
//
// Usage: node scripts/prune-rate-limits.mjs [--older-than-hours 24]

import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createRateLimitStore } from "../server/rate-limit.js";

const HOURS_ARGUMENT = process.argv.indexOf("--older-than-hours");
const hours = HOURS_ARGUMENT === -1 ? 24 : Number(process.argv[HOURS_ARGUMENT + 1]);

if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365) {
  console.error("--older-than-hours must be between 1 and 8760.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to prune rate-limit counters.");
  process.exit(2);
}

const pool = new Pool({
  connectionString: normalizeDatabaseConnectionString(connectionString),
  max: 1
});

try {
  const store = createRateLimitStore({
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
  const pruned = await store.prune({ olderThanMs: hours * 60 * 60 * 1000 });
  console.log(`PRUNED ${pruned} rate-limit counters older than ${hours}h.`);
} catch (error) {
  console.error(
    "ERROR rate-limit counters could not be pruned.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  await pool.end();
}
