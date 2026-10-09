import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createAdminHandler } from "../server/admin-route.js";
import { createPermissionGuard } from "../server/rbac.js";

const REPORT = Object.freeze({
  counts: [
    { day: "2026-10-01", metric: "adult_offer_visit", campaign: "youtube", count: 40 },
    { day: "2026-10-01", metric: "checkout_created", campaign: "", count: 3 }
  ],
  summary: {
    grossPurchases: 3,
    netPurchases: 1,
    refundedCount: 1,
    disputedCount: 1,
    refundedCents: 599
  }
});

/** @param {string} url */
function request(url) {
  const stream = new PassThrough();
  stream.end("");
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (
      Object.assign(stream, { method: "GET", url, headers: {}, socket: {} })
    )
  );
}

/**
 * @param {import("node:http").IncomingMessage} incoming
 * @param {ReturnType<typeof harness>["handler"]} handler
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
async function send(incoming, handler) {
  /** @type {Record<string, string>} */
  const headers = {};
  /** @type {(value: { statusCode: number, headers: Record<string, string>, body: string }) => void} */
  let settle = () => {};
  const finished = new Promise((resolve) => {
    settle = resolve;
  });
  const target = {
    statusCode: 200,
    /** @param {string} name @param {string} value */
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    /** @param {string} payload */
    end(payload) {
      settle({ statusCode: target.statusCode, headers, body: payload ?? "" });
    }
  };
  await handler(
    incoming,
    /** @type {import("node:http").ServerResponse} */ (
      /** @type {unknown} */ (target)
    )
  );
  return finished;
}

/**
 * @param {{
 *   role?: "admin" | "moderator" | "player" | null,
 *   report?: typeof REPORT
 * }} [options]
 */
function harness({ role = "admin", report = REPORT } = {}) {
  /** @type {Record<string, unknown>[]} */
  const audits = [];
  /** @type {unknown[]} */
  const reads = [];
  const handler = createAdminHandler({
    store: {
      /** @returns {Promise<{ previousRole: import("../shared/permissions.js").Role, role: string }>} */
      async setRole() {
        return { previousRole: "player", role: "player" };
      },
      /** @param {import("../server/admin-route.js").FunnelRange} range */
      async funnelReport(range) {
        reads.push(range);
        return structuredClone(report);
      }
    },
    requirePermission: createPermissionGuard({
      getUserId: () => (role === null ? null : "admin_1"),
      resolver: { roleFor: async () => role ?? "player" }
    }),
    recordAudit: async (_request, event) => {
      audits.push(event);
    }
  });
  return {
    audits,
    reads,
    handler,
    /** @param {string} url */
    get: (url) => send(request(url), handler)
  };
}

const RANGE = "from=2026-10-01&to=2026-10-07";

