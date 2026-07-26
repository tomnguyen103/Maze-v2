import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createQuestProgressHandler } from "../server/quest-progress-route.js";
import { createQuestProgress } from "../src/game/quest-progress.js";

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void | Promise<void>} handler
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

function createStore() {
  return {
    /** @type {any} */
    record: null,
    async get() {
      return this.record;
    },
    /**
     * @param {string} _userId
     * @param {number} expectedRevision
     * @param {any} progress
     */
    async save(_userId, expectedRevision, progress) {
      this.record = {
        progress,
        revision: expectedRevision + 1,
        updatedAt: "2026-07-26T00:00:00.000Z"
      };
      return { record: this.record, conflict: false, duplicate: false };
    }
  };
}

describe("Cloud Quest API", () => {
  it("requires authentication and never accepts another user id", async () => {
    const handler = createQuestProgressHandler({
      store: createStore(),
      getUserId: () => null
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/quest-progress`);
      expect(response.status).toBe(401);
    });
  });

  it("creates and reads one authenticated boundary record", async () => {
    const store = createStore();
    const handler = createQuestProgressHandler({
      store,
      getUserId: () => "user_123"
    });
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_route_123"
    );

    await withServer(handler, async (origin) => {
      const saved = await fetch(`${origin}/api/quest-progress`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, progress })
      });
      expect(saved.status).toBe(201);
      await expect(saved.json()).resolves.toMatchObject({
        record: { progress, revision: 1 }
      });

      const loaded = await fetch(`${origin}/api/quest-progress`);
      await expect(loaded.json()).resolves.toMatchObject({
        record: { progress, revision: 1 }
      });
    });
  });

  it("returns the current record on an optimistic conflict", async () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_route_123"
    );
    const record = {
      progress,
      revision: 4,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const handler = createQuestProgressHandler({
      store: {
        async get() {
          return record;
        },
        async save() {
          return { record, conflict: true, duplicate: false };
        }
      },
      getUserId: () => "user_123"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/quest-progress`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 2, progress })
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        record: { revision: 4 }
      });
    });
  });
});
