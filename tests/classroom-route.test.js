import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createClassroomHandler } from "../server/classroom-route.js";
import { ClassroomAccessDeniedError } from "../server/classroom-context.js";

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

function classroomStore() {
  return {
    listForUser: vi.fn(async () => [
      { id: "org_class_1", name: "Comet Crew", role: "teacher" }
    ]),
    requireTeacher: vi.fn(async () => "teacher"),
    progressForTeacher: vi.fn(async () => ({
      progress: [{
        studentName: "Moss",
        objectiveId: "addition-within-20",
        correct: 3,
        wrong: 1,
        hints: 1,
        skips: 0,
        total: 5
      }],
      truncated: false
    }))
  };
}

function classroomProvider() {
  return {
    createClassroom: vi.fn(async () => ({
      id: "org_new_1",
      name: "Aurora Lab"
    })),
    inviteStudent: vi.fn(async () => ({
      id: "orginv_1",
      emailAddress: "student@example.com",
      status: "pending",
      url: "https://accounts.example.test/invitations/orginv_1"
    }))
  };
}

describe("Classroom API", () => {
  it("requires a signed-in Explorer for every Classroom route", async () => {
    const handler = createClassroomHandler({
      store: classroomStore(),
      provider: classroomProvider(),
      getUserId: () => null
    });

    await withServer(handler, async (origin) => {
      for (const [path, method] of [
        ["/api/classrooms", "GET"],
        ["/api/classrooms", "POST"],
        ["/api/classrooms/org_class_1/invitations", "POST"],
        ["/api/classrooms/org_class_1/progress", "GET"]
      ]) {
        const response = await fetch(`${origin}${path}`, {
          method,
          ...(method === "POST"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "Comet", email: "a@b.test" })
              }
            : {})
        });
        expect(response.status).toBe(401);
      }
    });
  });

  it("lists only synchronized memberships and returns minimized progress", async () => {
    const store = classroomStore();
    const handler = createClassroomHandler({
      store,
      provider: classroomProvider(),
      getUserId: () => "user_teacher_1"
    });

    await withServer(handler, async (origin) => {
      const classrooms = await fetch(`${origin}/api/classrooms`);
      expect(classrooms.status).toBe(200);
      await expect(classrooms.json()).resolves.toEqual({
        classrooms: [
          { id: "org_class_1", name: "Comet Crew", role: "teacher" }
        ]
      });

      const progress = await fetch(
        `${origin}/api/classrooms/org_class_1/progress`
      );
      expect(progress.status).toBe(200);
      const body = await progress.json();
      expect(body).toEqual({
        classroomId: "org_class_1",
        progress: [
          {
            studentName: "Moss",
            objectiveId: "addition-within-20",
            correct: 3,
            wrong: 1,
            hints: 1,
            skips: 0,
            total: 5
          }
        ],
        truncated: false
      });
      expect(JSON.stringify(body)).not.toMatch(
        /prompt|answer|questionId|eventId|timestamp|updatedAt/i
      );
      expect(JSON.stringify(body)).not.toContain("user_student_1");
    });

    expect(store.progressForTeacher).toHaveBeenCalledWith(
      "user_teacher_1",
      "org_class_1"
    );
  });

  it("creates in Clerk and waits for webhook synchronization", async () => {
    const store = classroomStore();
    const provider = classroomProvider();
    const audit = vi.fn();
    const handler = createClassroomHandler({
      store,
      provider,
      getUserId: () => "user_teacher_1",
      recordAudit: audit
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/classrooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Aurora Lab  " })
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        classroom: { id: "org_new_1", name: "Aurora Lab" },
        syncState: "awaiting-webhook"
      });
    });

    expect(provider.createClassroom).toHaveBeenCalledWith({
      name: "Aurora Lab",
      creatorUserId: "user_teacher_1"
    });
    expect(store.listForUser).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "user_teacher_1",
        action: "classroom.create",
        resource: { type: "classroom", id: "org_new_1" }
      })
    );
  });

  it("checks database Teacher authority before asking Clerk to invite", async () => {
    const store = classroomStore();
    const provider = classroomProvider();
    const handler = createClassroomHandler({
      store,
      provider,
      getUserId: () => "user_teacher_1"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(
        `${origin}/api/classrooms/org_class_1/invitations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: " Student@Example.com " })
        }
      );
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        invitation: {
          id: "orginv_1",
          emailAddress: "student@example.com",
          status: "pending",
          url: "https://accounts.example.test/invitations/orginv_1"
        }
      });
    });

    expect(store.requireTeacher).toHaveBeenCalledWith(
      "user_teacher_1",
      "org_class_1"
    );
    expect(provider.inviteStudent).toHaveBeenCalledWith({
      classroomId: "org_class_1",
      emailAddress: "student@example.com",
      inviterUserId: "user_teacher_1",
      redirectUrl: "/class"
    });
    expect(
      store.requireTeacher.mock.invocationCallOrder[0]
    ).toBeLessThan(provider.inviteStudent.mock.invocationCallOrder[0]);
  });

  it("denies Students and non-members without calling Clerk", async () => {
    const store = classroomStore();
    store.requireTeacher.mockRejectedValue(new ClassroomAccessDeniedError());
    store.progressForTeacher.mockRejectedValue(
      new ClassroomAccessDeniedError()
    );
    const provider = classroomProvider();
    const handler = createClassroomHandler({
      store,
      provider,
      getUserId: () => "user_student_1"
    });

    await withServer(handler, async (origin) => {
      const invite = await fetch(
        `${origin}/api/classrooms/org_class_1/invitations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "student@example.com" })
        }
      );
      expect(invite.status).toBe(403);

      const progress = await fetch(
        `${origin}/api/classrooms/org_class_1/progress`
      );
      expect(progress.status).toBe(403);
    });

    expect(provider.inviteStudent).not.toHaveBeenCalled();
  });

  it("bounds malformed input and redacts provider failures", async () => {
    const provider = classroomProvider();
    provider.createClassroom.mockRejectedValue(
      new Error("Clerk secret response detail")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createClassroomHandler({
      store: classroomStore(),
      provider,
      getUserId: () => "user_teacher_1"
    });

    await withServer(handler, async (origin) => {
      const nullBody = await fetch(`${origin}/api/classrooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "null"
      });
      expect(nullBody.status).toBe(400);
      await expect(nullBody.json()).resolves.toEqual({
        error: "Request body must be a JSON object."
      });
      expect(provider.createClassroom).not.toHaveBeenCalled();

      const malformed = await fetch(`${origin}/api/classrooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "" })
      });
      expect(malformed.status).toBe(400);

      const failed = await fetch(`${origin}/api/classrooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Comet Crew" })
      });
      expect(failed.status).toBe(502);
      await expect(failed.json()).resolves.toEqual({
        error: "Classroom service is temporarily unavailable."
      });
    });

    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "Clerk secret response detail"
    );
    log.mockRestore();
  });
});
