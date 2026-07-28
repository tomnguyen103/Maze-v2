import { createServer } from "node:http";
import { createPlayerApi } from "../server/player-api.js";
import { describe, expect, it } from "vitest";

/**
 * @param {ReturnType<typeof createPlayerApi>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) =>
    handler(request, response)
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

describe("composed player API", () => {
  it("keeps enforcement disabled when payment recovery is unavailable", async () => {
    const handler = createPlayerApi({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo",
      RUN_ACCESS_ENFORCEMENT_ENABLED: "true"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        enforcementEnabled: false,
        guestDemoEnforcementEnabled: true
      });
    });
  });

  it("returns the public rollback state when the database is absent", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        enforcementEnabled: false,
        guestDemoEnforcementEnabled: false
      });
    });
  });

  it("keeps guest play fail-open when the database is absent", async () => {
    const handler = createPlayerApi({});
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
        guestDemoEnforcementEnabled: false,
        metered: false
      });
    });
  });

  it("fails lifetime purchase requests closed when services are absent", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "Player services are not configured. Guest play still works."
      });
    });
  });

  it("keeps Cloud Quest storage optional without blocking local play", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/quest-progress`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Guest play still works/i)
      });
    });
  });

  it("answers liveness in every configuration and echoes a request id", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/health`, {
        headers: { "x-request-id": "req_health_1" }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("req_health_1");
      expect(await response.json()).toEqual({ status: "ok", version: "dev" });
    });
  });

  it("generates a request id when the caller sends none", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/health`);
      expect(response.headers.get("x-request-id")).toMatch(
        /^[A-Za-z0-9_.:-]{1,200}$/
      );
    });
  });

  it("reports unreadiness with per-check detail when nothing is configured", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/ready`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "unavailable",
        version: "dev",
        checks: {
          database: "unconfigured",
          stripe: "unconfigured",
          clerk: "unconfigured"
        }
      });
    });
  });

  it("marks an unreachable database as failed readiness with the database configured", async () => {
    const handler = createPlayerApi({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/ready`);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.checks.database).toBe("failed");
      expect(body.checks.clerk).toBe("ok");
    });
  });

  it("requires sign-in for a data export when Clerk is absent", async () => {
    const handler = createPlayerApi({
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/export`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Sign in to continue."
      });
    });
  });

  it("requires sign-in for synced Access Settings when Clerk is absent", async () => {
    const handler = createPlayerApi({
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/settings`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Sign in to continue."
      });
    });
  });

  it("keeps the data export closed without storage", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/export`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Guest play still works/i)
      });
    });
  });

  it("keeps synced Access Settings closed without storage", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/settings`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Guest play still works/i)
      });
    });
  });

  it("fails Clerk account-deletion webhooks closed without storage", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/clerk-webhook`, {
        method: "POST",
        body: "{}"
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Guest play still works/i)
      });
    });
  });
});
