import { describe, expect, it, vi } from "vitest";
import {
  createInternalHandler,
  INTERNAL_AUDIT_CHECKPOINT_PATH,
  isInternalPath
} from "../server/internal-route.js";

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
  it("writes an immutable audit checkpoint through the machine-only route", async () => {
    const createAuditCheckpoint = vi.fn(async () => ({
      key: "audit-checkpoints/v1/0001-a.json",
      maxId: 1,
      rowHash: "a".repeat(64),
      duplicate: false
    }));
    const handler = createInternalHandler({
      inbox: workingInbox,
      createAuditCheckpoint,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();

    await handler(
      createRequest({
        method: "POST",
        url: INTERNAL_AUDIT_CHECKPOINT_PATH,
        secret: SECRET
      }),
      response,
      undefined
    );

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({
      checkpoint: {
        key: "audit-checkpoints/v1/0001-a.json",
        maxId: 1,
        duplicate: false
      }
    });
  });

  it("adds checkpointing to the existing daily maintenance run", async () => {
    const createAuditCheckpoint = vi.fn(async () => ({
      key: "audit-checkpoints/v1/0002-b.json",
      maxId: 2,
      rowHash: "b".repeat(64),
      duplicate: false
    }));
    const handler = createInternalHandler({
      inbox: workingInbox,
      createAuditCheckpoint,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();

    await handler(
      createRequest({ method: "GET", url: RETRY, secret: SECRET }),
      response,
      undefined
    );

    expect(createAuditCheckpoint).toHaveBeenCalledOnce();
    expect(captured.statusCode).toBe(200);
    expect(captured.body.checkpoint).toMatchObject({ maxId: 2 });
  });

  it("fails the maintenance request closed when configured checkpointing fails", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      createAuditCheckpoint: async () => {
        throw new Error("s3 secret credential");
      },
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();

    await handler(
      createRequest({ method: "GET", url: RETRY, secret: SECRET }),
      response,
      undefined
    );

    expect(captured.statusCode).toBe(503);
    expect(JSON.stringify(captured.body)).not.toContain("credential");
  });

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
      dead: 0,
      pruned: { rateLimits: null, webhookInbox: null }
    });
  });

  it("prunes rate-limit counters and the webhook inbox on the cron path", async () => {
    const pruneRateLimits = vi.fn(async () => 4);
    const pruneWebhookInbox = vi.fn(async () => 2);
    const handler = createInternalHandler({
      inbox: workingInbox,
      pruneRateLimits,
      pruneWebhookInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ method: "GET", url: RETRY, secret: SECRET }),
      response,
      undefined
    );
    expect(pruneRateLimits).toHaveBeenCalledTimes(1);
    expect(pruneWebhookInbox).toHaveBeenCalledTimes(1);
    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      claimed: 2,
      processed: 1,
      failed: 1,
      dead: 0,
      pruned: { rateLimits: 4, webhookInbox: 2 }
    });
  });

  it("keeps the retry result when a prune fails, and does not leak the failure", async () => {
    const pruneWebhookInbox = vi.fn(async () => 7);
    const handler = createInternalHandler({
      inbox: workingInbox,
      pruneRateLimits: async () => {
        throw new Error("connection string postgres://user:secret@host");
      },
      pruneWebhookInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY, secret: SECRET }), response, undefined);
    // One failing prune must not stop the other, nor the retry it follows.
    expect(pruneWebhookInbox).toHaveBeenCalledTimes(1);
    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({
      claimed: 2,
      processed: 1,
      failed: 1,
      dead: 0,
      pruned: { rateLimits: null, webhookInbox: 7 }
    });
    expect(JSON.stringify(captured.body)).not.toContain("secret@host");
  });

  it("still prunes when the retry itself fails", async () => {
    const pruneRateLimits = vi.fn(async () => 3);
    const pruneWebhookInbox = vi.fn(async () => 1);
    const handler = createInternalHandler({
      inbox: {
        retryPending: async () => {
          throw new Error("retry unavailable");
        }
      },
      pruneRateLimits,
      pruneWebhookInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(createRequest({ url: RETRY, secret: SECRET }), response, undefined);
    // A database that keeps failing the retry is the one whose tables would
    // otherwise grow forever.
    expect(pruneRateLimits).toHaveBeenCalledTimes(1);
    expect(pruneWebhookInbox).toHaveBeenCalledTimes(1);
    expect(captured.statusCode).toBe(503);
  });

  it("does not prune when the secret is wrong", async () => {
    const pruneRateLimits = vi.fn();
    const pruneWebhookInbox = vi.fn();
    const handler = createInternalHandler({
      inbox: workingInbox,
      pruneRateLimits,
      pruneWebhookInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ url: RETRY, secret: "wrong-secret-value" }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(401);
    expect(pruneRateLimits).not.toHaveBeenCalled();
    expect(pruneWebhookInbox).not.toHaveBeenCalled();
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

  it("accepts the GET that Vercel cron actually issues", async () => {
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
    expect(captured.statusCode).toBe(200);
  });

  it("accepts the Bearer header Vercel cron sends", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const request = /** @type {import("node:http").IncomingMessage} */ (
      /** @type {unknown} */ ({
        method: "GET",
        url: RETRY,
        headers: { authorization: `Bearer ${SECRET}` }
      })
    );
    const { response, captured } = createResponse();
    await handler(request, response, undefined);
    expect(captured.statusCode).toBe(200);
  });

  it("rejects a wrong Bearer secret", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const request = /** @type {import("node:http").IncomingMessage} */ (
      /** @type {unknown} */ ({
        method: "GET",
        url: RETRY,
        headers: { authorization: "Bearer wrong-secret-value" }
      })
    );
    const { response, captured } = createResponse();
    await handler(request, response, undefined);
    expect(captured.statusCode).toBe(401);
  });

  it("rejects a method that is neither GET nor POST", async () => {
    const handler = createInternalHandler({
      inbox: workingInbox,
      cronSecret: SECRET
    });
    const { response, captured } = createResponse();
    await handler(
      createRequest({ method: "DELETE", url: RETRY, secret: SECRET }),
      response,
      undefined
    );
    expect(captured.statusCode).toBe(405);
    expect(captured.headers.allow).toBe("GET, POST");
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
