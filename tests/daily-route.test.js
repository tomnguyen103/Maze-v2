import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createDailyHandler } from "../server/daily-route.js";
import {
  DAILY_REPLAY_FIXTURE,
  DAILY_REPLAY_RESULT,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const IDEMPOTENCY_KEY = "daily_01J1MOSSWATCH";

function submission(overrides = {}) {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    contract: DAILY_REPLAY_FIXTURE,
    actionLog: dailyWinningLog(),
    claimed: {
      status: DAILY_REPLAY_RESULT.status,
      score: DAILY_REPLAY_RESULT.score,
      wardensDefeated: DAILY_REPLAY_RESULT.wardensDefeated,
      echoesCollected: DAILY_REPLAY_RESULT.echoesCollected,
      moves: DAILY_REPLAY_RESULT.moves,
      elapsedMs: DAILY_REPLAY_RESULT.elapsedMs
    },
    ...overrides
  };
}

function createStore() {
  return {
    /** @type {Record<string, unknown> | null} */
    submitted: null,
    async getLeaderboard() {
      return [
        {
          rank: 1,
          username: "Moss Runner",
          score: 900,
          moves: 76,
          playerId: "user_private",
          email: "private@example.test"
        }
      ];
    },
    /** @param {string} userId @param {Record<string, unknown>} entry */
    async submitVerifiedEntry(userId, entry) {
      this.submitted = { userId, ...entry };
      return {
        duplicate: false,
        improved: true,
        entry: {
          username: "Moss Runner",
          score: 900,
          moves: 76,
          playerId: "user_private"
        }
      };
    }
  };
}

/**
 * @param {ReturnType<typeof createDailyHandler>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined))
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not start.");
  }
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    );
  }
}

function handler(store = createStore()) {
  return createDailyHandler({
    store,
    now: () => NOW,
    getUserId: (request) => {
      const value = request.headers["x-test-user"];
      return typeof value === "string" ? value : null;
    },
    getProfile: async (userId) =>
      userId === "user_123" ? { username: "Moss Runner" } : null
  });
}

describe("Verified Daily API", () => {
  it("returns the current public Top-10 without private identity data", async () => {
    await withServer(handler(), async (origin) => {
      const response = await fetch(`${origin}/api/daily/leaderboard`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        date: "2026-07-26",
        contractVersion: 1,
        verification: "verified-replay-v1",
        entries: [
          {
            rank: 1,
            username: "Moss Runner",
            score: 900,
            moves: 76
          }
        ]
      });
    });
  });

  it("replays and persists only the server-derived escaped result", async () => {
    const store = createStore();
    const recordAudit = vi.fn();
    const dailyHandler = createDailyHandler({
      store,
      now: () => NOW,
      getUserId: () => "user_123",
      getProfile: async () => ({ username: "Moss Runner" }),
      recordAudit
    });

    await withServer(dailyHandler, async (origin) => {
      const response = await fetch(`${origin}/api/daily/scores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission())
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        date: "2026-07-26",
        verification: "verified-replay-v1",
        duplicate: false,
        improved: true,
        entry: {
          username: "Moss Runner",
          score: 900,
          moves: 76
        }
      });
    });

    expect(store.submitted).toEqual({
      userId: "user_123",
      idempotencyKey: IDEMPOTENCY_KEY,
      date: "2026-07-26",
      dailyVersion: 1,
      score: 900,
      wardensDefeated: 2,
      echoesCollected: 4,
      moves: 76,
      elapsedMs: 7600
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "user_123",
        action: "daily.score.submit"
      })
    );
  });

  it("keeps reads public but requires identity and a Player Profile for writes", async () => {
    await withServer(handler(), async (origin) => {
      const guest = await fetch(`${origin}/api/daily/scores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission())
      });
      expect(guest.status).toBe(401);

      const noProfile = await fetch(`${origin}/api/daily/scores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user": "user_without_profile"
        },
        body: JSON.stringify(submission())
      });
      expect(noProfile.status).toBe(409);
    });
  });

  it.each([
    [
      "altered seed",
      () =>
        submission({
          contract: { ...DAILY_REPLAY_FIXTURE, seed: "DAILY-FORGED" }
        }),
      409
    ],
    [
      "expired date",
      () =>
        submission({
          contract: {
            ...DAILY_REPLAY_FIXTURE,
            date: "2026-07-25",
            seed: "DAILY-20260725"
          }
        }),
      409
    ],
    [
      "altered score claim",
      () =>
        submission({
          claimed: {
            ...submission().claimed,
            score: DAILY_REPLAY_RESULT.score + 100
          }
        }),
      400
    ],
    [
      "altered terminal claim",
      () =>
        submission({
          claimed: { ...submission().claimed, status: "lost" }
        }),
      400
    ],
    [
      "incomplete replay",
      () =>
        submission({
          actionLog: {
            version: 1,
            actions: dailyWinningLog().actions.slice(0, -1)
          }
        }),
      400
    ]
  ])("rejects %s", async (_name, body, status) => {
    const store = createStore();
    await withServer(handler(store), async (origin) => {
      const response = await fetch(`${origin}/api/daily/scores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user": "user_123"
        },
        body: JSON.stringify(body())
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: expect.any(String)
      });
    });
    expect(store.submitted).toBeNull();
  });

  it("rejects an oversized body before replay", async () => {
    await withServer(handler(), async (origin) => {
      const response = await fetch(`${origin}/api/daily/scores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user": "user_123"
        },
        body: JSON.stringify({
          ...submission(),
          padding: "x".repeat(70 * 1024)
        })
      });
      expect(response.status).toBe(413);
    });
  });
});
