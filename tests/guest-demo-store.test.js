import { describe, expect, it } from "vitest";
import { createGuestDemoStore } from "../server/guest-demo-store.js";

/** @param {{ rows?: Record<string, unknown>[], error?: Error }[]} responses */
function poolWith(responses) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const queries = [];
  let index = 0;
  const client = {
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      const next = responses[index] ?? { rows: [] };
      index += 1;
      if (next.error) {
        throw next.error;
      }
      return { rows: next.rows ?? [] };
    },
    release() {}
  };
  return {
    queries,
    async connect() {
      return client;
    }
  };
}

const addressHash = "a".repeat(64);
const run = {
  runId: "access_01J1MOSSWATCH",
  seed: "MOSS-WATCH-11",
  levelId: "trail-scout",
  labyrinthNumber: 4
};

describe("guest demo store", () => {
  it("admits the first unique Run and stores only opaque hashes", async () => {
    const pool = poolWith([
      {},
      { rows: [] },
      { rows: [{ count: 0 }] },
      { rows: [] },
      { rows: [] },
      {},
      {},
      {}
    ]);
    const store = createGuestDemoStore(pool, {
      today: () => "2026-07-27"
    });
    await expect(
      store.authorizeGuestRun(addressHash, run)
    ).resolves.toEqual({
      allowed: true,
      duplicate: false,
      freeRunsRemaining: 0,
      state: "guest-demo"
    });
    expect(pool.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "INSERT",
      "SELECT",
      "UPDATE",
      "SELECT",
      "UPDATE",
      "INSERT",
      "COMMIT"
    ]);
    const stored = JSON.stringify(pool.queries);
    expect(stored).not.toContain("127.0.0.1");
    expect(stored).not.toContain("access_01J1MOSSWATCH");
    expect(stored).not.toContain("seed-guest-demo");
    expect(stored).not.toContain("easy-1");
    expect(stored).toContain(addressHash);
    expect(pool.queries[1].sql).toContain("ON CONFLICT (key) DO NOTHING");
    expect(pool.queries[2].sql).toContain("FOR UPDATE");
    expect(pool.queries[3].sql).toContain("window_start < $2");
  });

  it("blocks a second unique Run in the same daily address bucket", async () => {
    const pool = poolWith([
      {},
      { rows: [] },
      { rows: [{ count: 1 }] },
      { rows: [] },
      { rows: [] },
      {},
      {}
    ]);
    const store = createGuestDemoStore(pool, {
      today: () => "2026-07-27"
    });
    await expect(
      store.authorizeGuestRun(addressHash, {
        ...run,
        runId: "access_02SECONDMAZE"
      })
    ).resolves.toMatchObject({
      allowed: false,
      duplicate: false,
      freeRunsRemaining: 0
    });
    const updates = pool.queries.filter(({ sql }) =>
      sql.trim().startsWith("UPDATE")
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.sql).toContain("window_start < $2");
    expect(
      pool.queries.some(({ sql }) => sql.includes("SET count = count + 1"))
    ).toBe(false);
    expect(
      pool.queries.filter(({ sql }) => sql.trim().startsWith("INSERT"))
    ).toHaveLength(1);
    expect(pool.queries[1].sql).toContain("DO NOTHING");
  });

  it("returns the original decision when the same Run retries", async () => {
    const pool = poolWith([
      {},
      {},
      { rows: [{ count: 1 }] },
      { rows: [] },
      { rows: [{ count: 1 }] },
      {}
    ]);
    const store = createGuestDemoStore(pool, {
      today: () => "2026-07-27"
    });
    await expect(
      store.authorizeGuestRun(addressHash, run)
    ).resolves.toMatchObject({ allowed: true, duplicate: true });
    expect(pool.queries).toHaveLength(6);
  });

  it("does not let one admitted Run id authorize changed Run facts", async () => {
    const admittedPool = poolWith([
      {},
      {},
      { rows: [{ count: 0 }] },
      { rows: [] },
      { rows: [] },
      {},
      {},
      {}
    ]);
    const blockedPool = poolWith([
      {},
      {},
      { rows: [{ count: 1 }] },
      { rows: [] },
      { rows: [] },
      {}
    ]);
    await createGuestDemoStore(admittedPool, {
      today: () => "2026-07-27"
    }).authorizeGuestRun(addressHash, run);
    await expect(
      createGuestDemoStore(blockedPool, {
        today: () => "2026-07-27"
      }).authorizeGuestRun(addressHash, {
        ...run,
        seed: "OTHER-SEED-12"
      })
    ).resolves.toMatchObject({ allowed: false, duplicate: false });
    expect(admittedPool.queries[4].values[0]).not.toBe(
      blockedPool.queries[4].values[0]
    );
  });

  it("rolls back a failed decision write", async () => {
    const pool = poolWith([
      {},
      { rows: [] },
      { rows: [{ count: 0 }] },
      { rows: [] },
      { rows: [] },
      {},
      { error: new Error("database down") },
      {}
    ]);
    const store = createGuestDemoStore(pool, {
      today: () => "2026-07-27"
    });
    await expect(
      store.authorizeGuestRun(addressHash, run)
    ).rejects.toThrow("database down");
    expect(pool.queries.at(-1)?.sql).toBe("ROLLBACK");
  });
});
