import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { createClerkWebhookHandler } from "../server/clerk-webhook-route.js";
import { createLearningJournalHandler } from "../server/learning-journal-route.js";
import { createLifetimeHandler } from "../server/lifetime-route.js";
import { createPlayerApiHandler } from "../server/player-route.js";
import { createQuestProgressHandler } from "../server/quest-progress-route.js";
import { createRunAccessHandler } from "../server/run-access-route.js";
import { SYSTEM_ACTORS } from "../server/audit.js";
import { createQuestProgress } from "../src/game/quest-progress.js";

const QUEST_PROGRESS = createQuestProgress("trail-scout", 4, "quest_audit_1234");
const JOURNAL_EVENT = {
  difficultyBand: "capable",
  eventId: "event_00000000-0000-4000-8000-000000000101",
  learningObjectiveId: "scout-equal-groups",
  outcome: "wrong",
  questionId: "scout-capable-0",
  topicId: "arithmetic"
};

/**
 * @param {{ method: string, url: string, body?: unknown, headers?: Record<string, string> }} options
 */
function createRequest({ method, url, body, headers = {} }) {
  const stream = new PassThrough();
  if (body !== undefined) {
    stream.end(typeof body === "string" ? body : JSON.stringify(body));
  } else {
    stream.end();
  }
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (
      Object.assign(stream, {
        method,
        url,
        headers,
        socket: { remoteAddress: "203.0.113.7" }
      })
    )
  );
}

function createResponse() {
  /** @type {{ statusCode: number, body: unknown, headers: Record<string, string> }} */
  const captured = { statusCode: 0, body: null, headers: {} };
  /** @type {(value: typeof captured) => void} */
  let settle = () => {};
  const finished = new Promise((resolve) => {
    settle = resolve;
  });
  const response = {
    statusCode: 200,
    /**
     * @param {string} name
     * @param {string} value
     */
    setHeader(name, value) {
      captured.headers[name] = value;
    },
    /** @param {string} [payload] */
    end(payload) {
      captured.statusCode = response.statusCode;
      captured.body = payload ? JSON.parse(payload) : null;
      settle(captured);
    }
  };
  return { response, finished };
}

function createAuditSpy() {
  /** @type {Record<string, unknown>[]} */
  const events = [];
  return {
    events,
    /**
     * @param {import("node:http").IncomingMessage} _request
     * @param {Record<string, unknown>} event
     */
    async recordAudit(_request, event) {
      events.push(event);
    }
  };
}

const profileInput = {
  username: "Bright Fox",
  explorerPalette: "teal",
  playgroundPalette: "daylight"
};

