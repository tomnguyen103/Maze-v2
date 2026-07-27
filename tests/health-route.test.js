import { describe, expect, it } from "vitest";
import {
  createHealthHandler,
  HEALTH_PATH,
  isHealthPath,
  READY_PATH
} from "../server/health-route.js";

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
