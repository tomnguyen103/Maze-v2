import { describe, expect, it, vi } from "vitest";
import {
  createDataExportHandler,
  DATA_EXPORT_PATH
} from "../server/data-export-route.js";

/** @param {{ url?: string, method?: string }} [options] */
function fakeRequest({ url = DATA_EXPORT_PATH, method = "GET" } = {}) {
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

const allowed = () =>
  Promise.resolve({
    allowed: true,
    degraded: false,
    limit: 2,
    remaining: 1,
    retryAfterSeconds: 0
  });

function makeHandler(overrides = {}) {
  const recordAudit = vi.fn(() => Promise.resolve());
  const exportUser = vi.fn(() =>
    Promise.resolve({
      schema: "echo-maze-export/2",
      generated_at: "2026-07-27T00:00:00.000Z",
      data: {}
    })
  );
  const handler = createDataExportHandler({
    exportUser,
    getUserId: () => "user_export_1",
    rateLimit: allowed,
    recordAudit,
    ...overrides
  });
  return { handler, recordAudit, exportUser };
}

describe("GET /api/me/export", () => {
  it("requires a signed-in Explorer", async () => {
    const { handler, exportUser } = makeHandler({ getUserId: () => null });
    const response = fakeResponse();
    await handler(fakeRequest(), response);
    expect(response.statusCode).toBe(401);
    expect(exportUser).not.toHaveBeenCalled();
    expect(response.writableEnded).toBe(true);
  });

  it("rejects non-GET methods", async () => {
    const { handler } = makeHandler();
    const response = fakeResponse();
    await handler(fakeRequest({ method: "POST" }), response);
    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe("GET");
  });

  it("spends the export budget before building anything", async () => {
    const { handler, exportUser } = makeHandler({
      rateLimit: vi.fn((/** @type {string} */ budget) => {
        expect(budget).toBe("export.self");
        return Promise.resolve({
          allowed: false,
          degraded: false,
          limit: 2,
          remaining: 0,
          retryAfterSeconds: 1800
        });
      })
    });
    const response = fakeResponse();
    await handler(fakeRequest(), response);
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("1800");
    expect(exportUser).not.toHaveBeenCalled();
  });

  it("returns the export as a download and audits export.self first", async () => {
    /** @type {string[]} */
    const order = [];
    const recordAudit = vi.fn(() => {
      order.push("audit");
      return Promise.resolve();
    });
    const { handler } = makeHandler({ recordAudit });
    const response = fakeResponse();
    const originalEnd = response.end.bind(response);
    response.end = /** @type {typeof response.end} */ (
      /** @type {unknown} */ (
        (/** @type {string} */ chunk) => {
          order.push("end");
          originalEnd(chunk);
        }
      )
    );
    const request = fakeRequest();
    await handler(request, response);
    // The documented sequencing guarantee: audit attempt before the body.
    expect(order).toEqual(["audit", "end"]);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(
      "echo-maze-export"
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().schema).toBe("echo-maze-export/2");
    expect(recordAudit).toHaveBeenCalledWith(request, {
      actorId: "user_export_1",
      action: "export.self",
      resource: { type: "player_account", id: "user_export_1" }
    });
  });

  it("answers 503 when the export cannot be built, without echoing the error", async () => {
    const { handler } = makeHandler({
      exportUser: () => Promise.reject(new Error("connect ECONNREFUSED"))
    });
    const response = fakeResponse();
    await handler(fakeRequest(), response);
    expect(response.statusCode).toBe(503);
    expect(response.writableEnded).toBe(true);
    expect(JSON.stringify(response.json())).not.toContain("ECONNREFUSED");
  });

  it("passes through non-export paths", async () => {
    const { handler } = makeHandler();
    const next = vi.fn();
    const response = fakeResponse();
    await handler(fakeRequest({ url: "/api/profile" }), response, next);
    expect(next).toHaveBeenCalled();
    expect(response.writableEnded).toBe(false);
  });
});
