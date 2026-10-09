import { describe, expect, it, vi } from "vitest";
import {
  createHealthHandler,
  HEALTH_PATH,
  isHealthPath,
  READY_PATH
} from "../server/health-route.js";
import { loadLifetimeConfig } from "../server/lifetime-config.js";

describe("US-02.5 readiness with a refused live configuration", () => {
  it("US-02.5 answers 503 with stripe unconfigured", async () => {
    const stripeConfigured =
      loadLifetimeConfig({
        ECHO_MAZE_BILLING_MODE: "live",
        ECHO_MAZE_APP_ORIGIN: "https://maze.example",
        STRIPE_PRICE_ID: "price_echo_live",
        STRIPE_SECRET_KEY: "sk_live_safe-placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_safe-placeholder",
        VERCEL_ENV: "preview"
      }) !== null;
    const handler = createHealthHandler({ ...healthy(), stripeConfigured });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.stripe).toBe("unconfigured");
  });
});

describe("US-09 readiness follows the configuration of the selected mode", () => {
  const testEnv = {
    ECHO_MAZE_APP_ORIGIN: "https://maze.example",
    STRIPE_PRICE_ID: "price_echo_test",
    STRIPE_SECRET_KEY: "sk_test_safe-placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_safe-placeholder"
  };
  const liveEnv = {
    ...testEnv,
    ECHO_MAZE_BILLING_MODE: "live",
    STRIPE_PRICE_ID: "price_echo_live",
    STRIPE_SECRET_KEY: "sk_live_safe-placeholder",
    VERCEL_ENV: "production"
  };

  /** @param {Record<string, string>} env */
  async function ready(env) {
    const handler = createHealthHandler({
      ...healthy(),
      stripeConfigured: loadLifetimeConfig(env) !== null
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    return response;
  }

  it.each([
    ["test", testEnv],
    ["live", liveEnv]
  ])("US-09.1 reports stripe ok for a valid %s configuration", async (_mode, env) => {
    const response = await ready(env);
    expect(response.statusCode).toBe(200);
    expect(response.json().checks.stripe).toBe("ok");
  });

  it("US-09.3 answers 503 for an incomplete configuration", async () => {
    const response = await ready({ ...testEnv, STRIPE_PRICE_ID: "" });
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.stripe).toBe("unconfigured");
  });

  it("US-09.3 answers 503 when the key prefix does not match the mode", async () => {
    const response = await ready({ ...liveEnv, STRIPE_SECRET_KEY: testEnv.STRIPE_SECRET_KEY });
    expect(response.statusCode).toBe(503);
  });

  it("US-09.5 never names the mode in the readiness body", async () => {
    for (const env of [testEnv, liveEnv]) {
      const text = JSON.stringify((await ready(env)).json());
      expect(text).not.toMatch(/live|"mode"/i);
    }
  });
});

describe("US-09 live readiness waits for every purchase to carry a Billing Mode", () => {
  it("US-09.2 answers 503 while any purchase has no Billing Mode", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      countUnclassifiedPurchases: async () => 2
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.stripe).not.toBe("ok");
  });

  it("US-09.1 answers ready once every purchase carries a Billing Mode", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      countUnclassifiedPurchases: async () => 0
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(200);
    expect(response.json().checks.stripe).toBe("ok");
  });

  it("US-09.4 runs one count query per readiness call", async () => {
    const countUnclassifiedPurchases = vi.fn(async () => 0);
    const handler = createHealthHandler({
      ...healthy(),
      countUnclassifiedPurchases
    });
    await handler(fakeRequest({ url: READY_PATH }), fakeResponse());
    await handler(fakeRequest({ url: READY_PATH }), fakeResponse());
    expect(countUnclassifiedPurchases).toHaveBeenCalledTimes(2);
  });

  it("US-09.5 fails stripe when the count query fails, naming neither the mode nor the count", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      countUnclassifiedPurchases: async () => {
        throw new Error("relation lifetime_purchases does not exist");
      }
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.stripe).not.toBe("ok");
    expect(JSON.stringify(response.json())).not.toMatch(/live|mode|count|lifetime/i);
  });
});

/** @param {{ url?: string, method?: string }} [options] */
function fakeRequest({ url = HEALTH_PATH, method = "GET" } = {}) {
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({ url, method, headers: {} })
  );
}

function fakeResponse() {
  /** @type {Record<string, string>} */
  const headers = {};
  let body = "";
  const raw = {
    statusCode: 200,
    writableEnded: false,
    headers,
    setHeader(/** @type {string} */ name, /** @type {string} */ value) {
      headers[name.toLowerCase()] = value;
    },
    end(/** @type {string} */ chunk) {
      body += chunk ?? "";
      raw.writableEnded = true;
    },
    json: () => JSON.parse(body)
  };
  return /** @type {import("node:http").ServerResponse & typeof raw} */ (
    /** @type {unknown} */ (raw)
  );
}

const healthy = () => ({
  version: "abc1234",
  checkDatabase: async () => {},
  stripeConfigured: true,
  clerkConfigured: true
});

describe("health path matching", () => {
  it("matches exactly the two health paths", () => {
    expect(isHealthPath(HEALTH_PATH)).toBe(true);
    expect(isHealthPath(READY_PATH)).toBe(true);
    expect(isHealthPath("/api/healthz")).toBe(false);
    expect(isHealthPath("/api/profile")).toBe(false);
  });
});

describe("liveness", () => {
  it("answers ok with the version without touching any dependency", async () => {
    let databaseTouched = false;
    const handler = createHealthHandler({
      ...healthy(),
      checkDatabase: async () => {
        databaseTouched = true;
      }
    });
    const response = fakeResponse();
    await handler(fakeRequest(), response);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(databaseTouched).toBe(false);
  });

  it("rejects non-GET methods and still answers", async () => {
    const handler = createHealthHandler(healthy());
    const response = fakeResponse();
    await handler(fakeRequest({ method: "POST" }), response);
    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe("GET");
    expect(response.writableEnded).toBe(true);
  });
});

describe("readiness", () => {
  it("answers ready when every check passes", async () => {
    const handler = createHealthHandler(healthy());
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      version: "abc1234",
      checks: { database: "ok", stripe: "ok", clerk: "ok" }
    });
  });

  it("flips 503 with per-check detail when the database is unreachable", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      checkDatabase: async () => {
        throw new Error("connect ECONNREFUSED");
      }
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "unavailable",
      version: "abc1234",
      checks: { database: "failed", stripe: "ok", clerk: "ok" }
    });
    const body = JSON.stringify(response.json());
    expect(body).not.toContain("ECONNREFUSED");
  });

  it("bounds a stalled database check instead of hanging the endpoint", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      checkDatabase: () => new Promise(() => {}),
      checkTimeoutMs: 20
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.database).toBe("failed");
    expect(response.writableEnded).toBe(true);
  });

  it("reports an unconfigured database as unavailable", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      checkDatabase: null
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks.database).toBe("unconfigured");
  });

  it("reports missing Stripe and Clerk keys per check", async () => {
    const handler = createHealthHandler({
      ...healthy(),
      stripeConfigured: false,
      clerkConfigured: false
    });
    const response = fakeResponse();
    await handler(fakeRequest({ url: READY_PATH }), response);
    expect(response.statusCode).toBe(503);
    expect(response.json().checks).toEqual({
      database: "ok",
      stripe: "unconfigured",
      clerk: "unconfigured"
    });
  });
});
