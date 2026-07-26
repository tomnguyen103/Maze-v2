import { createServer } from "node:http";
import { createRunAccessHandler } from "../server/run-access-route.js";
import { describe, expect, it, vi } from "vitest";

/**
 * @param {(
 *   request: import("node:http").IncomingMessage,
 *   response: import("node:http").ServerResponse,
 *   next: (() => void) | undefined
 * ) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) =>
    handler(request, response, undefined)
  );
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

describe("Run Access API", () => {
  it("publishes the server rollback state without authentication", async () => {
    const handler = createRunAccessHandler({
      store: {
        getAccess: vi.fn(),
        authorizeRun: vi.fn()
      },
      getUserId: () => null,
      enforcementEnabled: false
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ enforcementEnabled: false });
    });
  });

  it("requires an authenticated Clerk user", async () => {
    const handler = createRunAccessHandler({
      store: {
        getAccess: vi.fn(),
        authorizeRun: vi.fn()
      },
      getUserId: () => null,
      enforcementEnabled: true
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/runs`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(401);
    });
  });

  it("validates a stable client-created Run id", async () => {
    const authorizeRun = vi.fn();
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun },
      getUserId: () => "user_123",
      enforcementEnabled: true
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "not valid spaces",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(400);
      expect(authorizeRun).not.toHaveBeenCalled();
    });
  });

  it("returns canonical admission state and keeps retries idempotent", async () => {
    const recordEvent = vi.fn();
    const authorizeRun = vi.fn(async () => ({
      allowed: true,
      duplicate: true,
      freeRunsRemaining: 2,
      state: "free"
    }));
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun },
      getUserId: () => "user_123",
      enforcementEnabled: true,
      recordEvent
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        allowed: true,
        duplicate: true,
        freeRunsRemaining: 2,
        state: "free",
        enforcementEnabled: true
      });
      expect(authorizeRun).toHaveBeenCalledWith("user_123", {
        runId: "access_01J1MOSSWATCH",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      });
      expect(recordEvent).toHaveBeenCalledWith("run_access_decision", {
        accessState: "free",
        duplicate: true,
        enforcementEnabled: true,
        outcome: "admitted"
      });
    });
  });

  it("supports a production rollback flag without consuming a grant", async () => {
    const authorizeRun = vi.fn();
    const handler = createRunAccessHandler({
      store: {
        getAccess: vi.fn(async () => ({
          freeRunsRemaining: 1,
          state: "free"
        })),
        authorizeRun
      },
      getUserId: () => "user_123",
      enforcementEnabled: false
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "access_rollback",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(await response.json()).toMatchObject({
        allowed: true,
        enforcementEnabled: false,
        state: "free"
      });
      expect(authorizeRun).not.toHaveBeenCalled();
    });
  });

  it("rejects one id reused for different Run facts", async () => {
    const error = new Error(
      "That Run id is already bound to a different Labyrinth."
    );
    error.name = "RunAccessConflictError";
    const handler = createRunAccessHandler({
      store: {
        getAccess: vi.fn(),
        authorizeRun: vi.fn(async () => {
          throw error;
        })
      },
      getUserId: () => "user_123",
      enforcementEnabled: true
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "access_existing",
          seed: "DIFFERENT-SEED",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(409);
    });
  });
});