describe("Admin funnel export", () => {
  it("US-10.1 returns the daily counts and the Financial Fact summary for the range", async () => {
    const target = harness();

    const result = await target.get(`/api/admin/funnel?${RANGE}&mode=live`);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
      mode: "live",
      ...REPORT
    });
    expect(target.reads).toEqual([
      { from: "2026-10-01", to: "2026-10-07", mode: "live" }
    ]);
    expect(target.audits).toEqual([
      expect.objectContaining({
        action: "funnel.read",
        actorId: "admin_1",
        resource: { type: "funnel_counts", id: null }
      })
    ]);
  });

  it("US-10.2 reads test rows on request and live rows by default", async () => {
    const target = harness();

    await target.get(`/api/admin/funnel?${RANGE}&mode=test`);
    await target.get(`/api/admin/funnel?${RANGE}`);

    expect(target.reads).toEqual([
      { from: "2026-10-01", to: "2026-10-07", mode: "test" },
      { from: "2026-10-01", to: "2026-10-07", mode: "live" }
    ]);
  });

  it("US-10.2 accepts 366 days and rejects 367", async () => {
    const target = harness();

    const full = await target.get(
      "/api/admin/funnel?from=2028-01-01&to=2028-12-31"
    );
    const over = await target.get(
      "/api/admin/funnel?from=2026-01-01&to=2027-01-02"
    );

    expect(full.statusCode).toBe(200);
    expect(over.statusCode).toBe(400);
    expect(target.reads).toHaveLength(1);
  });

  it.each([
    ["no range", ""],
    ["a missing end", "from=2026-10-01"],
    ["a reversed range", "from=2026-10-07&to=2026-10-01"],
    ["a day the calendar lacks", "from=2026-02-30&to=2026-03-01"],
    ["a timestamp", "from=2026-10-01T00:00:00Z&to=2026-10-07"],
    ["an unknown mode", `${RANGE}&mode=all`],
    ["an unknown format", `${RANGE}&format=xlsx`]
  ])("US-10.2 rejects %s with 400 and reads nothing", async (_name, query) => {
    const target = harness();

    const result = await target.get(`/api/admin/funnel?${query}`);

    expect(result.statusCode).toBe(400);
    expect(target.reads).toEqual([]);
    expect(target.audits).toEqual([]);
  });

  it.each([
    ["a signed-out caller", null, 401],
    ["a player", "player", 403],
    ["a moderator", "moderator", 403]
  ])("US-10.3 gives %s no data", async (_name, role, status) => {
    const target = harness({
      role: /** @type {"player" | "moderator" | null} */ (role)
    });

    const result = await target.get(`/api/admin/funnel?${RANGE}`);

    expect(result.statusCode).toBe(status);
    expect(result.body).not.toContain("adult_offer_visit");
    expect(target.reads).toEqual([]);
  });

  it("US-10.4 answers two identical requests with identical bodies and one audit row each", async () => {
    const target = harness();
    const url = `/api/admin/funnel?${RANGE}&format=csv`;

    const first = await target.get(url);
    const second = await target.get(url);

    expect(second.body).toBe(first.body);
    expect(target.audits.map((event) => event.action)).toEqual([
      "funnel.read",
      "funnel.read"
    ]);
  });

  it("US-10.5 returns CSV with a header row and the summary rows", async () => {
    const target = harness();

    const result = await target.get(`/api/admin/funnel?${RANGE}&format=csv`);

    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(result.headers["content-disposition"]).toBe(
      'attachment; filename="funnel-live-2026-10-01-2026-10-07.csv"'
    );
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body.split("\r\n")).toEqual([
      "kind,day,metric,campaign,value",
      "count,2026-10-01,adult_offer_visit,youtube,40",
      "count,2026-10-01,checkout_created,,3",
      "summary,,gross_purchases,,3",
      "summary,,net_purchases,,1",
      "summary,,refunded_count,,1",
      "summary,,disputed_count,,1",
      "summary,,refunded_cents,,599",
      ""
    ]);
  });

  it("US-10.5 quotes special characters and lets no cell start a formula", async () => {
    const target = harness({
      report: {
        ...REPORT,
        counts: ["=cmd", "+1", "-2", "@sum", "\tx", 'a,"b"'].map(
          (campaign) => ({
            day: "2026-10-01",
            metric: "adult_offer_visit",
            campaign,
            count: 1
          })
        )
      }
    });

    const result = await target.get(`/api/admin/funnel?${RANGE}&format=csv`);
    const campaigns = result.body
      .split("\r\n")
      .slice(1, 7)
      .map((line) => line.slice("count,2026-10-01,adult_offer_visit,".length, -2));

    expect(campaigns).toEqual([
      "'=cmd",
      "'+1",
      "'-2",
      "'@sum",
      "'\tx",
      '"a,""b"""'
    ]);
  });

  it("US-10.5 answers 503 when the funnel store is absent", async () => {
    const handler = createAdminHandler({
      store: {
        /** @returns {Promise<{ previousRole: import("../shared/permissions.js").Role, role: string }>} */
        async setRole() {
          return { previousRole: "player", role: "player" };
        }
      },
      requirePermission: createPermissionGuard({
        getUserId: () => "admin_1",
        resolver: { roleFor: async () => "admin" }
      })
    });

    const result = await send(request(`/api/admin/funnel?${RANGE}`), handler);

    expect(result.statusCode).toBe(503);
  });
});
