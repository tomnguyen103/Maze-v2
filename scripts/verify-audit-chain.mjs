#!/usr/bin/env node
// Walks the audit_events hash chain and recomputes every row_hash.
//
// Exit codes:
//   0  chain intact
//   1  chain broken — a row was edited, removed, or reordered
//   2  the verifier could not run (missing config, database or query failure)
//
// Every batch and the chain-head read share ONE repeatable-read snapshot. With
// separate snapshots a normal append landing between the last batch and the head
// read would look like tampering.
//
// Usage: node scripts/verify-audit-chain.mjs [--batch 5000]

import { Pool } from "pg";
import {
  AUDIT_GENESIS_HASH,
  readAuditChain,
  verifyAuditChain
} from "../server/audit-store.js";
import { normalizeDatabaseConnectionString } from "../server/database.js";

const BATCH_ARGUMENT = process.argv.indexOf("--batch");
const batchSize =
  BATCH_ARGUMENT === -1 ? 5000 : Number(process.argv[BATCH_ARGUMENT + 1]);

if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100000) {
  console.error("--batch must be an integer between 1 and 100000.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to verify the audit chain.");
  process.exit(2);
}

/**
 * @param {(
 *   sql: string,
 *   values?: unknown[]
 * ) => Promise<{ rows: Record<string, unknown>[] }>} query
 */
async function verify(query) {
  let afterId = 0;
  let checked = 0;
  let expectedPrev = AUDIT_GENESIS_HASH;
  for (;;) {
    const rows = await readAuditChain(query, { afterId, limit: batchSize });
    if (rows.length === 0) {
      break;
    }
    const result = verifyAuditChain(rows, { expectedPrevHash: expectedPrev });
    checked += result.checked;
    if (!result.valid) {
      return {
        broken: `audit chain broken at id ${result.brokenAt} (${result.reason}) after ${checked} rows.`
      };
    }
    expectedPrev = String(rows[rows.length - 1].row_hash);
    afterId = Number(rows[rows.length - 1].id);
    if (rows.length < batchSize) {
      break;
    }
  }

  const head = await query("SELECT row_hash FROM audit_chain_head WHERE id = 1");
  const storedHead = String(head.rows[0]?.row_hash ?? AUDIT_GENESIS_HASH);
  if (storedHead !== expectedPrev) {
    return {
      broken: `audit chain head ${storedHead} does not match the last row hash ${expectedPrev}.`
    };
  }
  return { checked };
}

/** @type {Pool | null} */
let pool = null;
/** @type {import("pg").PoolClient | null} */
let client = null;
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
  client = await pool.connect();
  await client.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
  );
  const outcome = await verify(client.query.bind(client));
  await client.query("COMMIT");
  if (outcome.broken) {
    console.error(`FAIL ${outcome.broken}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS audit chain intact across ${outcome.checked} rows.`);
  }
} catch (error) {
  // An operational failure is not evidence of tampering, so it must not share
  // the exit code that means "the chain is broken".
  await client?.query("ROLLBACK").catch(() => {});
  console.error(
    "ERROR audit chain could not be verified.",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 2;
} finally {
  client?.release();
  await pool?.end();
}
