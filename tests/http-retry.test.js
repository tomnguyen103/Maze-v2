import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SERVICE_UNAVAILABLE_RETRY_SECONDS,
  setRetryAfter
} from "../server/http-retry.js";
import { createHealthHandler, READY_PATH } from "../server/health-route.js";

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

describe("setRetryAfter", () => {
  it("advises a wait on 503 so a client does not retry blind", () => {
    const response = fakeResponse();
    setRetryAfter(response, 503);
    expect(response.headers["retry-after"]).toBe(
      String(SERVICE_UNAVAILABLE_RETRY_SECONDS)
    );
  });

  it("stays silent on statuses that are not retryable", () => {
    for (const status of [200, 400, 401, 403, 404, 409, 500]) {
      const response = fakeResponse();
      setRetryAfter(response, status);
      expect(response.headers["retry-after"]).toBeUndefined();
    }
  });

  it("never overrides the budget-derived advisory rate limiting sets on 429", () => {
    const response = fakeResponse();
    response.setHeader("retry-after", "900");
    setRetryAfter(response, 429);
    expect(response.headers["retry-after"]).toBe("900");
  });
});

describe("route wiring", () => {
  const serverDir = fileURLToPath(new URL("../server/", import.meta.url));
  const PROSE_ONLY = new Set(["deleted-user-guard.js"]);

  it("gives every route that emits a 503 a retry-after", () => {
    /** @type {string[]} */
    const missing = [];
    for (const name of readdirSync(serverDir)) {
      if (!name.endsWith(".js")) continue;
      const source = readFileSync(serverDir + name, "utf8");
      if (!/\b503\b/.test(source)) continue;
      // Modules that only mention 503 in prose. An explicit list, so adding
      // one is a decision rather than a side effect of a looser pattern.
      if (PROSE_ONLY.has(name)) continue;
      if (!source.includes("setRetryAfter(response,")) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("readiness", () => {
  it("tells a probe when to come back after reporting unready", async () => {
    const handler = createHealthHandler({
      version: "abc1234",
      checkDatabase: async () => {
        throw new Error("database is down");
      },
      stripeConfigured: true,
      clerkConfigured: true
    });
    const response = fakeResponse();
    await handler(
      /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ url: READY_PATH, method: "GET", headers: {} })
      ),
      response
    );
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe(
      String(SERVICE_UNAVAILABLE_RETRY_SECONDS)
    );
  });
});
