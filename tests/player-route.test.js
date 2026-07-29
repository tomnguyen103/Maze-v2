import { createServer } from "node:http";
import { createPlayerApiHandler } from "../server/player-route.js";
import { describe, expect, it, vi } from "vitest";

const PROFILE = {
  username: "Moss Runner",
  explorerPalette: "sunset",
  playgroundPalette: "twilight"
};

function createStore() {
  return {
    profiles: new Map(),
    /** @type {Record<string, unknown> | null} */
    submittedRun: null,
    /** @type {Record<string, string> | null} */
    requestedPartition: null,
    /** @param {string} userId */
    async getProfile(userId) {
      return this.profiles.get(userId) ?? null;
    },
    /**
     * @param {string} userId
     * @param {Record<string, unknown>} profile
     */
    async saveProfile(userId, profile) {
      const saved = { ...profile, userId };
      this.profiles.set(userId, saved);
      return saved;
    },
    /** @param {Record<string, string>} partition */
    async getLeaderboard(partition) {
      this.requestedPartition = partition;
      return {
        entries: [
          {
            rank: 1,
            username: "Bright Fox",
            score: 1200,
            labyrinthNumber: 5,
            moves: 77,
            elapsedMs: 88000
          }
        ],
        globalMaxScore: 1200
      };
    },
    /**
     * @param {string} userId
     * @param {Record<string, unknown>} run
     * @param {string | null} [classroomId]
     */
    async submitScore(userId, run, classroomId = null) {
      this.submittedRun = { ...run, userId, classroomId };
      return {
        entry: { username: "Moss Runner", ...run },
        duplicate: false
      };
    }
  };
}

/**
 * @param {(
 *   request: import("node:http").IncomingMessage,
 *   response: import("node:http").ServerResponse,
 *   next?: () => void
 * ) => void | Promise<void>} handler
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

describe("player API", () => {
  it("keeps the leaderboard public without exposing identity ids", async () => {
    const store = createStore();
    const handler = createPlayerApiHandler({
      store,
      getUserId: () => null
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(
        `${origin}/api/leaderboard?region=capable&rules=echo-bridges-v1`
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.globalMaxScore).toBe(1200);
      expect(body.verification).toBe("casual-v1");
      expect(body.partition).toEqual({
        atlasRegionId: "capable",
        rulesetRevision: "echo-bridges-v1"
      });
      expect(store.requestedPartition).toEqual({
        atlasRegionId: "capable",
        rulesetRevision: "echo-bridges-v1"
      });
      expect(body.entries[0]).not.toHaveProperty("userId");
    });
  });

  it("requires authentication for profile access", async () => {
    const handler = createPlayerApiHandler({
      store: createStore(),
      getUserId: () => null
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/profile`);
      expect(response.status).toBe(401);
    });
  });

  it("does not log raw player-service error details", async () => {
    const store = createStore();
    store.getLeaderboard = async () => {
      const error = new Error(
        "postgres://child-name:secret@private-host/database"
      );
      error.name = "secret-database-error";
      throw error;
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createPlayerApiHandler({
      store,
      getUserId: () => null
    });

    try {
      await withServer(handler, async (origin) => {
        const response = await fetch(
          `${origin}/api/leaderboard?region=foundation&rules=classic-v1`
        );

        expect(response.status).toBe(500);
        expect(errorLog).toHaveBeenCalledWith(
          "[players] API request failed",
          { name: "Error" }
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
          "child-name"
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
          "secret"
        );
      });
    } finally {
      errorLog.mockRestore();
    }
  });

  it("creates and reads the authenticated player's profile", async () => {
    const store = createStore();
    const handler = createPlayerApiHandler({
      store,
      getUserId: (request) => {
        const header = request.headers["x-test-user"];
        return typeof header === "string" ? header : null;
      }
    });

    await withServer(handler, async (origin) => {
      const saved = await fetch(`${origin}/api/profile`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-user": "user_123"
        },
        body: JSON.stringify(PROFILE)
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ profile: PROFILE });

      const read = await fetch(`${origin}/api/profile`, {
        headers: { "x-test-user": "user_123" }
      });
      expect(await read.json()).toMatchObject({ profile: PROFILE });
    });
  });

  it("submits a bounded escaped run with a server-computed score", async () => {
    const store = createStore();
    store.profiles.set("user_123", { ...PROFILE, userId: "user_123" });
    const handler = createPlayerApiHandler({
      store,
      getUserId: (request) => {
        const header = request.headers["x-test-user"];
        return typeof header === "string" ? header : null;
      }
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/scores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user": "user_123"
        },
        body: JSON.stringify({
          idempotencyKey: "run_01J1MOSSWATCH",
          levelId: "trail-scout",
          labyrinthNumber: 4,
          seed: "MOSS-WATCH-11",
          wardensDefeated: 2,
          echoesCollected: 3,
          moves: 81,
          elapsedMs: 92000,
          escaped: true,
          atlasRegionId: "foundation",
          rulesetRevision: "echo-hush-v1",
          score: 999999
        })
      });

      expect(response.status).toBe(201);
      expect((await response.json()).verification).toBe("casual-v1");
      expect(store.submittedRun).toMatchObject({
        userId: "user_123",
        classroomId: null,
        score: 850
        ,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1"
      });
    });
  });

  it("binds a Class Play Score to the selected Classroom", async () => {
    const store = createStore();
    store.profiles.set("user_123", { ...PROFILE, userId: "user_123" });
    const handler = createPlayerApiHandler({
      store,
      getUserId: () => "user_123"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/scores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-echo-maze-classroom-id": "org_morning_123"
        },
        body: JSON.stringify({
          idempotencyKey: "run_01J1MOSSWATCH",
          levelId: "trail-scout",
          labyrinthNumber: 4,
          seed: "MOSS-WATCH-11",
          wardensDefeated: 2,
          echoesCollected: 3,
          moves: 81,
          elapsedMs: 92000,
          escaped: true,
          atlasRegionId: "foundation",
          rulesetRevision: "echo-hush-v1"
        })
      });
      expect(response.status).toBe(201);
    });

    expect(store.submittedRun).toMatchObject({
      userId: "user_123",
      classroomId: "org_morning_123"
    });
  });
});
