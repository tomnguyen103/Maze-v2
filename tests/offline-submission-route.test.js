import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createOfflineSubmissionHandler,
  OFFLINE_SUBMISSION_PATH
} from "../server/offline-submission-route.js";

const SUBMISSION = {
  idempotencyKey: "offline_submit_01J1MOSSWATCH",
  receipt: {
    schema: "echo-maze-offline-receipt/1",
    binding: {
      runId: "offline_run_01J1MOSSWATCH",
      deviceInstallationHash: "a".repeat(64),
      contentPackHash: "b".repeat(64)
    },
    signature: "signature"
  },
  deviceInstallationHash: "a".repeat(64),
  contentPackHash: "b".repeat(64),
  terminalAt: "2026-08-01T01:00:00.000Z",
  actionLog: {
    version: 2,
    actions: [
      {
        type: "answer-question",
        questionRevisionId: "scout-foundation-0",
        optionId: "choice-1",
        elapsedMs: 1000
      }
    ]
  }
};

/** @param {unknown} body @param {Record<string, string>} [headers] */
function request(body, headers = {}) {
  const input = /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (Readable.from([JSON.stringify(body)]))
  );
  input.method = "POST";
  input.url = OFFLINE_SUBMISSION_PATH;
  input.headers = headers;
  return input;
}

function response() {
  const headers = new Map();
  let payload = "";
  const output = /** @type {import("node:http").ServerResponse} */ (
    /** @type {unknown} */ ({
      statusCode: 0,
      setHeader(
        /** @type {string} */ name,
        /** @type {string | number | string[]} */ value
      ) {
        headers.set(name.toLowerCase(), value);
      },
      end(value = "") {
        payload = String(value);
      }
    })
  );
  return { output, headers, body: () => JSON.parse(payload) };
}

function createHarness({ outcome = {} } = {}) {
  /** @type {(value: Record<string, unknown>) => Promise<{ status: "accepted" | "rejected" | "expired" | "invalid", duplicate: boolean, result?: Record<string, unknown>, reason?: string }>} */
  const submit = vi.fn(async () => ({
    status: /** @type {const} */ ("accepted"),
    duplicate: false,
    result: {
      status: /** @type {const} */ ("won"),
      seed: "MOSS-WATCH-11",
      score: 900,
      moves: 12,
      elapsedMs: 30000,
      journalEvents: [
        {
          questionId: "scout-foundation-0",
          topicId: "reading",
          learningObjectiveId: "main-idea",
          difficultyBand: "foundation",
          outcome: /** @type {const} */ ("correct")
        }
      ]
    },
    ...outcome
  }));
  const handler = createOfflineSubmissionHandler({
    getUserId: async () => "user_01MOSS",
    submit,
  });
  return { handler, submit };
}

describe("Offline Continuity submission route", () => {
  it("submits an authenticated package and returns only coarse replay facts", async () => {
    const harness = createHarness();
    const result = response();

    await harness.handler(request(SUBMISSION), result.output);

    expect(result.output.statusCode).toBe(200);
    expect(harness.submit).toHaveBeenCalledWith({
      ...SUBMISSION,
      playerId: "user_01MOSS"
    });
    expect(result.body()).toEqual({
      status: "accepted",
      duplicate: false,
      result: {
        status: "won",
        seed: "MOSS-WATCH-11",
        score: 900,
        moves: 12,
        elapsedMs: 30000
      }
    });
    expect(JSON.stringify(result.body())).not.toContain("questionRevisionId");
    expect(JSON.stringify(result.body())).not.toContain("optionId");
  });

  it("returns terminal replay outcomes without turning them into transport errors", async () => {
    const harness = createHarness({
      outcome: {
        status: "rejected",
        duplicate: false,
        result: undefined,
        reason: "replay"
      }
    });
    const result = response();

    await harness.handler(request(SUBMISSION), result.output);

    expect(result.output.statusCode).toBe(200);
    expect(result.body()).toEqual({
      status: "rejected",
      duplicate: false,
      reason: "replay"
    });
  });

  it("fails closed for unauthenticated, Classroom, malformed, and unsupported requests", async () => {
    const unauthenticated = response();
    await createOfflineSubmissionHandler({
      getUserId: async () => null,
      submit: vi.fn()
    })(request(SUBMISSION), unauthenticated.output);
    expect(unauthenticated.output.statusCode).toBe(401);

    const classroom = response();
    const harness = createHarness();
    await harness.handler(
      request(SUBMISSION, { "x-echo-maze-classroom-id": "org_classroom" }),
      classroom.output
    );
    expect(classroom.output.statusCode).toBe(403);
    expect(harness.submit).not.toHaveBeenCalled();

    const malformed = response();
    await harness.handler(
      request({ ...SUBMISSION, deviceInstallationHash: "short" }),
      malformed.output
    );
    expect(malformed.output.statusCode).toBe(400);

    const unsupported = response();
    const getRequest = request(SUBMISSION);
    getRequest.method = "GET";
    await harness.handler(getRequest, unsupported.output);
    expect(unsupported.output.statusCode).toBe(405);
    expect(unsupported.headers.get("allow")).toBe("POST");
  });

  it("preserves the package when the service has a transport failure", async () => {
    const handler = createOfflineSubmissionHandler({
      getUserId: async () => "user_01MOSS",
      submit: vi.fn(async () => {
        throw new Error("database temporarily unavailable");
      })
    });
    const result = response();

    await handler(request(SUBMISSION), result.output);

    expect(result.output.statusCode).toBe(503);
    expect(result.body()).toEqual({
      error: "Offline Run submission is temporarily unavailable."
    });
  });
});
