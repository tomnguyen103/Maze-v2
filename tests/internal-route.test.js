import { describe, expect, it, vi } from "vitest";
import { createInternalHandler, isInternalPath } from "../server/internal-route.js";

/**
 * @param {{ method?: string, url: string, secret?: string }} options
 */
function createRequest({ method = "POST", url, secret }) {
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({
      method,
      url,
      headers: secret === undefined ? {} : { "x-cron-secret": secret }
    })
  );
}

function createResponse() {
  /** @type {{ statusCode: number, body: any, headers: Record<string, string> }} */
  const captured = { statusCode: 0, body: null, headers: {} };
  const response = {
    statusCode: 200,
    /** @param {string} name @param {string} value */
    setHeader(name, value) {
      captured.headers[name] = value;
    },
    /** @param {string} [payload] */
    end(payload) {
      captured.statusCode = response.statusCode;
      captured.body = payload ? JSON.parse(payload) : null;
    }
  };
  return { response: /** @type {never} */ (response), captured };
}

const RETRY = "/api/internal/webhook-retry";
const SECRET = "cron-secret-value";

const workingInbox = {
  retryPending: async () => ({ claimed: 2, processed: 1, failed: 1, dead: 0 })
};

describe("isInternalPath", () => {
  it("matches only the internal namespace", () => {
    expect(isInternalPath(RETRY)).toBe(true);
    expect(isInternalPath("/api/internal/")).toBe(true);
    expect(isInternalPath("/api/profile")).toBe(false);
    expect(isInternalPath("/api/internal")).toBe(false);
  });
});

describe("internal webhook retry endpoint", () => {
  it("runs the retry loop and reports the outcome", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY, secret: SECRET }), response, undefined);
    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      claimed: 2,
      processed: 1,
      failed: 1,
      dead: 0
    });
  });

  it("rejects a missing secret", async () => {
    const retryPending = vi.fn();
    const handler = createInternalHandler({
      inbox: { retryPending },
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY }), response, undefined);
    expect(captured.statusCode).toBe(401);
    expect(retryPending).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const retryPending = vi.fn();
    const handler = createInternalHandler({
      inbox: { retryPending },
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ url: RETRY, secret: "wrong-secret-value" }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(401);
    expect(retryPending).not.toHaveBeenCalled();
  });

  it("closes the endpoint when no secret is configured, rather than opening it", async () => {
    const retryPending = vi.fn();
    const handler = createInternalHandler({
      inbox: { retryPending },
      cronSecret: ""
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ url: RETRY, secret: "anything" }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(503);
    expect(retryPending).not.toHaveBeenCalled();
  });

  it("does not reveal which internal routes exist without the secret", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const real = createResponse();
    await handler(createRequest({ url: RETRY }), real.response, undefined);
    const fake = createResponse();
    await handler(
      createRequest({ url: "/api/internal/does-not-exist" }),
      fake.response,
      undefined
    );
    expect(real.captured.statusCode).toBe(fake.captured.statusCode);
    expect(real.captured.body).toEqual(fake.captured.body);
  });

  it("returns 404 for an unknown internal route once authenticated", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ url: "/api/internal/nope", secret: SECRET }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(404);
  });

  it("rejects a non-POST method", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ method: "GET", url: RETRY, secret: SECRET }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(405);
    expect(captured.headers.allow).toBe("POST");
  });

  it("reports 503 when the inbox is unavailable", async () => {
    const handler = createInternalHandler({ inbox: null, cronSecret: SECRET });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY, secret: SECRET }), response, undefined);
    expect(captured.statusCode).toBe(503);
  });

  it("reports 503 without leaking the failure when the retry throws", async () => {
    const handler = createInternalHandler({
      inbox: {
        retryPending: async () => {
          throw new Error("connection string postgres://user:secret@host");
        }
      },
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY, secret: SECRET }), response, undefined);
    expect(captured.statusCode).toBe(503);
    expect(JSON.stringify(captured.body)).not.toContain("secret@host");
  });

  it("passes non-internal paths to the next handler", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    let continued = false;
    const { response } = createResponse();
    await handler(createRequest({ url: "/api/profile" }), response, () => {
      continued = true;
    });
    expect(continued).toBe(true);
  });
});
