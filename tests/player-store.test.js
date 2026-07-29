import { createPlayerStore } from "../server/player-store.js";
import { describe, expect, it, vi } from "vitest";

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
    query,
    clientQuery,
    connect: vi.fn(async () => ({
      query: clientQuery,
      release: vi.fn()
    }))
  };
}

describe("player store", () => {
  it("maps a stored Player Profile without leaking the Clerk id", async () => {
    const pool = tenantPool(
      vi.fn().mockResolvedValue({
        rows: [
          {
            username: "Moss Runner",
            explorer_palette: "sunset",
            playground_palette: "twilight"
          }
        ]
      })
    );
    const store = createPlayerStore(pool);

    await expect(store.getProfile("user_123")).resolves.toEqual({
      username: "Moss Runner",
      explorerPalette: "sunset",
      playgroundPalette: "twilight"
    });
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ["user_123"]);
  });

  it("upserts a Player Profile using the normalized username key", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            username: "Moss Runner",
            explorer_palette: "sunset",
            playground_palette: "twilight"
          }
        ]
      })
    };
    const store = createPlayerStore(pool);

    await store.saveProfile("user_123", {
      username: "Moss Runner",
      usernameKey: "moss runner",
      explorerPalette: "sunset",
      playgroundPalette: "twilight"
    });

    expect(pool.query.mock.calls[0][1]).toEqual([
      "user_123",
      "Moss Runner",
      "moss runner",
      "sunset",
      "twilight",
      expect.stringMatching(/^[a-f0-9]{64}$/)
    ]);
    expect(pool.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(pool.query.mock.calls[0][0]).toContain(
      "deleted_user_tombstones"
    );
  });

  it("returns one ranked best escaped run per player", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            rank: "1",
            username: "Bright Fox",
            score: 1200,
            level_id: "pathfinder",
            labyrinth_number: 5,
            moves: 77,
            elapsed_ms: 88000
          }
        ]
      })
    };
    const store = createPlayerStore(pool);

    await expect(store.getLeaderboard({
      atlasRegionId: "capable",
      rulesetRevision: "echo-bridges-v1"
    })).resolves.toEqual({
      entries: [
        {
          rank: 1,
          username: "Bright Fox",
          score: 1200,
          levelId: "pathfinder",
          labyrinthNumber: 5,
          moves: 77,
          elapsedMs: 88000
        }
      ],
      globalMaxScore: 1200
    });
    expect(pool.query.mock.calls[0][0]).toContain("ROW_NUMBER()");
    expect(pool.query.mock.calls[0][0]).toContain("player_id");
    expect(pool.query.mock.calls[0][0]).toContain("classroom_id IS NULL");
    expect(pool.query.mock.calls[0][0]).toContain("atlas_region_id = $1");
    expect(pool.query.mock.calls[0][0]).toContain("ruleset_revision = $2");
    expect(pool.query.mock.calls[0][1]).toEqual([
      "capable",
      "echo-bridges-v1"
    ]);
    expect(pool.query.mock.calls[0][0]).toContain(
      "best_runs.created_at ASC\n           ) AS rank"
    );
    expect(pool.query.mock.calls[0][0]).toContain("LIMIT 10");
  });

  it("inserts an idempotent score and reports whether it was new", async () => {
    const query = vi.fn().mockResolvedValue({
        rows: [
          {
            inserted: true,
            username: "Moss Runner",
            score: 900,
            level_id: "trail-scout",
            labyrinth_number: 4,
            moves: 81,
            elapsed_ms: 92000
          }
        ]
      });
    const pool = tenantPool(query);
    const store = createPlayerStore(pool);

    await expect(
      store.submitScore("user_123", {
        idempotencyKey: "run_01J1MOSSWATCH",
        levelId: "trail-scout",
        labyrinthNumber: 4,
        seed: "MOSS-WATCH-11",
        wardensDefeated: 3,
        echoesCollected: 2,
        moves: 81,
        elapsedMs: 92000,
        escaped: true,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1",
        score: 900
      })
    ).resolves.toMatchObject({
      duplicate: false,
      entry: {
        username: "Moss Runner",
        score: 900
      }
    });
    expect(query.mock.calls[0][1]).toEqual([
      "user_123",
      "run_01J1MOSSWATCH",
      "trail-scout",
      4,
      "MOSS-WATCH-11",
      3,
      2,
      81,
      92000,
      900,
      null,
      "foundation",
      "echo-hush-v1"
    ]);
    expect(query.mock.calls[0][0]).toContain(
      "ON CONFLICT (player_id, classroom_id, idempotency_key) DO UPDATE"
    );
    expect(query.mock.calls[0][0]).toContain("(xmax = 0) AS inserted");
  });

  it("writes a Class Play Score only inside synchronized tenant context", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "student" }] })
      .mockResolvedValueOnce({
        rows: [{
          inserted: true,
          username: "Moss Runner",
          score: 900,
          level_id: "trail-scout",
          labyrinth_number: 4,
          moves: 81,
          elapsed_ms: 92000
        }]
      });
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
    const pool = {
      query,
      clientQuery,
      connect: vi.fn(async () => ({
        query: clientQuery,
        release: vi.fn()
      }))
    };

    await createPlayerStore(pool).submitScore(
      "user_123",
      {
        idempotencyKey: "run_01J1MOSSWATCH",
        levelId: "trail-scout",
        labyrinthNumber: 4,
        seed: "MOSS-WATCH-11",
        wardensDefeated: 3,
        echoesCollected: 2,
        moves: 81,
        elapsedMs: 92000,
        escaped: true,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1",
        score: 900
      },
      "org_morning_123"
    );

    expect(clientQuery.mock.calls[1]).toEqual([
      expect.stringContaining("set_config"),
      ["user_123", "org_morning_123"]
    ]);
    expect(query.mock.calls[0][0]).toContain("FROM classroom_memberships");
    expect(query.mock.calls[1][0]).toContain("classroom_id");
    expect(query.mock.calls[1][1][10]).toBe("org_morning_123");
  });
});
