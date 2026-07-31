import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createDailyHandler } from "../server/daily-route.js";
import { createConstellationStore } from "../server/constellation-store.js";
import { collectTrailMarkers } from "../server/constellation-markers.js";
import { verifyRunReplay } from "../server/run-replay.js";
import { getDailyQuestion } from "../src/game/daily-labyrinth.js";
import {
  DAILY_REPLAY_CONFIG,
  DAILY_REPLAY_FIXTURE,
  DAILY_REPLAY_RESULT,
  dailyWinningLog
} from "./helpers/daily-replay-fixture.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const IDEMPOTENCY_KEY = "daily_01J1MOSSWATCH";

function submission() {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    contract: DAILY_REPLAY_FIXTURE,
    actionLog: dailyWinningLog(),
    claimed: {
      status: DAILY_REPLAY_RESULT.status,
      score: DAILY_REPLAY_RESULT.score,
      wardensDefeated: DAILY_REPLAY_RESULT.wardensDefeated,
      echoesCollected: DAILY_REPLAY_RESULT.echoesCollected,
      moves: DAILY_REPLAY_RESULT.moves,
      elapsedMs: DAILY_REPLAY_RESULT.elapsedMs
    }
  };
}

function createStore() {
  return {
    async getLeaderboard() {
      return [];
    },
    async submitVerifiedEntry() {
      return {
        duplicate: false,
        improved: true,
        bestResult: /** @type {const} */ ("created"),
        entry: { username: "Moss Runner", score: 900, moves: 76 }
      };
    }
  };
}

/**
 * @param {ReturnType<typeof createDailyHandler>} handler
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

/** @param {Record<string, unknown>} [overrides] */
function handlerWith(overrides = {}) {
  return createDailyHandler({
    store: createStore(),
    now: () => NOW,
    getUserId: (request) => {
      const value = request.headers["x-test-user"];
      return typeof value === "string" ? value : null;
    },
    getProfile: async (userId) =>
      userId === "user_123" ? { username: "Moss Runner" } : null,
    ...overrides
  });
}

/**
 * @param {string} origin
 * @param {Record<string, string>} [headers]
 */
async function postSubmission(origin, headers = { "x-test-user": "user_123" }) {
  return fetch(`${origin}/api/daily/scores`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(submission())
  });
}

function fakePool(rows = { contributed: true, contributor_count: 10, published_contributor_count: 0 }) {
  /** @type {{ sql: string, values: unknown[] | undefined }[]} */
  const statements = [];
  const client = {
    /** @param {string} sql @param {unknown[]} [values] */
    query: vi.fn(async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes("record_daily_trail_contribution")) {
        return { rows: [rows] };
      }
      return { rows: [] };
    }),
    release: vi.fn()
  };
  return {
    statements,
    client,
    pool: { connect: async () => client, query: client.query }
  };
}

describe("Constellation trail markers", () => {
  it("derives cell, passage, and Pulse markers from a replayed escape", () => {
    /** @type {ReturnType<typeof collectTrailMarkers>} */
    const collector = collectTrailMarkers();
    verifyRunReplay(dailyWinningLog(), {
      seed: DAILY_REPLAY_FIXTURE.seed,
      config: DAILY_REPLAY_CONFIG,
      questionFor: (index) => getDailyQuestion(DAILY_REPLAY_FIXTURE, index),
      onStep: collector.observe
    });

    const markers = collector.markers();
    expect(markers.length).toBeGreaterThan(0);
    expect(new Set(markers.map((marker) => marker.kind))).toEqual(
      new Set(["cell", "passage"])
    );
    for (const marker of markers) {
      expect(Object.keys(marker).sort()).toEqual(["kind", "x", "y"]);
      expect(marker.x).toBeGreaterThanOrEqual(0);
      expect(marker.y).toBeGreaterThanOrEqual(0);
      expect(marker.x).toBeLessThanOrEqual(63);
      expect(marker.y).toBeLessThanOrEqual(63);
    }
  });

  it("records one marker per position however often it is revisited", () => {
    const collector = collectTrailMarkers();
    const run = { explorer: { row: 1, col: 1 } };
    collector.observe(run, null);
    collector.observe(run, { type: "move" });
    collector.observe(run, { type: "pulse" });
    collector.observe(run, { type: "pulse" });

    expect(collector.markers()).toEqual([
      { kind: "cell", x: 1, y: 1 },
      { kind: "pulse", x: 1, y: 1 }
    ]);
  });

  it("drops a position outside the counter's bounded grid", () => {
    const collector = collectTrailMarkers();
    collector.observe({ explorer: { row: 64, col: 1 } }, null);
    collector.observe({ explorer: { row: 1, col: -1 } }, null);

    expect(collector.markers()).toEqual([]);
  });
});

