import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createDailyStore } from "../server/daily-store.js";
import { createPlayerStore } from "../server/player-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;

describe.runIf(runIntegration)("Verified Daily store on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 2
    });
    const existing = await pool.query(
      `SELECT
         to_regclass('public.verified_daily_submissions') AS submissions,
         to_regclass('public.verified_daily_entries') AS entries`
    );
    if (!existing.rows[0]?.submissions || !existing.rows[0]?.entries) {
      throw new Error("Apply the repository migrations before integration tests.");
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps one idempotent best result and ranks public facts deterministically", async () => {
    if (!pool) throw new Error("Database pool was not initialized.");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const firstUser = `daily_first_${suffix}`;
    const secondUser = `daily_second_${suffix}`;
    const date = "2099-07-26";
    const players = createPlayerStore(pool);
    const daily = createDailyStore(pool);

    await players.saveProfile(firstUser, {
      username: `Moss ${suffix}`,
      usernameKey: `moss-${suffix}`,
      explorerPalette: "sunset",
      playgroundPalette: "twilight"
    });
    await players.saveProfile(secondUser, {
      username: `River ${suffix}`,
      usernameKey: `river-${suffix}`,
      explorerPalette: "sunset",
      playgroundPalette: "twilight"
    });

    const first = {
      idempotencyKey: `daily_${suffix}_first`,
      date,
      dailyVersion: 1,
      score: 900,
      wardensDefeated: 2,
      echoesCollected: 4,
      moves: 76,
      elapsedMs: 7600
    };
    await expect(daily.submitVerifiedEntry(firstUser, first)).resolves.toMatchObject({
      duplicate: false,
      improved: true
    });
    await expect(daily.submitVerifiedEntry(firstUser, first)).resolves.toMatchObject({
      duplicate: true,
      improved: false,
      entry: { score: 900, moves: 76 }
    });
    await expect(
      daily.submitVerifiedEntry(firstUser, {
        ...first,
        idempotencyKey: `daily_${suffix}_worse`,
        score: 800,
        moves: 70
      })
    ).resolves.toMatchObject({
      duplicate: false,
      improved: false,
      entry: { score: 900, moves: 76 }
    });
    await daily.submitVerifiedEntry(secondUser, {
      ...first,
      idempotencyKey: `daily_${suffix}_second`,
      score: 900,
      moves: 70
    });

    const board = await daily.getLeaderboard(date, 10);
    expect(board.slice(0, 2)).toEqual([
      {
        rank: 1,
        username: `River ${suffix}`,
        score: 900,
        moves: 70
      },
      {
        rank: 2,
        username: `Moss ${suffix}`,
        score: 900,
        moves: 76
      }
    ]);
    expect(JSON.stringify(board)).not.toContain(firstUser);
    expect(JSON.stringify(board)).not.toContain(secondUser);
  });
});
