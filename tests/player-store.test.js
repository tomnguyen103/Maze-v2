import { createPlayerStore } from "../server/player-store.js";
import { describe, expect, it, vi } from "vitest";

describe("player store", () => {
  it("maps a stored Player Profile without leaking the Clerk id", async () => {
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
      "twilight"
    ]);
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

    await expect(store.getLeaderboard()).resolves.toEqual({
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
    expect(pool.query.mock.calls[0][0]).toContain(
      "best_runs.created_at ASC\n           ) AS rank"
    );
    expect(pool.query.mock.calls[0][0]).toContain("LIMIT 10");
  });

  it("inserts an idempotent score and reports whether it was new", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
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
      })
    };
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
        score: 900
      })
    ).resolves.toMatchObject({
      duplicate: false,
      entry: {
        username: "Moss Runner",
        score: 900
      }
    });
    expect(pool.query.mock.calls[0][1]).toEqual([
      "user_123",
      "run_01J1MOSSWATCH",
      "trail-scout",
      4,
      "MOSS-WATCH-11",
      3,
      2,
      81,
      92000,
      900
    ]);
    expect(pool.query.mock.calls[0][0]).toContain(
      "ON CONFLICT (player_id, idempotency_key) DO UPDATE"
    );
    expect(pool.query.mock.calls[0][0]).toContain("(xmax = 0) AS inserted");
  });
});
