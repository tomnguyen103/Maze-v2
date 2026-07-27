import { describe, expect, it, vi } from "vitest";
import {
  auditContextFromRequest,
  createAuditRecorder,
  createRequestAuditor,
  SYSTEM_ACTORS
} from "../server/audit.js";
import { hashClientIp } from "../server/audit-store.js";

/**
 * @param {Record<string, string>} headers
 * @param {string} [remoteAddress]
 */
function fakeRequest(headers, remoteAddress = undefined) {
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({ headers, socket: { remoteAddress } })
  );
}

describe("createAuditRecorder", () => {
  it("appends one normalized row per call", async () => {
    const appendAudit = vi.fn(
      async (
        /** @type {import("../server/audit-store.js").AuditEvent} */ event
      ) => event
    );
    const recorder = createAuditRecorder({
      store: { appendAudit },
      now: () => new Date("2026-07-26T12:00:00.000Z")
    });
    await recorder.recordAudit(
      { actorId: "user_1", actorRole: "player", requestId: "req_1" },
      "profile.update",
      { type: "player_profile", id: "user_1" },
      { username: "Old" },
      { username: "New" }
    );
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledWith({
      action: "profile.update",
      actorId: "user_1",
      actorRole: "player",
      after: { username: "New" },
      before: { username: "Old" },
      createdAt: "2026-07-26T12:00:00.000Z",
      ipHash: null,
      requestId: "req_1",
      resourceId: "user_1",
      resourceType: "player_profile"
    });
  });

  it("never throws into the request path when the append fails", async () => {
    const onFailure = vi.fn();
    const recorder = createAuditRecorder({
      store: {
        appendAudit: async () => {
          throw new Error("database down");
        }
      },
      onFailure
    });
    await expect(
      recorder.recordAudit({ actorId: "user_1" }, "profile.update", {
        type: "player_profile"
      })
    ).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(recorder.failureCount()).toBe(1);
  });

  it("counts every failure so observability can alert on a silent audit gap", async () => {
    /** @type {number[]} */
    const reported = [];
    const counting = createAuditRecorder({
      store: {
        appendAudit: async () => {
          throw new Error("database down");
        }
      },
      onFailure: (details) => reported.push(details.failures)
    });
    await counting.recordAudit({ actorId: "a" }, "x", { type: "y" });
    await counting.recordAudit({ actorId: "a" }, "x", { type: "y" });
    expect(counting.failureCount()).toBe(2);
    expect(reported).toEqual([1, 2]);
  });

  it("does not leak the raw error to the failure handler", async () => {
    /** @type {unknown[]} */
    const seen = [];
    const recorder = createAuditRecorder({
      store: {
        appendAudit: async () => {
          throw new Error("connection string postgres://user:secret@host");
        }
      },
      onFailure: (details) => seen.push(details)
    });
    await recorder.recordAudit({ actorId: "a" }, "x", { type: "y" });
    expect(JSON.stringify(seen)).not.toContain("secret");
    expect(seen[0]).toEqual({ action: "x", failures: 1, name: "Error" });
  });

  it("defaults the actor to the system actor when none is supplied", async () => {
    const appendAudit = vi.fn(
      async (
        /** @type {import("../server/audit-store.js").AuditEvent} */ event
      ) => event
    );
    const recorder = createAuditRecorder({ store: { appendAudit } });
    await recorder.recordAudit({}, "user.delete", { type: "player" });
    expect(appendAudit.mock.calls[0][0]).toMatchObject({
      actorId: SYSTEM_ACTORS.system,
      actorRole: "system"
    });
  });
});

describe("createRequestAuditor", () => {
  it("threads the configured salt, date, and proxy trust into the context", async () => {
    /** @type {Record<string, any>[]} */
    const calls = [];
    const recordAudit = createRequestAuditor({
      recorder: {
        async recordAudit(context, action, resource, before, after) {
          calls.push({ context, action, resource, before, after });
        }
      },
      salt: "salt",
      today: () => "2026-07-26",
      trustProxy: true
    });
    await recordAudit(
      fakeRequest({
        "x-request-id": "req_abc",
        "x-forwarded-for": "203.0.113.7"
      }),
      {
        actorId: "user_1",
        actorRole: "admin",
        action: "profile.update",
        resource: { type: "player_profile", id: "user_1" },
        before: { username: "Old" },
        after: { username: "New" }
      }
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      action: "profile.update",
      resource: { type: "player_profile", id: "user_1" },
      before: { username: "Old" },
      after: { username: "New" },
      context: {
        actorId: "user_1",
        actorRole: "admin",
        requestId: "req_abc"
      }
    });
    expect(calls[0].context.ipHash).toBe(
      hashClientIp("203.0.113.7", { salt: "salt", date: "2026-07-26" })
    );
  });

  it("ignores a forwarded address when no proxy is trusted", async () => {
    /** @type {Record<string, any>[]} */
    const calls = [];
    const recordAudit = createRequestAuditor({
      recorder: {
        async recordAudit(context) {
          calls.push(context);
        }
      },
      salt: "salt",
      today: () => "2026-07-26"
    });
    await recordAudit(
      fakeRequest({ "x-forwarded-for": "198.51.100.9" }, "203.0.113.7"),
      { actorId: "user_1", action: "profile.update", resource: { type: "x" } }
    );
    expect(calls[0].ipHash).toBe(
      hashClientIp("203.0.113.7", { salt: "salt", date: "2026-07-26" })
    );
  });
});

describe("auditContextFromRequest", () => {
  it("derives a hashed address and the inbound request id", () => {
    const context = auditContextFromRequest(
      fakeRequest({
        "x-request-id": "req_abc",
        "x-forwarded-for": "203.0.113.7, 10.0.0.1"
      }),
      {
        actorId: "user_1",
        actorRole: "admin",
        salt: "salt",
        date: "2026-07-26",
        trustProxy: true
      }
    );
    expect(context.actorId).toBe("user_1");
    expect(context.actorRole).toBe("admin");
    expect(context.requestId).toBe("req_abc");
    expect(context.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("omits the address hash when no salt is configured", () => {
    const context = auditContextFromRequest(
      fakeRequest({ "x-forwarded-for": "203.0.113.7" }, "203.0.113.7"),
      { actorId: "user_1" }
    );
    expect(context.ipHash).toBeNull();
  });

  it("rejects an unusable inbound request id", () => {
    const context = auditContextFromRequest(
      fakeRequest({ "x-request-id": "x".repeat(300) }),
      { actorId: "user_1" }
    );
    expect(context.requestId).toBeNull();
  });
});
