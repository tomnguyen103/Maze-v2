import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createFunnelStore } from "../server/funnel-store.js";
import { createRunAccessHandler } from "../server/run-access-route.js";
import { CAMPAIGN_CODES, campaignCodeFor } from "../shared/campaign-codes.js";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0";
const METERED = Object.freeze({
  allowed: true,
  degraded: false,
  limit: 60,
  remaining: 59,
  retryAfterSeconds: 0
});

/**
 * @param {(
 *   request: import("node:http").IncomingMessage,
 *   response: import("node:http").ServerResponse,
 *   next: (() => void) | undefined
 * ) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) =>
    handler(request, response, undefined)
  );
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

/**
 * @param {{
 *   recordVisit?: import("vitest").Mock<(campaign: string) => Promise<void>>,
 *   rateLimit?: import("../server/rate-limit-request.js").RateLimit
 * }} [options]
 */
function visitHandler({
  recordVisit = vi.fn(async () => {}),
  rateLimit = vi.fn(async () => ({ ...METERED }))
} = {}) {
  const getUserId = vi.fn(() => null);
  const handler = createRunAccessHandler({
    store: { getAccess: vi.fn(), authorizeRun: vi.fn() },
    funnelStore: { recordVisit },
    getUserId,
    rateLimit
  });
  return { getUserId, handler, recordVisit };
}

/**
 * @param {string} origin
 * @param {unknown} body
 * @param {string} [userAgent]
 */
function postVisit(origin, body, userAgent = BROWSER) {
  return fetch(`${origin}/api/access/visit`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

describe("Adult offer visit route", () => {
  it("US-09.1 counts an allowlisted Campaign Code and answers 204 without sign-in", async () => {
    const { getUserId, handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      const response = await postVisit(origin, { campaign: "newsletter" });
      expect(response.status).toBe(204);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    });
    expect(recordVisit).toHaveBeenCalledWith("newsletter");
    expect(getUserId).not.toHaveBeenCalled();
  });

  it("US-09.1 increments through the definer function with the Campaign Code only", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await createFunnelStore({ query }).recordVisit("partner");
    expect(query).toHaveBeenCalledWith("SELECT count_adult_offer_visit($1)", [
      "partner"
    ]);
  });

  it("US-09.2 counts a missing or unknown code under the empty campaign and never stores the raw value", async () => {
    const { handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      for (const body of [
        {},
        { campaign: "spring-sale" },
        { campaign: "https://example.test/?ref=parent@example.test" },
        { campaign: 7 },
        null
      ]) {
        expect((await postVisit(origin, body)).status).toBe(204);
      }
    });
    expect(recordVisit.mock.calls).toEqual([[""], [""], [""], [""], [""]]);
  });

  it("US-09.2 normalizes the case and spacing of an allowlisted code", () => {
    expect(campaignCodeFor("  YouTube ")).toBe("youtube");
    expect(campaignCodeFor("you tube")).toBe("");
    expect(campaignCodeFor(null)).toBe("");
    // The database CHECK accepts exactly this shape.
    expect(CAMPAIGN_CODES.every((code) => /^[a-z0-9-]{1,32}$/.test(code))).toBe(true);
    expect(Object.isFrozen(CAMPAIGN_CODES)).toBe(true);
  });

  it("US-09.3 drops extra body fields", async () => {
    const { handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      const response = await postVisit(origin, {
        campaign: "reddit",
        email: "parent@example.test",
        url: "https://example.test/landing"
      });
      expect(response.status).toBe(204);
    });
    expect(recordVisit.mock.calls).toEqual([["reddit"]]);
  });

  it("US-09.3 answers a crawler, a link preview or an empty user agent with 204 and counts nothing", async () => {
    const { handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      for (const userAgent of [
        "Googlebot/2.1 (+http://www.google.com/bot.html)",
        "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
        "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
        "SiteBot2/1.0",
        "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
        "Mediapartners-Google",
        "Mozilla/5.0 PhantomJS/2.1.1",
        "NewRelicPinger/1.0",
        "Amazon-Route53-Health-Check-Service",
        "okhttp/4.12.0",
        "node-fetch/1.0",
        "axios/1.7.7",
        "Go-http-client/2.0",
        "facebookexternalhit/1.1",
        "Mozilla/5.0 HeadlessChrome/130.0",
        "Chrome-Lighthouse",
        ""
      ]) {
        expect(
          (await postVisit(origin, { campaign: "search" }, userAgent)).status
        ).toBe(204);
      }
    });
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it("US-09.3 counts a phone whose brand name ends in bot", async () => {
    const { handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      const response = await postVisit(
        origin,
        { campaign: "search" },
        "Mozilla/5.0 (Linux; Android 12; CUBOT X50) Chrome/130.0 Mobile"
      );
      expect(response.status).toBe(204);
    });
    expect(recordVisit.mock.calls).toEqual([["search"]]);
  });

  it("US-09.3 refuses a body over 4 KiB, invalid JSON and a non-POST method", async () => {
    const { handler, recordVisit } = visitHandler();

    await withServer(handler, async (origin) => {
      expect(
        (await postVisit(origin, { campaign: "x".repeat(5000) })).status
      ).toBe(400);
      expect((await postVisit(origin, "{")).status).toBe(400);
      const get = await fetch(`${origin}/api/access/visit`);
      expect(get.status).toBe(405);
      expect(get.headers.get("allow")).toBe("POST");
    });
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it("US-09.4 answers an over-budget caller with 429 before it reads the body", async () => {
    const rateLimit = vi.fn(async () => ({
      allowed: false,
      degraded: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 30
    }));
    const { handler, recordVisit } = visitHandler({ rateLimit });

    await withServer(handler, async (origin) => {
      const response = await postVisit(origin, "not json");
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("30");
    });
    expect(rateLimit).toHaveBeenCalledWith("access.visit", expect.anything(), null);
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it("US-09.4 counts nothing when the rate limit is unmetered", async () => {
    const rateLimit = vi.fn(async () => ({ ...METERED, degraded: true }));
    const { handler, recordVisit } = visitHandler({ rateLimit });

    await withServer(handler, async (origin) => {
      expect((await postVisit(origin, { campaign: "reddit" })).status).toBe(204);
    });
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it("US-09.5 answers 204 when the count fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler } = visitHandler({
      recordVisit: vi.fn(async () => {
        throw new Error("relation funnel_counts does not exist");
      })
    });

    try {
      await withServer(handler, async (origin) => {
        expect((await postVisit(origin, { campaign: "tiktok" })).status).toBe(204);
      });
      expect(error).toHaveBeenCalledWith("[access] visit count failed", {
        name: "Error"
      });
    } finally {
      error.mockRestore();
    }
  });
});
