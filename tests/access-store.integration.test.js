import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createRunAccessStore } from "../server/run-access-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

describe.runIf(runIntegration)("Run Access store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
    await pool.query(
      `CREATE TABLE IF NOT EXISTS deleted_user_tombstones (
         clerk_user_id_hash CHAR(64) PRIMARY KEY
           CHECK (clerk_user_id_hash ~ '^[a-f0-9]{64}$'),
         deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("returns the row created for a first-time active user", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const connection = await pool.connect();
    const store = createRunAccessStore(
      /** @type {import("pg").Pool} */ (
        /** @type {unknown} */ (connection)
      )
    );
    try {
      await connection.query("BEGIN");
      await expect(
        store.getAccess("access_first_user_integration")
      ).resolves.toEqual({
        freeRunsRemaining: 3,
        state: "free"
      });
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });
});