describe("audit call sites", () => {
  it("writes exactly one profile.update row per accepted profile write", async () => {
    const audit = createAuditSpy();
    const handler = createPlayerApiHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        getProfile: async () => ({ username: "Old Fox" }),
        saveProfile: async () => ({ username: "Bright Fox" }),
        getLeaderboard: async () => ({ entries: [], globalMaxScore: 0 }),
        submitScore: async () => ({ entry: {}, duplicate: false })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "PUT", url: "/api/profile", body: profileInput }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "profile.update",
      actorId: "user_1",
      resource: { type: "player_profile", id: "user_1" }
    });
    expect(audit.events[0].before).toEqual({
      username: "Old Fox",
      explorerPalette: undefined,
      playgroundPalette: undefined
    });
  });

  it("writes no audit row for profile reads", async () => {
    const audit = createAuditSpy();
    const handler = createPlayerApiHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        getProfile: async () => ({ username: "Old Fox" }),
        saveProfile: async () => ({}),
        getLeaderboard: async () => ({ entries: [], globalMaxScore: 0 }),
        submitScore: async () => ({ entry: {}, duplicate: false })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: "/api/profile" }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toEqual([]);
  });

  it("writes one score.submit row without raw client score input", async () => {
    const audit = createAuditSpy();
    const handler = createPlayerApiHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        getProfile: async () => ({ username: "Bright Fox" }),
        saveProfile: async () => ({}),
        getLeaderboard: async () => ({ entries: [], globalMaxScore: 0 }),
        submitScore: async () => ({
          entry: {
            score: 900,
            levelId: "trail-scout",
            labyrinthNumber: 4,
            moves: 40,
            elapsedMs: 12000
          },
          duplicate: false
        })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/scores",
        body: {
          idempotencyKey: "run_01J1MOSSWATCH",
          levelId: "trail-scout",
          labyrinthNumber: 4,
          seed: "MOSS-WATCH-11",
          wardensDefeated: 2,
          echoesCollected: 3,
          moves: 81,
          elapsedMs: 92000,
          escaped: true
        }
      }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "score.submit",
      after: { score: 900, levelId: "trail-scout", labyrinthNumber: 4 }
    });
  });

  it("writes one run_access.decision row per enforced authorization", async () => {
    const audit = createAuditSpy();
    const handler = createRunAccessHandler({
      getUserId: () => "user_1",
      enforcementEnabled: true,
      recordAudit: audit.recordAudit,
      store: {
        getAccess: async () => ({ freeRunsRemaining: 3, state: "free" }),
        authorizeRun: async () => ({
          allowed: true,
          duplicate: false,
          freeRunsRemaining: 2,
          state: "free"
        })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/access/runs",
        body: {
          runId: "run_abcdefghijkl",
          seed: "SEED-ONE",
          levelId: "bright-start",
          labyrinthNumber: 1
        }
      }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "run_access.decision",
      resource: { type: "run_access_grant", id: "run_abcdefghijkl" },
      after: { allowed: true, state: "free" }
    });
  });

  it("writes no run_access row when enforcement is off and nothing is granted", async () => {
    const audit = createAuditSpy();
    const handler = createRunAccessHandler({
      getUserId: () => "user_1",
      enforcementEnabled: false,
      recordAudit: audit.recordAudit,
      store: {
        getAccess: async () => ({ freeRunsRemaining: 3, state: "free" }),
        authorizeRun: async () => {
          throw new Error("must not authorize when enforcement is off");
        }
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/access/runs",
        body: {
          runId: "run_abcdefghijkl",
          seed: "SEED-ONE",
          levelId: "bright-start",
          labyrinthNumber: 1
        }
      }),
      /** @type {never} */ (response),
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(200);
    expect(audit.events).toEqual([]);
  });

  it("writes one quest_progress.save row per accepted boundary write", async () => {
    const audit = createAuditSpy();
    const handler = createQuestProgressHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        get: async () => null,
        save: async () => ({ record: {}, conflict: false, duplicate: false })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "PUT",
        url: "/api/quest-progress",
        body: { expectedRevision: 0, progress: QUEST_PROGRESS }
      }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "quest_progress.save",
      resource: { type: "cloud_quest_progress", id: "user_1" }
    });
  });

  it("writes no quest_progress.save row when the write conflicts", async () => {
    const audit = createAuditSpy();
    const handler = createQuestProgressHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        get: async () => null,
        save: async () => ({ record: {}, conflict: true, duplicate: false })
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "PUT",
        url: "/api/quest-progress",
        body: { expectedRevision: 1, progress: QUEST_PROGRESS }
      }),
      /** @type {never} */ (response),
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(409);
    expect(audit.events).toEqual([]);
  });

  it("writes journal rows that carry counts but no learning content", async () => {
    const audit = createAuditSpy();
    const handler = createLearningJournalHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      store: {
        getJournal: async () => null,
        saveJournal: async () => ({
          journal: { version: 1, events: [JOURNAL_EVENT] },
          clearGeneration: 0
        }),
        clearJournal: async () => ({ journal: null, clearGeneration: 1 })
      }
    });
    const put = createResponse();
    await handler(
      createRequest({
        method: "PUT",
        url: "/api/learning-journal",
        body: {
          clearGeneration: 0,
          journal: { version: 1, events: [JOURNAL_EVENT] }
        }
      }),
      /** @type {never} */ (put.response),
      undefined
    );
    await put.finished;
    const remove = createResponse();
    await handler(
      createRequest({ method: "DELETE", url: "/api/learning-journal" }),
      /** @type {never} */ (remove.response),
      undefined
    );
    await remove.finished;

    expect(audit.events.map((event) => event.action)).toEqual([
      "journal.sync",
      "journal.clear"
    ]);
    expect(audit.events[0].after).toEqual({ clearGeneration: 0, eventCount: 1 });
    expect(JSON.stringify(audit.events)).not.toContain("scout-equal-groups");
    expect(JSON.stringify(audit.events)).not.toContain("scout-capable-0");
  });

  it("writes lifetime rows for checkout, confirmation, and the Stripe webhook", async () => {
    const audit = createAuditSpy();
    const handler = createLifetimeHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      service: {
        createCheckout: async () => ({
          checkoutUrl: "https://checkout.stripe.test/session",
          purchaseId: "purchase_1",
          state: "checkout_open"
        }),
        confirmCheckout: async () => ({
          outcome: "activated",
          purchaseId: "purchase_1",
          state: "lifetime_active"
        }),
        processWebhook: async () => ({
          eventType: "checkout.session.completed",
          outcome: "processed",
          purchaseId: "purchase_1"
        })
      }
    });

    const checkout = createResponse();
    await handler(
      createRequest({ method: "POST", url: "/api/lifetime-checkout", body: {} }),
      /** @type {never} */ (checkout.response),
      undefined
    );
    await checkout.finished;

    const confirm = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/lifetime-confirm",
        body: { sessionId: "cs_abcdefghij" }
      }),
      /** @type {never} */ (confirm.response),
      undefined
    );
    await confirm.finished;

    const webhook = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/stripe-webhook",
        body: { id: "evt_1" },
        headers: { "stripe-signature": "signature" }
      }),
      /** @type {never} */ (webhook.response),
      undefined
    );
    await webhook.finished;

    expect(audit.events.map((event) => event.action)).toEqual([
      "lifetime.checkout",
      "lifetime.confirm",
      "lifetime.webhook"
    ]);
    expect(audit.events[2]).toMatchObject({
      actorId: SYSTEM_ACTORS.stripe,
      actorRole: "system"
    });
    expect(JSON.stringify(audit.events)).not.toContain("checkout.stripe.test");
  });

  it("writes no lifetime row when the webhook signature is rejected", async () => {
    const audit = createAuditSpy();
    const handler = createLifetimeHandler({
      getUserId: () => "user_1",
      recordAudit: audit.recordAudit,
      service: {
        createCheckout: async () => ({}),
        confirmCheckout: async () => ({}),
        processWebhook: async () => ({})
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/stripe-webhook",
        body: { id: "evt_1" }
      }),
      /** @type {never} */ (response),
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(400);
    expect(audit.events).toEqual([]);
  });

  it("writes one user.delete row attributed to the Clerk webhook", async () => {
    const audit = createAuditSpy();
    const handler = createClerkWebhookHandler({
      deleteUser: async () => {},
      recordAudit: audit.recordAudit,
      verifyEvent: async () => ({
        type: "user.deleted",
        data: { id: "user_gone" }
      })
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "POST", url: "/api/clerk-webhook", body: {} }),
      /** @type {never} */ (response),
      undefined
    );
    await finished;
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "user.delete",
      actorId: SYSTEM_ACTORS.clerk,
      actorRole: "system",
      resource: { type: "player_account", id: "user_gone" }
    });
  });

  it("writes no user.delete row when deletion fails", async () => {
    const audit = createAuditSpy();
    const handler = createClerkWebhookHandler({
      deleteUser: async () => {
        throw new Error("database down");
      },
      recordAudit: audit.recordAudit,
      verifyEvent: async () => ({
        type: "user.deleted",
        data: { id: "user_gone" }
      })
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "POST", url: "/api/clerk-webhook", body: {} }),
      /** @type {never} */ (response),
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(503);
    expect(audit.events).toEqual([]);
  });
});
