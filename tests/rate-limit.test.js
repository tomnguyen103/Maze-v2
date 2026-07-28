import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  rateLimitKey,
  RATE_LIMIT_BUDGETS,
  windowStartFor
} from "../server/rate-limit.js";

/**
 * In-memory stand-in for the atomic `INSERT ... ON CONFLICT` upsert. It applies
 * the same window-reset rule the SQL does, so the limiter's arithmetic is under
 * test rather than the driver's.
 *
 * @param {{ fail?: boolean }} [options]
 */
function createFakeStore(options = {}) {
  /** @type {Map<string, { windowStart: string, count: number }>} */
  const rows = new Map();
  /** @type {{ key: string, windowStart: string }[]} */
  const calls = [];
  return {
    rows,
    calls,
    /**
     * @param {string} key
     * @param {string} windowStart
     */
    async increment(key, windowStart) {
      calls.push({ key, windowStart });
      if (options.fail) {
        throw new Error("database unreachable");
      }
      const existing = rows.get(key);
      if (!existing) {
        rows.set(key, { windowStart, count: 1 });
        return { count: 1, windowStart };
      }
      // Mirrors the SQL: reset only when the stored window is strictly older,
      // and take GREATEST so a late request cannot rewind the window.
      const settled =
        existing.windowStart > windowStart ? existing.windowStart : windowStart;
      const count = existing.windowStart < windowStart ? 1 : existing.count + 1;
      rows.set(key, { windowStart: settled, count });
      return { count, windowStart: settled };
    }
  };
}

