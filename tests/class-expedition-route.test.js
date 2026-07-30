import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createClassroomHandler } from "../server/classroom-route.js";
import { ClassroomAccessDeniedError } from "../server/classroom-context.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";

const MIXED_REVISION = "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92";

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined))
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not start.");
  }
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    );
  }
}

function expeditionStore() {
  return {
    listForUser: vi.fn(async () => []),
    requireTeacher: vi.fn(async () => "teacher"),
    domainForTeacher: vi.fn(async () => null),
    registerDomain: vi.fn(async () => ({ domain: "", autoJoinEnabled: true })),
    progressForTeacher: vi.fn(async () => ({ progress: [], truncated: false })),
    listExpeditions: vi.fn(async () => [
      {
        id: "exped_list_1",
        classroomId: "org_class_1",
        atlasRegion: 1,
        levelId: "bright-start",
        learningDeckId: "mixed-trail",
        learningDeckRevision: MIXED_REVISION,
        status: "open",
        completionDate: null
      }
    ]),
    createExpedition: vi.fn(async (_userId, _classroomId, input) => ({
      id: input.expeditionId,
      classroomId: "org_class_1",
      atlasRegion: input.atlasRegion,
      levelId: input.levelId,
      learningDeckId: input.learningDeckId,
      learningDeckRevision: input.learningDeckRevision,
      status: "open",
      completionDate: input.completionDate
    })),
    setExpeditionStatus: vi.fn(async (_userId, _classroomId, id, status) => ({
      id,
      status
    }))
  };
}

/** @param {Record<string, unknown>} [overrides] */
function createHandler(overrides = {}) {
  const store = expeditionStore();
  const audits = /** @type {Record<string, unknown>[]} */ ([]);
  const handler = createClassroomHandler({
    store,
    provider: null,
    getUserId: () => "user_teacher_1",
    recordAudit: async (_request, event) => {
      audits.push(event);
    },
    ...overrides
  });
  return { handler, store, audits };
}

