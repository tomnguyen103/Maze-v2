import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

describe.runIf(runIntegration)("regional Score Entry migration on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("backfills legacy rows and isolates ranking by exact partition", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const migration = await readFile(
      new URL(
        "../db/migrations/0019_score_entry_ruleset_partitions.sql",
        import.meta.url
      ),
      "utf8"
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE score_entries (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          player_id TEXT NOT NULL,
          labyrinth_number SMALLINT NOT NULL,
          score INTEGER NOT NULL,
          moves INTEGER NOT NULL,
          elapsed_ms INTEGER NOT NULL,
          escaped BOOLEAN NOT NULL DEFAULT TRUE,
          classroom_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        INSERT INTO score_entries (
          player_id,
          labyrinth_number,
          score,
          moves,
          elapsed_ms
        )
        VALUES
          ('legacy-foundation', 4, 700, 90, 9000),
          ('legacy-developing', 5, 800, 80, 8000),
          ('legacy-capable', 9, 900, 70, 7000),
          ('legacy-advanced', 13, 1000, 60, 6000),
          ('legacy-mastery', 20, 1100, 50, 5000)
      `);
      await client.query(migration);

      const legacy = await client.query(`
        SELECT atlas_region_id, ruleset_revision
        FROM score_entries
        ORDER BY labyrinth_number
      `);
      expect(legacy.rows).toEqual([
        { atlas_region_id: "foundation", ruleset_revision: "classic-v1" },
        { atlas_region_id: "developing", ruleset_revision: "classic-v1" },
        { atlas_region_id: "capable", ruleset_revision: "classic-v1" },
        { atlas_region_id: "advanced", ruleset_revision: "classic-v1" },
        { atlas_region_id: "mastery", ruleset_revision: "classic-v1" }
      ]);

      await client.query(`
        INSERT INTO score_entries (
          player_id,
          labyrinth_number,
          score,
          moves,
          elapsed_ms,
          atlas_region_id,
          ruleset_revision
        )
        VALUES
          ('current-capable', 9, 950, 65, 6500, 'capable', 'echo-bridges-v1'),
          ('classic-capable', 9, 1200, 55, 5500, 'capable', 'classic-v1'),
          ('current-advanced', 13, 1300, 45, 4500, 'advanced', 'tide-doors-v1')
      `);
      const currentCapable = await client.query(`
        SELECT player_id, score
        FROM score_entries
        WHERE atlas_region_id = 'capable'
          AND ruleset_revision = 'echo-bridges-v1'
        ORDER BY score DESC
      `);
      expect(currentCapable.rows).toEqual([
        { player_id: "current-capable", score: 950 }
      ]);

      await expect(client.query(`
        INSERT INTO score_entries (
          player_id,
          labyrinth_number,
          score,
          moves,
          elapsed_ms,
          atlas_region_id,
          ruleset_revision
        )
        VALUES (
          'mismatch',
          9,
          1400,
          40,
          4000,
          'advanced',
          'tide-doors-v1'
        )
      `)).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