describe("Constellation aggregation store", () => {
  it("publishes a new batch only when the batch threshold is reached", async () => {
    const reached = fakePool({
      contributed: true,
      contributor_count: 10,
      published_contributor_count: 0
    });
    await createConstellationStore(reached.pool).recordContribution(
      "user_123",
      "2026-07-26",
      [{ kind: "cell", x: 1, y: 1 }]
    );

    const short = fakePool({
      contributed: true,
      contributor_count: 9,
      published_contributor_count: 0
    });
    await createConstellationStore(short.pool).recordContribution(
      "user_123",
      "2026-07-26",
      [{ kind: "cell", x: 1, y: 1 }]
    );

    expect(
      reached.statements.some(({ sql }) =>
        sql.includes("publish_daily_trail_batch")
      )
    ).toBe(true);
    expect(
      short.statements.some(({ sql }) =>
        sql.includes("publish_daily_trail_batch")
      )
    ).toBe(false);
  });

  it("leaves counters untouched on a second escape by the same Explorer", async () => {
    const repeat = fakePool({
      contributed: false,
      contributor_count: 30,
      published_contributor_count: 30
    });

    await expect(
      createConstellationStore(repeat.pool).recordContribution(
        "user_123",
        "2026-07-26",
        [{ kind: "cell", x: 1, y: 1 }]
      )
    ).resolves.toEqual({ contributed: false });
    expect(
      repeat.statements.some(({ sql }) =>
        sql.includes("publish_daily_trail_batch")
      )
    ).toBe(false);
  });

  it("sends markers only, never the Run Action Log", async () => {
    const recording = fakePool();
    await createConstellationStore(recording.pool).recordContribution(
      "user_123",
      "2026-07-26",
      [{ kind: "cell", x: 1, y: 1 }]
    );

    const sent = JSON.stringify(recording.statements);
    expect(sent).not.toContain("actions");
    expect(sent).not.toContain("elapsedMs");
    expect(sent).toContain("record_daily_trail_contribution");
  });
});

describe("Constellation aggregation on the Daily verification path", () => {
  it("aggregates a verified escape with the log in request memory only", async () => {
    /** @type {unknown[]} */
    const auditPayloads = [];
    const recordContribution = vi.fn(
      /**
       * @param {string} _userId
       * @param {string} _date
       * @param {import("../server/constellation-markers.js").TrailMarker[]} _markers
       */
      async (_userId, _date, _markers) => {
        void _userId;
        void _date;
        void _markers;
        return { contributed: true };
      }
    );
    /** @type {unknown[]} */
    const logLines = [];
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => logLines.push(args));

    await withServer(
      handlerWith({
        constellation: { recordContribution },
        recordAudit: async (
          /** @type {unknown} */ _request,
          /** @type {unknown} */ entry
        ) => {
          auditPayloads.push(entry);
        }
      }),
      async (origin) => {
        const response = await postSubmission(origin);
        expect(response.status).toBe(201);
      }
    );
    errorSpy.mockRestore();

    expect(recordContribution).toHaveBeenCalledOnce();
    const [userId, date, markers] = recordContribution.mock.calls[0];
    expect(userId).toBe("user_123");
    expect(date).toBe("2026-07-26");
    expect(Array.isArray(markers)).toBe(true);
    const sent = JSON.stringify({ markers, auditPayloads, logLines });
    expect(sent).not.toContain("actions");
    expect(sent).not.toContain("answer-question");
    expect(sent).not.toContain("skip-question");
  });

  it("aggregates nothing when no Explorer identity signed the submission", async () => {
    const recordContribution = vi.fn(async () => ({ contributed: true }));

    await withServer(
      handlerWith({ constellation: { recordContribution } }),
      async (origin) => {
        const response = await postSubmission(origin, {});
        expect(response.status).toBe(401);
      }
    );

    expect(recordContribution).not.toHaveBeenCalled();
  });

  it("aggregates nothing when the replay is rejected", async () => {
    const recordContribution = vi.fn(async () => ({ contributed: true }));

    await withServer(
      handlerWith({ constellation: { recordContribution } }),
      async (origin) => {
        const response = await fetch(`${origin}/api/daily/scores`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-test-user": "user_123"
          },
          body: JSON.stringify({
            ...submission(),
            actionLog: { version: 1, actions: [{ type: "pulse", elapsedMs: 1 }] }
          })
        });
        expect(response.status).toBe(400);
      }
    );

    expect(recordContribution).not.toHaveBeenCalled();
  });

  it("never fails the Daily submission it rides on", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await withServer(
      handlerWith({
        constellation: {
          recordContribution: async () => {
            throw new Error("constellation unavailable");
          }
        }
      }),
      async (origin) => {
        const response = await postSubmission(origin);
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({
          verification: "verified-replay-v1"
        });
      }
    );

    errorSpy.mockRestore();
  });
});

describe("Constellation projection endpoint", () => {
  it("serves band labels for the current Daily and nothing countable", async () => {
    const projection = {
      published: true,
      markers: [
        { kind: /** @type {const} */ ("cell"), x: 1, y: 1, band: /** @type {const} */ ("bright") },
        { kind: /** @type {const} */ ("pulse"), x: 3, y: 5, band: /** @type {const} */ ("quiet") }
      ]
    };

    await withServer(
      handlerWith({
        constellation: {
          recordContribution: async () => ({ contributed: true }),
          readProjection: async () => projection
        }
      }),
      async (origin) => {
        const response = await fetch(`${origin}/api/daily/constellation`);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
          date: "2026-07-26",
          published: true,
          markers: projection.markers
        });
        expect(JSON.stringify(body)).not.toMatch(
          /count|percent|username|player|elapsed/i
        );
      }
    );
  });

  it("reports a forming Constellation rather than failing", async () => {
    await withServer(
      handlerWith({
        constellation: {
          recordContribution: async () => ({ contributed: true }),
          readProjection: async () => ({ published: false, markers: [] })
        }
      }),
      async (origin) => {
        const response = await fetch(`${origin}/api/daily/constellation`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          date: "2026-07-26",
          published: false,
          markers: []
        });
      }
    );
  });

  it("refuses a method other than GET", async () => {
    await withServer(
      handlerWith({
        constellation: {
          recordContribution: async () => ({ contributed: true }),
          readProjection: async () => ({ published: false, markers: [] })
        }
      }),
      async (origin) => {
        const response = await fetch(`${origin}/api/daily/constellation`, {
          method: "POST"
        });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET");
      }
    );
  });
});
