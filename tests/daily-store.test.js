import { describe, expect, it, vi } from "vitest";
import { createDailyStore } from "../server/daily-store.js";

const STORED_ENTRY = {
  rank: "1",
  username: "Moss Runner",
  daily_date: "2026-07-26",
  score: 900,
  moves: 76,
  elapsed_ms: 7600,
  achieved_at: "2026-07-26T12:30:00.000Z",
  player_id: "user_private"
};

/**
 * @param {(
 *   sql: string,
 *   values?: unknown[]
 * ) => Promise<{ rows: Record<string, unknown>[] }>} query
 */
function tenantPool(query) {
  const clientQuery = vi.fn(async (sql, values) => {
    if (
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK" ||
      sql.includes("set_config")
    ) {
      return { rows: [] };
    }
    return query(sql, values);
  });
  return {
    query: vi.fn(query),
    clientQuery,
    connect: vi.fn(async () => ({
      query: clientQuery,
      release: vi.fn()
    }))
  };
}

const VERIFIED = {
  idempotencyKey: "daily_01J1MOSSWATCH",
  date: "2026-07-26",
  dailyVersion: 1,
  score: 900,
  wardensDefeated: 2,
  echoesCollected: 4,
  moves: 76,
  elapsedMs: 7600
};

describe("Verified Daily store", () => {
  it("returns a private-key-stable bounded public ranking", async () => {
    const pool = tenantPool(async () => ({ rows: [STORED_ENTRY] }));
    const store = createDailyStore(pool);

    await expect(store.getLeaderboard("2026-07-26")).resolves.toEqual([
      {
        rank: 1,
        username: "Moss Runner",
        score: 900,
        moves: 76
      }
    ]);
    const [sql, values] = pool.query.mock.calls[0];
    expect(values).toEqual(["2026-07-26", 10]);
    expect(sql).toContain("score DESC");
    expect(sql).toContain("moves ASC");
    expect(sql).toContain("achieved_at ASC");
    expect(sql).toContain("player_id ASC");
    expect(sql).toContain("LIMIT $2");
  });

  it("records an idempotency key and promotes a new best entry atomically", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...STORED_ENTRY, rank: undefined }] });
    const pool = tenantPool(query);

    await expect(
      createDailyStore(pool).submitVerifiedEntry("user_123", VERIFIED)
    ).resolves.toEqual({
      duplicate: false,
      improved: true,
      bestResult: "created",
      entry: {
        username: "Moss Runner",
        score: 900,
        moves: 76
      }
    });

    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[1][0]).toContain(
      "FROM verified_daily_submissions"
    );
    expect(query.mock.calls[2][0]).toContain(
      "FROM verified_daily_entries"
    );
    expect(query.mock.calls[2][0]).toContain("FOR UPDATE");
    expect(query.mock.calls[3][0]).toContain(
      "INSERT INTO verified_daily_submissions"
    );
    expect(query.mock.calls[3][1]).toEqual([
      "user_123",
      "2026-07-26",
      "daily_01J1MOSSWATCH",
      1,
      900,
      2,
      4,
      76,
      7600,
      "created",
      900,
      76
    ]);
    expect(query.mock.calls[4][0]).toContain(
      "INSERT INTO verified_daily_entries"
    );
    expect(query.mock.calls[4][0]).toContain(
      "EXCLUDED.score > verified_daily_entries.score"
    );
  });

  it("distinguishes an improved best from a newly created entry", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...STORED_ENTRY, score: 800, moves: 80 }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...STORED_ENTRY, rank: undefined }] });

    await expect(
      createDailyStore(tenantPool(query)).submitVerifiedEntry(
        "user_123",
        VERIFIED
      )
    ).resolves.toMatchObject({
      duplicate: false,
      improved: true,
      bestResult: "improved"
    });
  });

  it("returns the original response for a duplicate after later improvements", async () => {
    const duplicateQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          username: "Moss Runner",
          score: 900,
          moves: 76,
          best_result: "created"
        }]
      });
    await expect(
      createDailyStore(tenantPool(duplicateQuery)).submitVerifiedEntry(
        "user_123",
        VERIFIED
      )
    ).resolves.toMatchObject({
      duplicate: true,
      improved: false,
      bestResult: "created",
      entry: { score: 900, moves: 76 }
    });
    expect(duplicateQuery).toHaveBeenCalledTimes(2);
  });

  it("returns the current best without rewriting a worse new submission", async () => {
    const worseQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STORED_ENTRY] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      createDailyStore(tenantPool(worseQuery)).submitVerifiedEntry(
        "user_123",
        { ...VERIFIED, idempotencyKey: "daily_01J1WORSEPATH", moves: 90 }
      )
    ).resolves.toMatchObject({
      duplicate: false,
      improved: false,
      bestResult: "unchanged"
    });
    expect(worseQuery).toHaveBeenCalledTimes(4);
    expect(worseQuery.mock.calls[3][0]).toContain(
      "INSERT INTO verified_daily_submissions"
    );
    expect(worseQuery.mock.calls[3][1]).toEqual(
      expect.arrayContaining(["unchanged", 900, 76])
    );
  });
});