describe("RATE_LIMIT_BUDGETS", () => {
  it("matches the budgets the plan specifies", () => {
    expect(RATE_LIMIT_BUDGETS["guest-run.start"]).toEqual({
      limit: 20,
      windowMs: 60_000
    });
    expect(RATE_LIMIT_BUDGETS["question.fetch"]).toEqual({
      limit: 30,
      windowMs: 60_000
    });
    expect(RATE_LIMIT_BUDGETS["score.submit"]).toEqual({
      limit: 10,
      windowMs: 60_000
    });
    expect(RATE_LIMIT_BUDGETS["lifetime.checkout"]).toEqual({
      limit: 5,
      windowMs: 60_000
    });
    expect(RATE_LIMIT_BUDGETS["profile.write"]).toEqual({
      limit: 10,
      windowMs: 60_000
    });
    expect(RATE_LIMIT_BUDGETS["export.self"]).toEqual({
      limit: 2,
      windowMs: 3_600_000
    });
    expect(RATE_LIMIT_BUDGETS["classroom.create"]).toEqual({
      limit: 3,
      windowMs: 3_600_000
    });
    expect(RATE_LIMIT_BUDGETS["classroom.domain"]).toEqual({
      limit: 5,
      windowMs: 3_600_000
    });
    expect(RATE_LIMIT_BUDGETS["classroom.invite"]).toEqual({
      limit: 20,
      windowMs: 3_600_000
    });
  });

  it("keeps every budget protective rather than punitive", () => {
    for (const budget of Object.values(RATE_LIMIT_BUDGETS)) {
      expect(budget.limit).toBeGreaterThan(1);
      expect(budget.windowMs).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe("windowStartFor", () => {
  it("floors a timestamp to the start of its fixed window", () => {
    expect(
      windowStartFor(Date.parse("2026-07-26T12:00:41.500Z"), 60_000)
    ).toBe("2026-07-26T12:00:00.000Z");
  });

  it("returns the same bucket for two calls inside one window", () => {
    expect(windowStartFor(Date.parse("2026-07-26T12:00:01Z"), 60_000)).toBe(
      windowStartFor(Date.parse("2026-07-26T12:00:59Z"), 60_000)
    );
  });

  it("returns a new bucket once the window rolls over", () => {
    expect(windowStartFor(Date.parse("2026-07-26T12:00:59Z"), 60_000)).not.toBe(
      windowStartFor(Date.parse("2026-07-26T12:01:00Z"), 60_000)
    );
  });

  it("handles an hourly window", () => {
    expect(
      windowStartFor(Date.parse("2026-07-26T12:59:59Z"), 3_600_000)
    ).toBe("2026-07-26T12:00:00.000Z");
  });
});

describe("rateLimitKey", () => {
  it("scopes a signed-in caller by user id", () => {
    expect(rateLimitKey("score.submit", { userId: "user_1" })).toBe(
      "score.submit:user:user_1"
    );
  });

  it("scopes a guest by address hash, never by raw address", () => {
    const key = rateLimitKey("question.fetch", { addressHash: "a".repeat(64) });
    expect(key).toBe(`question.fetch:ip:${"a".repeat(64)}`);
    expect(key).not.toContain("203.0.113");
  });

  it("prefers the user id when both are available", () => {
    expect(
      rateLimitKey("score.submit", {
        userId: "user_1",
        addressHash: "a".repeat(64)
      })
    ).toBe("score.submit:user:user_1");
  });

  it("returns null when the caller cannot be identified at all", () => {
    expect(rateLimitKey("question.fetch", {})).toBeNull();
  });
});

describe("createRateLimiter", () => {
  /** @param {{ store: ReturnType<typeof createFakeStore>, now?: () => number }} options */
  const limiterWith = ({ store, now = () => Date.parse("2026-07-26T12:00:10Z") }) =>
    createRateLimiter({ store, now, onLimited: () => {} });

  it("admits requests up to the budget and reports what is left", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    const first = await limiter.consume("lifetime.checkout", {
      userId: "user_1"
    });
    expect(first).toMatchObject({ allowed: true, limit: 5, remaining: 4 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    const fifth = await limiter.consume("lifetime.checkout", {
      userId: "user_1"
    });
    expect(fifth).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("rejects the request past the budget with the seconds until the window resets", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    const blocked = await limiter.consume("lifetime.checkout", {
      userId: "user_1"
    });
    expect(blocked).toMatchObject({
      allowed: false,
      limit: 5,
      remaining: 0,
      retryAfterSeconds: 50
    });
  });

  it("always reports at least one second of wait", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({
      store,
      now: () => Date.parse("2026-07-26T12:00:59.900Z")
    });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    const blocked = await limiter.consume("lifetime.checkout", {
      userId: "user_1"
    });
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("lets the next window through after rollover", async () => {
    const store = createFakeStore();
    let clock = Date.parse("2026-07-26T12:00:10Z");
    const limiter = createRateLimiter({
      store,
      now: () => clock,
      onLimited: () => {}
    });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    await expect(
      limiter.consume("lifetime.checkout", { userId: "user_1" })
    ).resolves.toMatchObject({ allowed: false });
    clock = Date.parse("2026-07-26T12:01:00Z");
    await expect(
      limiter.consume("lifetime.checkout", { userId: "user_1" })
    ).resolves.toMatchObject({ allowed: true, remaining: 4 });
  });

  it("keeps separate budgets and separate callers independent", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    await expect(
      limiter.consume("lifetime.checkout", { userId: "user_2" })
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      limiter.consume("profile.write", { userId: "user_1" })
    ).resolves.toMatchObject({ allowed: true });
  });

  it("counts concurrent requests exactly once each", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        limiter.consume("profile.write", { userId: "user_1" })
      )
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(2);
    expect(store.rows.get("profile.write:user:user_1")?.count).toBe(12);
  });

  it("fails open when the counter store is unreachable", async () => {
    const store = createFakeStore({ fail: true });
    /** @type {unknown[]} */
    const failures = [];
    const limiter = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:00:10Z"),
      onLimited: () => {},
      onFailure: (details) => failures.push(details)
    });
    await expect(
      limiter.consume("profile.write", { userId: "user_1" })
    ).resolves.toMatchObject({ allowed: true, degraded: true });
    expect(failures).toEqual([{ budget: "profile.write", name: "Error" }]);
  });

  it("admits an unidentifiable caller rather than blocking all of them together", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    await expect(
      limiter.consume("question.fetch", {})
    ).resolves.toMatchObject({ allowed: true, degraded: true });
    expect(store.calls).toEqual([]);
  });

  it("reports a rejection once, as a product event, with no caller identity", async () => {
    const store = createFakeStore();
    /** @type {Record<string, unknown>[]} */
    const limited = [];
    const limiter = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:00:10Z"),
      onLimited: (details) => limited.push(details)
    });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await limiter.consume("lifetime.checkout", { userId: "user_1" });
    }
    expect(limited).toEqual([
      { budget: "lifetime.checkout", scope: "user" }
    ]);
    expect(JSON.stringify(limited)).not.toContain("user_1");
  });

  it("admits a full budget instantly at the start of a window", async () => {
    // The spec calls this a fixed-window-with-burst counter: the whole budget is
    // spendable at once, which is what makes normal bursty play safe.
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        limiter.consume("profile.write", { userId: "user_1" })
      )
    );
    expect(results.every((result) => result.allowed)).toBe(true);
  });

  it("allows two budgets to cross one window boundary", async () => {
    // The accepted cost of a fixed window. Documented in ADR 0014.
    const store = createFakeStore();
    let clock = Date.parse("2026-07-26T12:00:59Z");
    const limiter = createRateLimiter({
      store,
      now: () => clock,
      onLimited: () => {}
    });
    const before = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      before.push(await limiter.consume("lifetime.checkout", { userId: "u" }));
    }
    clock = Date.parse("2026-07-26T12:01:00Z");
    const after = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      after.push(await limiter.consume("lifetime.checkout", { userId: "u" }));
    }
    expect([...before, ...after].every((result) => result.allowed)).toBe(true);
  });

  it("never rewinds a window when a request arrives late", async () => {
    // A request delayed across a boundary, or a container whose clock lags,
    // must not reset a fresh window and hand out a second budget.
    const store = createFakeStore();
    const fresh = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:01:00Z"),
      onLimited: () => {}
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fresh.consume("lifetime.checkout", { userId: "u" });
    }
    const stale = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:00:30Z"),
      onLimited: () => {}
    });
    await expect(
      stale.consume("lifetime.checkout", { userId: "u" })
    ).resolves.toMatchObject({ allowed: false });
    expect(store.rows.get("lifetime.checkout:user:u")).toMatchObject({
      windowStart: "2026-07-26T12:01:00.000Z",
      count: 6
    });
  });

  it("derives Retry-After from the window the row settled on", async () => {
    const store = createFakeStore();
    const fresh = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:01:00Z"),
      onLimited: () => {}
    });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await fresh.consume("lifetime.checkout", { userId: "u" });
    }
    // A stale caller is told to wait until the settled window ends (12:02:00),
    // not until the older window it thought it was in would have ended.
    const stale = createRateLimiter({
      store,
      now: () => Date.parse("2026-07-26T12:01:30Z"),
      onLimited: () => {}
    });
    const blocked = await stale.consume("lifetime.checkout", { userId: "u" });
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
  });

  it("rejects an unknown budget name at the call site", async () => {
    const store = createFakeStore();
    const limiter = limiterWith({ store });
    await expect(
      limiter.consume(
        /** @type {never} */ ("nope.nope"),
        { userId: "user_1" }
      )
    ).rejects.toThrow(/unknown rate limit budget/i);
  });
});