describe("Class Expedition API", () => {
  it("requires a signed-in Explorer for every Expedition route", async () => {
    const { handler } = createHandler({ getUserId: () => null });
    await withServer(handler, async (origin) => {
      for (const [path, method] of [
        ["/api/classrooms/org_class_1/expeditions", "GET"],
        ["/api/classrooms/org_class_1/expeditions", "POST"],
        [
          "/api/classrooms/org_class_1/expeditions/exped_abc123/status",
          "POST"
        ]
      ]) {
        const response = await fetch(`${origin}${path}`, {
          method,
          ...(method === "POST"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({})
              }
            : {})
        });
        expect(response.status).toBe(401);
      }
    });
  });

  it("lists the Classroom's Expeditions for members", async () => {
    const { handler, store } = createHandler();
    await withServer(handler, async (origin) => {
      const response = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions`
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.expeditions).toHaveLength(1);
      expect(body.expeditions[0]).toMatchObject({
        id: "exped_list_1",
        atlasRegion: 1,
        status: "open"
      });
      expect(store.listExpeditions).toHaveBeenCalledWith(
        "user_teacher_1",
        "org_class_1"
      );
    });
  });

  it("creates a Class Expedition from a published Deck revision only", async () => {
    const { handler, store, audits } = createHandler();
    await withServer(handler, async (origin) => {
      const response = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            atlasRegion: 2,
            levelId: "trail-scout",
            learningDeckId: "mixed-trail",
            learningDeckRevision: MIXED_REVISION,
            completionDate: "2026-09-15"
          })
        }
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.expedition).toMatchObject({
        atlasRegion: 2,
        levelId: "trail-scout",
        learningDeckId: "mixed-trail",
        status: "open",
        completionDate: "2026-09-15"
      });
      expect(String(body.expedition.id)).toMatch(
        /^exped_[A-Za-z0-9_-]{3,120}$/
      );
      const input = store.createExpedition.mock.calls[0][2];
      expect(input.expeditionId).toBe(body.expedition.id);
      expect(audits).toContainEqual(
        expect.objectContaining({ action: "classroom.expedition.create" })
      );
    });
  });

  it("rejects an unknown Region, Quest Level, Deck revision, or date", async () => {
    const { handler, store } = createHandler();
    await withServer(handler, async (origin) => {
      const valid = {
        atlasRegion: 1,
        levelId: "bright-start",
        learningDeckId: "mixed-trail",
        learningDeckRevision: MIXED_REVISION
      };
      for (const invalid of [
        { ...valid, atlasRegion: 0 },
        { ...valid, atlasRegion: 6 },
        { ...valid, atlasRegion: "two" },
        { ...valid, levelId: "impossible" },
        { ...valid, learningDeckId: "word-trail" },
        { ...valid, learningDeckRevision: "deck:mixed-trail:v9:ffff" },
        { ...valid, completionDate: "soon" },
        { ...valid, completionDate: "2026-13-40" }
      ]) {
        const response = await fetch(
          `${origin}/api/classrooms/org_class_1/expeditions`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(invalid)
          }
        );
        expect(response.status).toBe(400);
      }
      expect(store.createExpedition).not.toHaveBeenCalled();
    });
  });

  it("answers 403 when the store denies Classroom authority", async () => {
    const { handler, store } = createHandler();
    store.createExpedition.mockRejectedValue(new ClassroomAccessDeniedError());
    store.setExpeditionStatus.mockRejectedValue(
      new ClassroomAccessDeniedError()
    );
    await withServer(handler, async (origin) => {
      const create = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            atlasRegion: 1,
            levelId: "bright-start",
            learningDeckId: "mixed-trail",
            learningDeckRevision: MIXED_REVISION
          })
        }
      );
      expect(create.status).toBe(403);
      const status = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions/exped_abc123/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "closed" })
        }
      );
      expect(status.status).toBe(403);
    });
  });

  it("meters Expedition changes and answers 429 when the budget is spent", async () => {
    const { handler } = createHandler({
      rateLimit: async () => ({
        allowed: false,
        degraded: false,
        limit: 10,
        remaining: 0,
        retryAfterSeconds: 60
      })
    });
    await withServer(handler, async (origin) => {
      const response = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            atlasRegion: 1,
            levelId: "bright-start",
            learningDeckId: "mixed-trail",
            learningDeckRevision: MIXED_REVISION
          })
        }
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
    });
  });

  it("closes and reopens an assignment gracefully and audits it", async () => {
    const { handler, store, audits } = createHandler();
    await withServer(handler, async (origin) => {
      for (const status of ["closed", "open"]) {
        const response = await fetch(
          `${origin}/api/classrooms/org_class_1/expeditions/exped_abc123/status`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status })
          }
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.expedition).toEqual({ id: "exped_abc123", status });
      }
      expect(store.setExpeditionStatus).toHaveBeenNthCalledWith(
        1,
        "user_teacher_1",
        "org_class_1",
        "exped_abc123",
        "closed"
      );
      expect(audits).toContainEqual(
        expect.objectContaining({ action: "classroom.expedition.status" })
      );
      const invalid = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions/exped_abc123/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "paused" })
        }
      );
      expect(invalid.status).toBe(400);
    });
  });

  it("rejects unsupported methods on Expedition routes", async () => {
    const { handler } = createHandler();
    await withServer(handler, async (origin) => {
      const list = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions`,
        { method: "DELETE" }
      );
      expect(list.status).toBe(405);
      const status = await fetch(
        `${origin}/api/classrooms/org_class_1/expeditions/exped_abc123/status`,
        { method: "GET" }
      );
      expect(status.status).toBe(405);
    });
  });

  it("offers every published Deck revision to the Teacher form", () => {
    const options = getPublishedLearningDeckOptions();
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const option of options) {
      expect(option.publishedRevisionIds).toContain(option.revisionId);
    }
  });
});
