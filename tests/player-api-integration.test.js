import { createServer } from "node:http";
import { createPlayerApi } from "../server/player-api.js";
import {
  LifetimeConfigurationError,
  resolveEnforcementEnabled
} from "../server/lifetime-config.js";
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
  it("refuses to boot the long-running server on a misconfiguration", () => {
    // This used to resolve silently to `enforcementEnabled: false`, and
    // `/api/access/config` then reported a state operators read as an
    // intentional billing-disable. A live `sk_live_` key is exactly that
    // case: it fails the `sk_test_` gate, so switching enforcement on with
    // real credentials switched it off.
    expect(() =>
      resolveEnforcementEnabled({
        RUN_ACCESS_ENFORCEMENT_ENABLED: "true",
        STRIPE_SECRET_KEY: "sk_live_realkey",
        STRIPE_PRICE_ID: "price_1",
        STRIPE_WEBHOOK_SECRET: "whsec_1",
        ECHO_MAZE_APP_ORIGIN: "https://example.test"
      })
    ).toThrow(LifetimeConfigurationError);
  });

  it("says what to fix rather than only that something is wrong", async () => {
    const { ENFORCEMENT_REFUSAL } = await import(
      "../server/lifetime-config.js"
    );
    for (const name of [
      "RUN_ACCESS_ENFORCEMENT_ENABLED",
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_ID",
      "STRIPE_WEBHOOK_SECRET",
      "ECHO_MAZE_APP_ORIGIN"
    ]) {
      expect(ENFORCEMENT_REFUSAL).toContain(name);
    }
  });

  it("degrades rather than crashing every serverless route", async () => {
    // `createPlayerApi` is constructed at module load in every `api/*.js`
    // entry point. A throw here would cold-start-crash the Scoreboard, the
    // Runs, and the Stripe webhook needed to fix the billing state.
    const handler = createPlayerApi({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo",
      RUN_ACCESS_ENFORCEMENT_ENABLED: "true"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        enforcementEnabled: false
      });
    });
  });

  it("still starts with enforcement deliberately off", async () => {
    const handler = createPlayerApi({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo",
      RUN_ACCESS_ENFORCEMENT_ENABLED: "false"
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
          questId: "quest_01MOSS123",
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

  it("fails Offline Continuity closed when the database is absent", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/offline/receipt`, {
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4,
          deviceInstallationNonce: "installation_nonce_01MOSS"
        })
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/Player services are not configured/i)
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

  it("keeps Classroom routes closed without storage", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      for (const path of [
        "/api/classrooms",
        "/api/classrooms/org_class_1/progress"
      ]) {
        const response = await fetch(`${origin}${path}`);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          error: expect.stringMatching(/Guest play still works/i)
        });
      }
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
