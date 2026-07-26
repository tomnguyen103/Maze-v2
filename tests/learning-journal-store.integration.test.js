import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createLearningJournalStore } from "../server/learning-journal-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

describe.runIf(runIntegration)("learning Journal store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
    const existing = await pool.query(
      "SELECT to_regclass('public.learning_journals') AS name"
    );
    if (!existing.rows[0]?.name) {
      const migration = await readFile(
        new URL("../db/migrations/0005_lantern_journal.sql", import.meta.url),
        "utf8"
      );
      await pool.query(migration);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("atomically retains existing and incoming events", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const connection = await pool.connect();
    const store = createLearningJournalStore(connection);
    const first = {
      version: 1,
      events: [
        {
          eventId: "event_00000000-0000-4000-8000-000000000301",
          questionId: "scout-capable-0",
          topicId: "arithmetic",
          learningObjectiveId: "scout-equal-groups",
          difficultyBand: "capable",
          outcome: "wrong"
        }
      ]
    };
    const second = {
      version: 1,
      events: [
        {
          eventId: "event_00000000-0000-4000-8000-000000000302",
          questionId: "scout-capable-1",
          topicId: "arithmetic",
          learningObjectiveId: "scout-equal-sharing",
          difficultyBand: "capable",
          outcome: "correct"
        }
      ]
    };

    try {
      await connection.query("BEGIN");
      await store.saveJournal("journal_postgres_integration", first);
      const merged = /** @type {typeof first} */ (
        await store.saveJournal("journal_postgres_integration", second)
      );
      expect(merged.events).toEqual([...first.events, ...second.events]);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });
});
