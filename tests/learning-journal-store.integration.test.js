import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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
    if (
      !existing.rows[0]?.journal_name ||
      !existing.rows[0]?.tombstone_name
    ) {
      throw new Error("Apply the repository migrations before integration tests.");
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("atomically retains existing and incoming events", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const store = createLearningJournalStore(pool);
    const userId = `user_${randomUUID().replaceAll("-", "")}`;
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

    await store.saveJournal(userId, first, 0);
    const merged = await store.saveJournal(userId, second, 0);
    expect(
      /** @type {typeof first} */ (merged.journal).events
    ).toEqual([...first.events, ...second.events]);
  });

  it("creates a first Journal at a non-zero clear generation", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const store = createLearningJournalStore(pool);
    const userId = `user_${randomUUID().replaceAll("-", "")}`;
    const journal = {
      version: 1,
      events: []
    };

    await expect(
      store.saveJournal(userId, journal, 3)
    ).resolves.toEqual({
      journal,
      clearGeneration: 3
    });
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
