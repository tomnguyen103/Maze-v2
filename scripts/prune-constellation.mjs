#!/usr/bin/env node
// Hard-deletes Daily Trail Constellation aggregates and contribution receipts
// once their 48-hour window has closed.
//
// This is the housekeeping half of ADR 0033's deletion guarantee. The other
// half lives on the read path: every Constellation read filters on the same
// expiry instant, so a Daily that this job has not reached yet is still
// unreadable. Running it twice in a row is safe — the second run finds
// nothing and reports zero.
//
// Exit codes: 0 pruned, 2 could not run.
//
// Usage: node scripts/prune-constellation.mjs

import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createConstellationStore } from "../server/constellation-store.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to prune Constellation aggregates.");
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
  const store = createConstellationStore(pool);
  const { prunedTotals, prunedContributions } = await store.prune();
  console.log(
    `PRUNED ${prunedTotals} expired Daily aggregates and ` +
      `${prunedContributions} contribution receipts.`
  );
} catch (error) {
  console.error(
    "ERROR Constellation aggregates could not be pruned.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  await pool?.end();
}
