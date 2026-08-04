import { createServer } from "node:http";
import { createRunAccessHandler } from "../server/run-access-route.js";
import { RunAccessConflictError } from "../server/run-access-store.js";
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
      expect(await response.json()).toEqual({
        enforcementEnabled: false,
        guestDemoEnforcementEnabled: false
      });
    });
  });

  it("admits a guest through the hashed-address store without Clerk auth", async () => {
    const authorizeGuestRun = vi.fn(async () => ({
      allowed: true,
      duplicate: false,
      freeRunsRemaining: 0,
      state: "guest-demo"
    }));
    const getUserId = vi.fn();
    const recordAudit = vi.fn();
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
      guestStore: { authorizeGuestRun },
      addressHashFor: () => "a".repeat(64),
      getUserId,
      recordAudit,
      guestDemoEnforcementEnabled: true
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/guest-runs`, {
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
      expect(await response.json()).toMatchObject({
        allowed: true,
        guestDemoEnforcementEnabled: true
      });
      expect(authorizeGuestRun).toHaveBeenCalledWith(
        "a".repeat(64),
        {
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        }
      );
      expect(getUserId).not.toHaveBeenCalled();
      expect(recordAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "guest_run_access.decision",
          resource: { type: "guest_run_access" }
        })
      );
    });
  });

  it("throttles guest Run bursts before opening a database transaction", async () => {
    const authorizeGuestRun = vi.fn();
    const admittedGuestRun = vi.fn(async () => null);
    const rateLimit = vi.fn(async () => ({
      allowed: false,
      degraded: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 30
    }));
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
      guestStore: { authorizeGuestRun, admittedGuestRun },
      addressHashFor: () => "a".repeat(64),
      getUserId: () => null,
      guestDemoEnforcementEnabled: true,
      rateLimit
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/guest-runs`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("30");
      expect(rateLimit).toHaveBeenCalledWith(
        "guest-run.start",
        expect.anything(),
        null
      );
      expect(authorizeGuestRun).not.toHaveBeenCalled();
      expect(admittedGuestRun).toHaveBeenCalledWith(
        "a".repeat(64),
        expect.objectContaining({ runId: "access_01J1MOSSWATCH" })
      );
    });
  });

  it("preserves an admitted Run retry after the request budget is spent", async () => {
    const authorizeGuestRun = vi.fn();
    const admittedGuestRun = vi.fn(async () => ({
      allowed: true,
      duplicate: true,
      freeRunsRemaining: 0,
      state: "guest-demo"
    }));
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
      guestStore: { authorizeGuestRun, admittedGuestRun },
      addressHashFor: () => "a".repeat(64),
      getUserId: () => null,
      guestDemoEnforcementEnabled: true,
      rateLimit: async () => ({
        allowed: false,
        degraded: false,
        limit: 20,
        remaining: 0,
        retryAfterSeconds: 30
      })
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/guest-runs`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        allowed: true,
        duplicate: true,
        metered: true
      });
      expect(authorizeGuestRun).not.toHaveBeenCalled();
    });
  });

  it("fails open when durable guest enforcement is unavailable", async () => {
    const recordEvent = vi.fn();
    const authorizeGuestRun = vi.fn(async () => {
      throw new Error("database down");
    });
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
      guestStore: { authorizeGuestRun },
      addressHashFor: () => "a".repeat(64),
      getUserId: () => null,
      guestDemoEnforcementEnabled: true,
      recordAudit: vi.fn(),
      recordEvent
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/guest-runs`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        allowed: true,
        degraded: true,
        metered: false
      });
      expect(recordEvent).toHaveBeenCalledWith(
        "guest_demo_access_decision",
        expect.objectContaining({ outcome: "degraded" })
      );
    });
  });

  it("fails open without persisting anything when no address can be hashed", async () => {
    const authorizeGuestRun = vi.fn();
    const handler = createRunAccessHandler({
      store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
      guestStore: { authorizeGuestRun },
      addressHashFor: () => null,
      getUserId: () => null,
      guestDemoEnforcementEnabled: true
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/guest-runs`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      });
      expect(await response.json()).toMatchObject({
        allowed: true,
        metered: false
      });
      expect(authorizeGuestRun).not.toHaveBeenCalled();
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
    // The real class, not a look-alike: the route classifies on the class the
    // store exports, so a hand-rolled error with a matching `name` would pass
    // a test the production path does not exercise.
    const error = new RunAccessConflictError();
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
