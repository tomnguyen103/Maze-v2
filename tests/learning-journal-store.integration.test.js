import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createLearningJournalStore } from "../server/learning-journal-store.js";
import { deletedUserHash } from "../server/deleted-user-guard.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

describe.runIf(runIntegration)("learning Journal store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 2
    });
    const existing = await pool.query(
      `SELECT
         to_regclass('public.learning_journals') AS journal_name,
         to_regclass('public.deleted_user_tombstones') AS tombstone_name`
    );
    if (!existing.rows[0]?.journal_name) {
      const migration = await readFile(
        new URL("../db/migrations/0005_lantern_journal.sql", import.meta.url),
        "utf8"
      );
      await pool.query(migration);
    } else {
      if (!existing.rows[0]?.tombstone_name) {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS deleted_user_tombstones (
             clerk_user_id_hash CHAR(64) PRIMARY KEY
               CHECK (clerk_user_id_hash ~ '^[a-f0-9]{64}$'),
             deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
           )`
        );
      }
      await pool.query(
        `ALTER TABLE learning_journals
         ADD COLUMN IF NOT EXISTS clear_generation INTEGER NOT NULL DEFAULT 0
           CHECK (clear_generation >= 0)`
      );
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
      await store.saveJournal("journal_postgres_integration", first, 0);
      const merged = await store.saveJournal(
        "journal_postgres_integration",
        second,
        0
      );
      expect(
        /** @type {typeof first} */ (merged.journal).events
      ).toEqual([...first.events, ...second.events]);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });

  it("blocks an authenticated write that was waiting while deletion committed", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const userId = "journal_deleted_write_integration";
    const deletion = await pool.connect();
    const writer = createLearningJournalStore(pool);
    const journal = {
      version: 1,
      events: []
    };

    try {
      await deletion.query("BEGIN");
      await deletion.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [userId]
      );
      await deletion.query(
        `INSERT INTO deleted_user_tombstones (clerk_user_id_hash)
         VALUES ($1)
         ON CONFLICT (clerk_user_id_hash) DO NOTHING`,
        [deletedUserHash(userId)]
      );
      await deletion.query(
        "DELETE FROM player_access WHERE clerk_user_id = $1",
        [userId]
      );

      const waitingWrite = writer.saveJournal(userId, journal, 0);
      await deletion.query("COMMIT");

      await expect(waitingWrite).rejects.toMatchObject({
        name: "DeletedUserError"
      });
      await expect(
        pool.query(
          `SELECT
             EXISTS (
               SELECT 1 FROM player_access WHERE clerk_user_id = $1
             ) AS access_exists,
             EXISTS (
               SELECT 1 FROM learning_journals WHERE clerk_user_id = $1
             ) AS journal_exists`,
          [userId]
        )
      ).resolves.toMatchObject({
        rows: [{
          access_exists: false,
          journal_exists: false
        }]
      });
    } catch (error) {
      await deletion.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      deletion.release();
    }
  });
});
