import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createAdminHandler } from "../server/admin-route.js";
import { createPermissionGuard } from "../server/rbac.js";

/**
 * @param {{ method?: string, url: string, body?: unknown }} options
 */
function request({ method = "GET", url, body }) {
  const stream = new PassThrough();
  stream.end(body === undefined ? "" : JSON.stringify(body));
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (
      Object.assign(stream, { method, url, headers: {}, socket: {} })
    )
  );
}

function response() {
  /** @type {(value: { statusCode: number, body: any }) => void} */
  let settle = () => {};
  const finished = new Promise((resolve) => {
    settle = resolve;
  });
  const target = {
    statusCode: 200,
    setHeader() {},
    /** @param {string} payload */
    end(payload) {
      settle({
        statusCode: target.statusCode,
        body: payload ? JSON.parse(payload) : null
      });
    }
  };
  return {
    target: /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ (target)
    ),
    finished
  };
}

/**
 * @param {"admin" | "moderator" | "player"} [role]
 */
function harness(role = "admin") {
  /** @type {Record<string, unknown>[]} */
  const audits = [];
  /** @type {string[]} */
  const calls = [];
  const store = {
    /** @returns {Promise<{ previousRole: import("../shared/permissions.js").Role, role: string }>} */
    async setRole() {
      return { previousRole: "player", role: "moderator" };
    },
    async listUsers() {
      calls.push("users");
      return {
        users: [{ userId: "user_1", username: "Nova", role: "player" }],
        hasMore: false
      };
    },
    /** @param {string} userId */
    async membershipFor(userId) {
      calls.push(`membership:${userId}`);
      return {
        userId,
        membershipState: "active",
        purchaseId: "purchase_1",
        paymentIntentId: "pi_1",
        purchaseStatus: "paid"
      };
    },
    /** @param {{ beforeId: number | null, limit: number }} options */
    async listAuditEvents(options) {
      calls.push(`audit:${options.beforeId ?? ""}:${options.limit}`);
      return [
        {
          id: 9,
          actorId: "admin_1",
          actorRole: "admin",
          action: "role.grant",
          resourceType: "user_role",
          resourceId: "user_1",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ];
    },
    async dashboardMetrics() {
      calls.push("metrics");
      return {
        explorers: 12,
        dailyActiveExplorers: 4,
        runsStartedToday: 9,
        lifetimeConversions: 3,
        activeMemberships: 3,
        publishedQuestions: 8,
        deadDeliveries: 1
      };
    }
  };
  const questionStore = {
    async listQuestions() {
      calls.push("questions");
      return [{ id: "math-1", versions: [] }];
    },
    /** @param {{ id: string }} input @param {string} editedBy */
    async saveDraft(input, editedBy) {
      calls.push(`draft:${input.id}:${editedBy}`);
      return { id: input.id, version: 2 };
    },
    /** @param {string} id @param {number} version */
    async publishVersion(id, version) {
      calls.push(`publish:${id}:${version}`);
      return { id, version };
    },
    /** @param {string} id */
    async deleteQuestion(id) {
      calls.push(`delete:${id}`);
      return { id, deleted: true };
    }
  };
  const handler = createAdminHandler({
    store,
    questionStore,
    refundPayment: async ({ paymentIntentId, purchaseId }) => {
      calls.push(`refund:${paymentIntentId}:${purchaseId}`);
      return { refundId: "re_1", status: "pending" };
    },
    listDeadWebhooks: async () => [],
    requirePermission: createPermissionGuard({
      getUserId: () => "admin_1",
      resolver: { roleFor: async () => role }
    }),
    recordAudit: async (_request, event) => {
      audits.push(event);
    }
  });
  return { audits, calls, handler };
}

/**
 * @param {ReturnType<typeof harness>} target
 * @param {{ method?: string, url: string, body?: unknown }} options
 */
async function call(target, options) {
  const capture = response();
  await target.handler(request(options), capture.target);
  return capture.finished;
}

describe("admin dashboard read routes", () => {
  it.each([
    ["/api/admin/users", "users", "users.read"],
    ["/api/admin/questions", "questions", "questions.read"],
    ["/api/admin/metrics", "metrics", "metrics.read"],
    ["/api/admin/audit?before=10&limit=25", "audit:10:25", "audit.read"],
    [
      "/api/admin/memberships/user_1",
      "membership:user_1",
      "membership.read"
    ]
  ])("serves and audits %s", async (url, expectedCall, action) => {
    const target = harness();
    const result = await call(target, { url });
    expect(result.statusCode).toBe(200);
    expect(target.calls).toContain(expectedCall);
    expect(target.audits).toEqual([
      expect.objectContaining({ action, actorId: "admin_1" })
    ]);
  });

  it("lets a moderator read users, questions, and the audit trail", async () => {
    const target = harness("moderator");
    for (const url of [
      "/api/admin/users",
      "/api/admin/questions",
      "/api/admin/audit"
    ]) {
      expect((await call(target, { url })).statusCode).toBe(200);
    }
  });

  it("keeps membership and metrics operations admin-only", async () => {
    const target = harness("moderator");
    expect(
      (await call(target, { url: "/api/admin/memberships/user_1" })).statusCode
    ).toBe(403);
    expect(
      (await call(target, { url: "/api/admin/metrics" })).statusCode
    ).toBe(403);
  });

  it("does not reveal a real route through an unsupported method", async () => {
    const target = harness("moderator");
    const unsupported = await call(target, {
      method: "POST",
      url: "/api/admin/questions"
    });
    const unknown = await call(target, {
      method: "POST",
      url: "/api/admin/does-not-exist"
    });

    expect(unsupported).toEqual(unknown);
    expect(unsupported).toEqual({
      statusCode: 403,
      body: { error: "You do not have access to that." }
    });
  });

  it("does not treat inherited object names as permission checks", async () => {
    const target = harness("moderator");
    const result = await call(target, {
      method: "constructor",
      url: "/api/admin/questions"
    });
    expect(result).toEqual({
      statusCode: 403,
      body: { error: "You do not have access to that." }
    });
  });
});

describe("admin question editing", () => {
  const content = {
    id: "math-1",
    prompt: "What is 2 + 2?",
    choices: [
      { id: "a", label: "3" },
      { id: "b", label: "4" },
      { id: "c", label: "5" }
    ],
    answerId: "b",
    hint: "Count on.",
    explanation: "Two and two make four.",
    difficultyBand: "foundation",
    difficultyRank: 11,
    topicId: "arithmetic",
    learningObjectiveId: "bright-combine-groups"
  };

  it("creates a validated draft and audits the write", async () => {
    const target = harness();
    const result = await call(target, {
      method: "PUT",
      url: "/api/admin/questions/math-1",
      body: {
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: 0,
        content
      }
    });
    expect(result.statusCode).toBe(200);
    expect(target.calls).toContain("draft:math-1:admin_1");
    expect(target.audits).toEqual([
      expect.objectContaining({ action: "question.draft.write" })
    ]);
  });

  it("lets a moderator save a draft without publish authority", async () => {
    const target = harness("moderator");
    const result = await call(target, {
      method: "PUT",
      url: "/api/admin/questions/math-1",
      body: {
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: 0,
        content
      }
    });
    expect(result.statusCode).toBe(200);
    expect(target.calls).toContain("draft:math-1:admin_1");
  });

  it("rejects a negative question ordinal at the route boundary", async () => {
    const target = harness();
    const result = await call(target, {
      method: "PUT",
      url: "/api/admin/questions/math-1",
      body: {
        levelId: "bright-start",
        difficultyBand: "foundation",
        questionOrdinal: -1,
        content
      }
    });
    expect(result.statusCode).toBe(400);
    expect(target.calls).not.toContain("draft:math-1:admin_1");
  });

  it("publishes one version and audits it", async () => {
    const target = harness();
    const result = await call(target, {
      method: "POST",
      url: "/api/admin/questions/math-1/publish",
      body: { version: 2 }
    });
    expect(result.statusCode).toBe(200);
    expect(target.calls).toContain("publish:math-1:2");
    expect(target.audits).toEqual([
      expect.objectContaining({ action: "question.publish" })
    ]);
  });

  it("deletes a question and audits it", async () => {
    const target = harness();
    const result = await call(target, {
      method: "DELETE",
      url: "/api/admin/questions/math-1"
    });
    expect(result.statusCode).toBe(200);
    expect(target.calls).toContain("delete:math-1");
    expect(target.audits).toEqual([
      expect.objectContaining({ action: "question.delete" })
    ]);
  });

  it("requires publish authority to delete a live question", async () => {
    const target = harness("moderator");
    const result = await call(target, {
      method: "DELETE",
      url: "/api/admin/questions/math-1"
    });
    expect(result.statusCode).toBe(403);
    expect(target.calls).not.toContain("delete:math-1");
  });

});

describe("admin refund initiation", () => {
  it("uses the stored payment reference, audits the request, and stays pending", async () => {
    const target = harness();
    const result = await call(target, {
      method: "POST",
      url: "/api/admin/memberships/user_1/refund"
    });
    expect(result.statusCode).toBe(202);
    expect(target.calls).toEqual([
      "membership:user_1",
      "refund:pi_1:purchase_1"
    ]);
    expect(result.body).toMatchObject({
      userId: "user_1",
      refundId: "re_1",
      status: "pending"
    });
    expect(target.audits).toEqual([
      expect.objectContaining({ action: "refund.issue" })
    ]);
  });

});
