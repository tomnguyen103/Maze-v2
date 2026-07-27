#!/usr/bin/env node
// Walks the audit_events hash chain and recomputes every row_hash.
// Exits 0 when the chain is intact, 1 when any row was edited, removed, or
// reordered, and 2 when the database is not configured.
//
// Usage: node scripts/verify-audit-chain.mjs [--batch 5000]

import { Pool } from "pg";
import {
  AUDIT_GENESIS_HASH as GENESIS_HASH,
  createAuditStore,
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

const pool = new Pool({
  connectionString: normalizeDatabaseConnectionString(connectionString),
  max: 1
});

try {
  const store = createAuditStore(pool);
  let afterId = 0;
  let checked = 0;
  let expectedPrev = GENESIS_HASH;
  for (;;) {
    const rows = await store.readChain({ afterId, limit: batchSize });
    if (rows.length === 0) {
      break;
    }
    const result = verifyAuditChain(rows, { expectedPrevHash: expectedPrev });
    checked += result.checked;
    if (!result.valid) {
      console.error(
        `FAIL audit chain broken at id ${result.brokenAt} (${result.reason}) after ${checked} rows.`
      );
      process.exitCode = 1;
      break;
    }
    expectedPrev = String(rows[rows.length - 1].row_hash);
    afterId = Number(rows[rows.length - 1].id);
    if (rows.length < batchSize) {
      break;
    }
  }
  if (process.exitCode !== 1) {
    const head = await pool.query(
      "SELECT row_hash FROM audit_chain_head WHERE id = 1"
    );
    const storedHead = String(head.rows[0]?.row_hash ?? GENESIS_HASH);
    if (storedHead !== expectedPrev) {
      console.error(
        `FAIL audit chain head ${storedHead} does not match the last row hash ${expectedPrev}.`
      );
      process.exitCode = 1;
    } else {
      console.log(`PASS audit chain intact across ${checked} rows.`);
    }
  }
} finally {
  await pool.end();
}
