import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import access from "../api/access.js";
import admin from "../api/admin.js";
import leaderboard from "../api/leaderboard.js";
import profile from "../api/profile.js";
import stripeWebhook from "../api/stripe-webhook.js";

describe("Vercel function budget", () => {
  it("keeps every API route within the Hobby deployment limit", async () => {
    const functionFiles = await filesUnder(
      new URL("../api/", import.meta.url)
    );
    // 12 is the Hobby ceiling. We are AT it: every later phase must route new
    // endpoints through an existing function via a vercel.json rewrite, the way
    // /api/admin/* and /api/access/* already do, rather than adding a file.
    expect(functionFiles).toHaveLength(12);
    expect(functionFiles.length).toBeLessThanOrEqual(12);

    const config = JSON.parse(
      await readFile(
        new URL("../vercel.json", import.meta.url),
        "utf8"
      )
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/access/config",
          destination: "/api/access?_accessRoute=config"
        },
        {
          source: "/api/access/runs",
          destination: "/api/access?_accessRoute=runs"
        },
        {
          source: "/api/access/guest-runs",
          destination: "/api/access?_accessRoute=guest-runs"
        },
        {
          source: "/api/admin/:adminPath*",
          destination: "/api/admin?_adminPath=:adminPath*"
        },
        {
          source: "/api/daily/leaderboard",
          destination: "/api/leaderboard?_dailyRoute=leaderboard"
        },
        {
          source: "/api/daily/scores",
          destination: "/api/leaderboard?_dailyRoute=scores"
        },
        {
          source: "/api/daily/constellation",
          destination: "/api/leaderboard?_dailyRoute=constellation"
        }
      ])
    );
  });

  // arrayContaining above cannot notice a path that was added to the handler
  // and never rewritten, which is exactly how a new Daily endpoint reaches
  // production as a 404. Derive the expectation from the handler instead.
  it("rewrites every Daily path the handler answers", async () => {
    const [{ DAILY_PATHS }, config] = await Promise.all([
      import("../server/daily-route.js"),
      readFile(new URL("../vercel.json", import.meta.url), "utf8").then(
        (text) => JSON.parse(text)
      )
    ]);

    const rewritten = new Set(
      config.rewrites
        .filter((/** @type {{ source: string }} */ rewrite) =>
          rewrite.source.startsWith("/api/daily/")
        )
        .map((/** @type {{ source: string }} */ rewrite) => rewrite.source)
    );
    expect([...DAILY_PATHS].sort()).toEqual([...rewritten].sort());
  });

  it("routes the verified Daily namespace through the leaderboard function", async () => {
    for (const [incoming, expectedUrl, expectedStatus] of [
      [
        "/api/leaderboard?_dailyRoute=leaderboard",
        "/api/daily/leaderboard",
        200
      ],
      [
        "/api/leaderboard?_dailyRoute=../secret",
        "/api/leaderboard?_dailyRoute=../secret",
        404
      ]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "GET", url: incoming, headers: {} })
      );
      /** @type {(status: number) => void} */
      let settle = () => {};
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          statusCode: 0,
          setHeader() {},
          on() {},
          end() {
            settle(response.statusCode);
          }
        })
      );
      await leaderboard(request, response);
      expect(request.url).toBe(expectedUrl);
      await expect(finished).resolves.toBe(expectedStatus);
    }
  });

  it("normalizes every admin path, including a bare /api/admin", async () => {
    // Without the trailing slash the router misses isAdminPath, calls next?.()
    // with no callback in a serverless function, and hangs until the platform
    // timeout instead of answering 401.
    for (const [incoming, expected] of [
      ["/api/admin?_adminPath=users/user_1/role", "/api/admin/users/user_1/role"],
      ["/api/admin", "/api/admin/"],
      ["/api/admin?_adminPath=", "/api/admin/"]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "POST", url: incoming, headers: {} })
      );
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          end() {},
          setHeader() {},
          on() {},
          statusCode: 0
        })
      );
      await admin(request, response);
      expect(request.url).toBe(expected);
      // Answered, not passed along: a serverless function has no next handler.
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it("routes the internal namespace through the stripe-webhook function", async () => {
    // At the 12-function Hobby ceiling, a new endpoint has to share an existing
    // function. This asserts the rewrite and the shim agree on the path shape.
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/internal/:internalPath*",
          destination: "/api/stripe-webhook?_internalPath=:internalPath*"
        }
      ])
    );
    expect(config.crons).toEqual([
      { path: "/api/internal/webhook-retry", schedule: "0 3 * * *" }
    ]);

    const request = /** @type {import("node:http").IncomingMessage} */ (
      /** @type {unknown} */ ({
        method: "POST",
        url: "/api/stripe-webhook?_internalPath=webhook-retry",
        headers: {}
      })
    );
    // The router dispatches async handlers with `void`, so the shim's return
    // resolves before the response is written. Wait for `end` instead.
    /** @type {(status: number) => void} */
    let settle = () => {};
    const finished = new Promise((resolve) => {
      settle = resolve;
    });
    const captured = { statusCode: 0 };
    const response = /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ ({
        statusCode: 0,
        setHeader() {},
        on() {},
        end() {
          settle(captured.statusCode || response.statusCode);
        }
      })
    );
    await stripeWebhook(request, response);
    expect(request.url).toBe("/api/internal/webhook-retry");
    // Answered, not passed along: without CRON_SECRET the endpoint closes.
    await expect(finished).resolves.toBeGreaterThanOrEqual(400);
  });

  it("routes the health namespace through the leaderboard function", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/health",
          destination: "/api/leaderboard?_healthRoute=health"
        },
        {
          source: "/api/ready",
          destination: "/api/leaderboard?_healthRoute=ready"
        }
      ])
    );

    for (const [incoming, expectedUrl, expectedStatus] of [
      ["/api/leaderboard?_healthRoute=health", "/api/health", 200],
      // The rewritten value is attacker-controlled: anything unknown must be
      // answered, never fall through to a next?.() that does not exist.
      ["/api/leaderboard?_healthRoute=../secret", "/api/leaderboard?_healthRoute=../secret", 404]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "GET", url: incoming, headers: {} })
      );
      /** @type {(status: number) => void} */
      let settle = () => {};
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          statusCode: 0,
          setHeader() {},
          on() {},
          end() {
            settle(response.statusCode);
          }
        })
      );
      await leaderboard(request, response);
      expect(request.url).toBe(expectedUrl);
      await expect(finished).resolves.toBe(expectedStatus);
    }
  });

  it("routes the personal-data namespace through the profile function", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/me/export",
          destination: "/api/profile?_meRoute=export"
        },
        {
          source: "/api/me/settings",
          destination: "/api/profile?_meRoute=settings"
        }
      ])
    );

    for (const [incoming, expectedUrl, expectedStatus] of [
      // 503, not a hang: this shim runs without DATABASE_URL in unit tests.
      ["/api/profile?_meRoute=export", "/api/me/export", 503],
      ["/api/profile?_meRoute=settings", "/api/me/settings", 503],
      // The rewritten value is attacker-controlled: anything unknown must be
      // answered, never fall through to a next?.() that does not exist.
      [
        "/api/profile?_meRoute=../secret",
        "/api/profile?_meRoute=../secret",
        404
      ]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "GET", url: incoming, headers: {} })
      );
      /** @type {(status: number) => void} */
      let settle = () => {};
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          statusCode: 0,
          setHeader() {},
          on() {},
          end() {
            settle(response.statusCode);
          }
        })
      );
      await profile(request, response);
      expect(request.url).toBe(expectedUrl);
      await expect(finished).resolves.toBe(expectedStatus);
    }
  });

  it("routes the Classroom namespace through the profile function", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/classrooms",
          destination: "/api/profile?_classroomRoute=root"
        },
        {
          source: "/api/classrooms/:classroomPath*",
          destination: "/api/profile?_classroomRoute=:classroomPath*"
        }
      ])
    );

    for (const [incoming, expectedUrl, expectedStatus] of [
      [
        "/api/profile?_classroomRoute=root",
        "/api/classrooms",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/progress",
        "/api/classrooms/org_class_1/progress",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/domain",
        "/api/classrooms/org_class_1/domain",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions",
        "/api/classrooms/org_class_1/expeditions",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/status",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/status",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/license",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/license",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/capacity",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/capacity",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/grants",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/grants",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/grants/outcome",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/grants/outcome",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/exped_abc123/progress",
        "/api/classrooms/org_class_1/expeditions/exped_abc123/progress",
        503
      ],
      [
        "/api/profile?_classroomRoute=org_class_1/expeditions/../../secret",
        "/api/profile?_classroomRoute=org_class_1/expeditions/../../secret",
        404
      ],
      [
        "/api/profile?_classroomRoute=../secret",
        "/api/profile?_classroomRoute=../secret",
        404
      ]
    ]) {
      const request = /** @type {import("node:http").IncomingMessage} */ (
        /** @type {unknown} */ ({ method: "GET", url: incoming, headers: {} })
      );
      /** @type {(status: number) => void} */
      let settle = () => {};
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      const response = /** @type {import("node:http").ServerResponse} */ (
        /** @type {unknown} */ ({
          statusCode: 0,
          setHeader() {},
          on() {},
          end() {
            settle(response.statusCode);
          }
        })
      );
      await profile(request, response);
      expect(request.url).toBe(expectedUrl);
      await expect(finished).resolves.toBe(expectedStatus);
    }
  });

  it("restores the public nested Access path before server routing", async () => {
    const request = /** @type {import("node:http").IncomingMessage} */ (
      /** @type {unknown} */ ({
        method: "GET",
        url: "/api/access?_accessRoute=config",
        headers: {}
      })
    );
    const response = /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ ({
        end() {},
        setHeader() {},
        on() {},
        statusCode: 0
      })
    );

    await access(request, response);

    expect(request.url).toBe("/api/access/config");
    expect(response.statusCode).toBe(200);
  });

  it("restores the public guest Access path before server routing", async () => {
    const request = /** @type {import("node:http").IncomingMessage} */ (
      /** @type {unknown} */ ({
        method: "POST",
        url: "/api/access?_accessRoute=guest-runs",
        headers: {},
        socket: {}
      })
    );
    const response = /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ ({
        end() {},
        setHeader() {},
        on() {},
        statusCode: 0
      })
    );

    await access(request, response);

    expect(request.url).toBe("/api/access/guest-runs");
  });
});

/** @param {URL} directory @returns {Promise<string[]>} */
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  /** @type {string[][]} */
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesUnder(new URL(`${entry.name}/`, directory))
        : Promise.resolve([entry.name])
    )
  );
  return nested.flat();
}
