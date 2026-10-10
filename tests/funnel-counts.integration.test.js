import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { createFunnelStore } from "../server/funnel-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const adminDatabaseUrl = process.env.DATABASE_ADMIN_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(databaseUrl);
/** @type {Pool | null} */
let pool = null;
/** @type {Pool | null} */
let adminPool = null;

/**
 * Today's count of one step. Each case reads it before and after its writes
 * inside one rolled-back transaction, so other rows never matter.
 *
 * @param {import("pg").PoolClient} connection
 * @param {string} metric
 * @param {string} [campaign]
 */
async function countOf(connection, metric, campaign = "") {
  const result = await connection.query(
    `SELECT COALESCE(SUM(count), 0)::int AS count
     FROM funnel_counts
     WHERE day = (now() AT TIME ZONE 'UTC')::date
       AND metric = $1 AND campaign = $2 AND mode = ''`,
    [metric, campaign]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * @param {(connection: import("pg").PoolClient) => Promise<void>} callback
 * @param {Pool | null} [source]
 */
async function rolledBack(callback, source = pool) {
  if (!source) throw new Error("Database pool was not initialized.");
  const connection = await source.connect();
  try {
    await connection.query("BEGIN");
    await callback(connection);
  } finally {
    await connection.query("ROLLBACK");
    connection.release();
  }
}

/**
 * @param {import("pg").PoolClient} connection
 * @param {string} playerId
 * @param {string} runId
 */
function insertGrant(connection, playerId, runId) {
  return connection.query(
    `INSERT INTO run_access_grants (
       player_id, run_id, seed, level_id, labyrinth_number, grant_source
     )
     VALUES ($1, $2, 'funnel-seed', 'bright-start', 1, 'free')`,
    [playerId, runId]
  );
}

describe.runIf(runIntegration)("Funnel Counts on PostgreSQL", () => {
  beforeAll(() => {
    pool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("US-05.1 counts a new account once and a conflicting insert never", async () => {
    await rolledBack(async (connection) => {
      const playerId = `user_funnel_${randomUUID()}`;
      const before = await countOf(connection, "account_created");

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await connection.query(
          `INSERT INTO player_access (clerk_user_id) VALUES ($1)
           ON CONFLICT (clerk_user_id) DO NOTHING`,
          [playerId]
        );
      }

      expect(await countOf(connection, "account_created")).toBe(before + 1);
    });
  });

  it("US-06.1 counts the first Personal Run Grant once and stamps its time", async () => {
    await rolledBack(async (connection) => {
      const playerId = `user_funnel_${randomUUID()}`;
      await connection.query(
        "INSERT INTO player_access (clerk_user_id) VALUES ($1)",
        [playerId]
      );
      const before = await countOf(connection, "personal_run_activated");

      await insertGrant(connection, playerId, "funnel-run-1");
      await insertGrant(connection, playerId, "funnel-run-2");

      expect(await countOf(connection, "personal_run_activated")).toBe(
        before + 1
      );
      const access = await connection.query(
        `SELECT first_run_grant_at IS NOT NULL AS stamped
         FROM player_access WHERE clerk_user_id = $1`,
        [playerId]
      );
      expect(access.rows[0]?.stamped).toBe(true);
    });
  });

  it("US-09.1 counts an allowlisted visit and drops a free-text campaign without an error", async () => {
    await rolledBack(async (connection) => {
      const store = createFunnelStore(connection);
      const before = await countOf(connection, "adult_offer_visit", "youtube");

      await store.recordVisit("youtube");
      await expect(
        store.recordVisit("parent@example.test")
      ).resolves.toBeUndefined();

      expect(await countOf(connection, "adult_offer_visit", "youtube")).toBe(
        before + 1
      );
      expect(
        await countOf(connection, "adult_offer_visit", "parent@example.test")
      ).toBe(0);
    });
  });

  it("US-01.1 keeps four open transactions from dropping a count on one key", async () => {
    // Each connection stays in its own open transaction, as the write that
    // fires a bump does. Before migration 0034 the second bump waited for the
    // 200 ms lock timeout and warned.
    const connections = Array.from(
      { length: 4 },
      () => new Client({ connectionString: normalizeDatabaseConnectionString(databaseUrl) })
    );
    /** @type {string[]} */
    const warnings = [];
    /** @type {number[]} */
    const elapsed = [];
    try {
      for (const connection of connections) {
        await connection.connect();
        connection.on("notice", (notice) => warnings.push(String(notice.message)));
        await connection.query("BEGIN");
      }
      for (const connection of connections) {
        const started = performance.now();
        await connection.query("SELECT count_adult_offer_visit('youtube')");
        elapsed.push(performance.now() - started);
      }
    } finally {
      for (const connection of connections) {
        await connection.query("ROLLBACK").catch(() => undefined);
        await connection.end();
      }
    }

    expect(warnings.filter((message) => /funnel count dropped/.test(message))).toEqual([]);
    // Well under the 200 ms lock wait of bump_funnel_count.
    expect(Math.max(...elapsed)).toBeLessThan(150);
  });

  it("US-08.1 denies the runtime a direct counter write", async () => {
    await rolledBack(async (connection) => {
      await connection.query("SAVEPOINT direct_insert");
      await expect(
        connection.query(
          `INSERT INTO funnel_counts (day, metric, campaign, mode, count)
           VALUES (CURRENT_DATE, 'adult_offer_visit', '', '', 1000)`
        )
      ).rejects.toMatchObject({ code: "42501" });
      await connection.query("ROLLBACK TO SAVEPOINT direct_insert");
      await expect(
        connection.query(
          "SELECT bump_funnel_count('adult_offer_visit', '', '')"
        )
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

// The runtime role cannot clear the stamp, so the owner role builds the state
// of an Explorer whose Grant predates migration 0033.
describe.runIf(runIntegration && Boolean(adminDatabaseUrl))(
  "Funnel Counts for an Explorer with an earlier Grant",
  () => {
    beforeAll(() => {
      adminPool = new Pool({
        connectionString: normalizeDatabaseConnectionString(adminDatabaseUrl),
        max: 1
      });
    });

    afterAll(async () => {
      await adminPool?.end();
    });

    it("US-06.2 stamps the earliest Grant and counts no activation", async () => {
      await rolledBack(async (connection) => {
        const playerId = `user_funnel_${randomUUID()}`;
        await connection.query(
          "INSERT INTO player_access (clerk_user_id) VALUES ($1)",
          [playerId]
        );
        await insertGrant(connection, playerId, "funnel-legacy-1");
        await connection.query(
          `UPDATE player_access SET first_run_grant_at = NULL
           WHERE clerk_user_id = $1`,
          [playerId]
        );
        const before = await countOf(connection, "personal_run_activated");

        await insertGrant(connection, playerId, "funnel-legacy-2");

        expect(await countOf(connection, "personal_run_activated")).toBe(
          before
        );
        const access = await connection.query(
          `SELECT first_run_grant_at = (
             SELECT min(created_at) FROM run_access_grants WHERE player_id = $1
           ) AS earliest
           FROM player_access WHERE clerk_user_id = $1`,
          [playerId]
        );
        expect(access.rows[0]?.earliest).toBe(true);
      }, adminPool);
    });
  }
);

// Only the definer functions write funnel_counts for the runtime role, so the
// owner role seeds the rows of the report test.
describe.runIf(runIntegration && Boolean(adminDatabaseUrl))(
  "Funnel report on PostgreSQL",
  () => {
    beforeAll(() => {
      adminPool = new Pool({
        connectionString: normalizeDatabaseConnectionString(adminDatabaseUrl),
        max: 1
      });
    });

    afterAll(async () => {
      await adminPool?.end();
    });

    it("US-10.1 buckets stored rows by UTC day with both range ends included", async () => {
      await rolledBack(async (connection) => {
        // A non-UTC session zone proves the report buckets by UTC day. Under a
        // zone bug, _start leaves the range (1 cent lost), _after enters it
        // (2 cents added), _end gains a refund in range, and _old_dispute
        // loses its dispute.
        await connection.query("SET LOCAL TIME ZONE 'America/Los_Angeles'");
        await connection.query(
          `INSERT INTO funnel_counts (day, metric, campaign, mode, count) VALUES
             ('1999-12-31', 'adult_offer_visit', '', '', 5),
             ('2000-01-01', 'adult_offer_visit', 'youtube', '', 2),
             ('2000-01-01', 'checkout_created', '', 'live', 3),
             ('2000-01-01', 'checkout_created', '', 'test', 7),
             ('2000-01-02', 'account_created', '', '', 4),
             ('2000-01-03', 'account_created', '', '', 9)`
        );
        // A second shard of an existing key: the report sums it (4 + 3 = 7).
        await connection.query(
          `INSERT INTO funnel_counts (day, metric, campaign, mode, shard, count)
           VALUES ('2000-01-02', 'account_created', '', '', 3, 3)`
        );
        const id = randomUUID();
        await connection.query(
          `INSERT INTO financial_facts (
             payment_intent_id, billing_mode, amount_cents, currency, status,
             refunded_cents, paid_at, refunded_at, disputed_at
           ) VALUES
             ($1 || '_start', 'live', 599, 'usd', 'paid', 1, '2000-01-01 00:00:00+00', NULL, NULL),
             ($1 || '_end', 'live', 599, 'usd', 'refunded', 599, '2000-01-02 23:59:59+00',
              '2000-01-03 00:00:00+00', NULL),
             ($1 || '_late_refund', 'live', 599, 'usd', 'refunded', 599, '1999-12-31 23:59:59+00',
              '2000-01-02 23:59:59+00', NULL),
             ($1 || '_disputed', 'live', 599, 'usd', 'disputed', 0, '2000-01-02 12:00:00+00',
              NULL, '2000-01-02 13:00:00+00'),
             ($1 || '_old_dispute', 'live', 599, 'usd', 'disputed', 0, '1999-12-30 12:00:00+00',
              NULL, '2000-01-01 00:00:00+00'),
             ($1 || '_before', 'live', 599, 'usd', 'paid', 4, '1999-12-31 23:59:59+00', NULL, NULL),
             ($1 || '_after', 'live', 599, 'usd', 'paid', 2, '2000-01-03 00:00:00+00', NULL, NULL),
             ($1 || '_test', 'test', 599, 'usd', 'paid', 0, '2000-01-01 12:00:00+00', NULL, NULL)`,
          [`pi_funnel_${id}`]
        );

        const report = await createFunnelStore(connection).report({
          from: "2000-01-01",
          to: "2000-01-02",
          mode: "live"
        });

        expect(report).toEqual({
          counts: [
            { day: "2000-01-01", metric: "adult_offer_visit", campaign: "youtube", count: 2 },
            { day: "2000-01-01", metric: "checkout_created", campaign: "", count: 3 },
            { day: "2000-01-02", metric: "account_created", campaign: "", count: 7 }
          ],
          summary: {
            grossPurchases: 3,
            netPurchases: 1,
            refundedCount: 1,
            disputedCount: 2,
            refundedCents: 600
          }
        });
      }, adminPool);
    });
  }
);
