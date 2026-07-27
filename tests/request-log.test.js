import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createRequestLogger, ensureRequestId } from "../server/request-log.js";
import { requestIdFrom } from "../server/audit.js";

/** @param {{ url?: string, method?: string, headers?: Record<string, string> }} [options] */
function fakeRequest({ url = "/api/profile", method = "GET", headers = {} } = {}) {
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({ url, method, headers })
  );
}

function fakeResponse() {
  const emitter = new EventEmitter();
  /** @type {Record<string, string>} */
  const headers = {};
  const response = /** @type {import("node:http").ServerResponse & { headers: Record<string, string>, finish: () => void }} */ (
    /** @type {unknown} */ ({
      statusCode: 200,
      headers,
      setHeader(/** @type {string} */ name, /** @type {string} */ value) {
        headers[name.toLowerCase()] = value;
      },
      on: emitter.on.bind(emitter),
      finish: () => emitter.emit("finish")
    })
  );
  return response;
}

function fakeLogger() {
  /** @type {{ fields: Record<string, unknown>, msg: string }[]} */
  const lines = [];
  return {
    lines,
    info(/** @type {Record<string, unknown>} */ fields, /** @type {string} */ msg) {
      lines.push({ fields, msg });
    }
  };
}

describe("request id", () => {
  it("keeps a valid inbound x-request-id", () => {
    const request = fakeRequest({ headers: { "x-request-id": "req_abc-1" } });
    expect(ensureRequestId(request)).toBe("req_abc-1");
  });

  it("generates an id, writes it onto the request, and audit reads it back", () => {
    const request = fakeRequest();
    const generated = ensureRequestId(request);
    expect(generated).toMatch(/^[A-Za-z0-9_.:-]{1,200}$/);
    // The audit layer reads the same header, so a generated id lands in
    // audit rows without the routes knowing about it.
    expect(requestIdFrom(request)).toBe(generated);
  });

  it("replaces an invalid inbound id instead of trusting it", () => {
    const request = fakeRequest({
      headers: { "x-request-id": "bad id with spaces\n" }
    });
    const generated = ensureRequestId(request);
    expect(generated).not.toContain(" ");
    expect(requestIdFrom(request)).toBe(generated);
  });
});

describe("request logging middleware", () => {
  it("echoes the request id and logs one line with route, status, duration", () => {
    const logger = fakeLogger();
    let ticks = 0;
    const logRequest = createRequestLogger({
      logger,
      now: () => (ticks += 12)
    });
    const request = fakeRequest({ url: "/api/scores?limit=5", method: "POST" });
    const response = fakeResponse();

    const requestId = logRequest(request, response);

    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(logger.lines).toHaveLength(0);
    response.statusCode = 201;
    response.finish();
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0].msg).toBe("request");
    expect(logger.lines[0].fields).toMatchObject({
      request_id: requestId,
      method: "POST",
      route: "/api/scores",
      status: 201,
      duration_ms: 12
    });
  });

  it("logs exactly one line per request even if finish fires twice", () => {
    const logger = fakeLogger();
    const logRequest = createRequestLogger({ logger, now: () => 0 });
    const response = fakeResponse();
    logRequest(fakeRequest(), response);
    response.finish();
    response.finish();
    expect(logger.lines).toHaveLength(1);
  });
});
