import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { createLifetimeHandler } from "../server/lifetime-route.js";
import { createPlayerApiHandler } from "../server/player-route.js";
import { createQuestionApi } from "../server/question-api.js";
import { createQuestionHandler } from "../server/question-route.js";

/**
 * @param {{ method: string, url: string, body?: unknown, headers?: Record<string, string> }} options
 */
function createRequest({ method, url, body, headers = {} }) {
  const stream = new PassThrough();
  stream.end(body === undefined ? "" : JSON.stringify(body));
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
  /** @type {{ statusCode: number, body: any, headers: Record<string, string> }} */
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
  return { response: /** @type {never} */ (response), finished };
}

/**
 * @param {{ allowed: boolean, retryAfterSeconds?: number }} decision
 */
function stubRateLimit({ allowed, retryAfterSeconds = 42 }) {
  /** @type {{ budget: string, userId: string | null }[]} */
  const calls = [];
  /** @type {import("../server/rate-limit-request.js").RateLimit} */
  const rateLimit = async (budget, _request, userId = null) => {
    calls.push({ budget, userId });
    return {
      allowed,
      degraded: false,
      limit: 10,
      remaining: allowed ? 9 : 0,
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds
    };
  };
  return { calls, rateLimit };
}

const playerStore = {
  getProfile: async () => ({ username: "Bright Fox" }),
  saveProfile: async () => ({ username: "Bright Fox" }),
  getLeaderboard: async () => ({ entries: [], globalMaxScore: 0 }),
  submitScore: async () => ({ entry: { score: 900 }, duplicate: false })
};

const profileBody = {
  username: "Bright Fox",
  explorerPalette: "teal",
  playgroundPalette: "daylight"
};

const scoreBody = {
  idempotencyKey: "run_01J1MOSSWATCH",
  levelId: "trail-scout",
  labyrinthNumber: 4,
  seed: "MOSS-WATCH-11",
  wardensDefeated: 2,
  echoesCollected: 3,
  moves: 81,
  elapsedMs: 92000,
  escaped: true
};

const questionUrl =
  "/api/question?level=trail-scout&seed=moss-watch-11&warden=1&attempt=0&labyrinth=4&question=0";

describe("rate limiting on the Player Profile write", () => {
  it("meters the write against the profile budget, scoped to the account", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createPlayerApiHandler({
      store: playerStore,
      getUserId: () => "user_1",
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "PUT", url: "/api/profile", body: profileBody }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([
      { budget: "profile.write", userId: "user_1" }
    ]);
  });

  it("answers 429 with Retry-After past the budget and never writes", async () => {
    const limiter = stubRateLimit({ allowed: false, retryAfterSeconds: 37 });
    let saved = false;
    const handler = createPlayerApiHandler({
      store: {
        ...playerStore,
        saveProfile: async () => {
          saved = true;
          return {};
        }
      },
      getUserId: () => "user_1",
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "PUT", url: "/api/profile", body: profileBody }),
      response,
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(429);
    expect(result.headers["retry-after"]).toBe("37");
    expect(result.body.retryAfter).toBe(37);
    expect(result.body.error).toMatch(/try again/i);
    expect(saved).toBe(false);
  });

  it("does not meter profile reads", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createPlayerApiHandler({
      store: playerStore,
      getUserId: () => "user_1",
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: "/api/profile" }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([]);
  });
});

describe("rate limiting on Run Score submission", () => {
  it("meters the submission against the score budget", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createPlayerApiHandler({
      store: playerStore,
      getUserId: () => "user_1",
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "POST", url: "/api/scores", body: scoreBody }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(201);
    expect(limiter.calls).toEqual([
      { budget: "score.submit", userId: "user_1" }
    ]);
  });

  it("answers 429 before touching the store", async () => {
    const limiter = stubRateLimit({ allowed: false, retryAfterSeconds: 12 });
    let submitted = false;
    const handler = createPlayerApiHandler({
      store: {
        ...playerStore,
        submitScore: async () => {
          submitted = true;
          return { entry: {}, duplicate: false };
        }
      },
      getUserId: () => "user_1",
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "POST", url: "/api/scores", body: scoreBody }),
      response,
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(429);
    expect(result.headers["retry-after"]).toBe("12");
    expect(submitted).toBe(false);
  });
});

describe("rate limiting on Lifetime Checkout creation", () => {
  const service = {
    createCheckout: async () => ({
      checkoutUrl: "https://checkout.stripe.test/session",
      purchaseId: "purchase_1",
      state: "checkout_open"
    }),
    confirmCheckout: async () => ({ outcome: "activated" }),
    processWebhook: async () => ({ outcome: "processed" })
  };

  it("meters checkout creation against the checkout budget", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createLifetimeHandler({
      getUserId: () => "user_1",
      service,
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/lifetime-checkout",
        body: {}
      }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([
      { budget: "lifetime.checkout", userId: "user_1" }
    ]);
  });

  it("answers 429 without creating a Stripe session", async () => {
    const limiter = stubRateLimit({ allowed: false, retryAfterSeconds: 25 });
    let created = false;
    const handler = createLifetimeHandler({
      getUserId: () => "user_1",
      service: {
        ...service,
        createCheckout: async () => {
          created = true;
          return {};
        }
      },
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/lifetime-checkout",
        body: {}
      }),
      response,
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(429);
    expect(result.headers["retry-after"]).toBe("25");
    expect(created).toBe(false);
  });

  it("never meters confirmation, so a paid Explorer is never locked out", async () => {
    const limiter = stubRateLimit({ allowed: false });
    const handler = createLifetimeHandler({
      getUserId: () => "user_1",
      service,
      rateLimit: limiter.rateLimit
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({
        method: "POST",
        url: "/api/lifetime-confirm",
        body: { sessionId: "cs_abcdefghij" }
      }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([]);
  });
});

describe("rate limiting on Question fetch", () => {
  it("meters an authenticated Classroom Member by Explorer id", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createQuestionHandler(
      { getQuestion: async () => ({ question: {} }) },
      {
        getUserId: () => "user_student",
        rateLimit: limiter.rateLimit
      }
    );
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([
      { budget: "question.fetch", userId: "user_student" }
    ]);
  });

  it("meters guest fetches without a user id", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createQuestionHandler(
      { getQuestion: async () => ({ question: {} }) },
      { rateLimit: limiter.rateLimit }
    );
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([
      { budget: "question.fetch", userId: null }
    ]);
  });

  it("answers 429 with Retry-After without calling the question provider", async () => {
    const limiter = stubRateLimit({ allowed: false, retryAfterSeconds: 18 });
    let asked = false;
    const handler = createQuestionHandler(
      {
        getQuestion: async () => {
          asked = true;
          return {};
        }
      },
      { rateLimit: limiter.rateLimit }
    );
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      response,
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(429);
    expect(result.headers["retry-after"]).toBe("18");
    expect(asked).toBe(false);
  });

  it("keeps the in-process provider throttle as an independent first line", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createQuestionHandler(
      { getQuestion: async () => ({ question: {} }) },
      { maxRequests: 1, rateLimit: limiter.rateLimit }
    );
    const first = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      first.response,
      undefined
    );
    expect((await first.finished).statusCode).toBe(200);

    const second = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      second.response,
      undefined
    );
    const blocked = await second.finished;
    expect(blocked.statusCode).toBe(429);
    // The per-caller budget was never consulted: the instance throttle came first.
    expect(limiter.calls).toHaveLength(1);
  });

  it("composes optional Clerk identity and the durable limiter in the serverless API", async () => {
    const limiter = stubRateLimit({ allowed: true });
    const handler = createQuestionApi(
      {
        CLERK_PUBLISHABLE_KEY: "pk_test_example",
        CLERK_SECRET_KEY: "sk_test_example",
        QUESTION_PROVIDER: "bundled"
      },
      {
        authenticate: (_request, _response, next) => next(),
        getUserId: () => "user_student",
        rateLimit: limiter.rateLimit
      }
    );
    const { response, finished } = createResponse();
    await handler(
      createRequest({ method: "GET", url: questionUrl }),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(200);
    expect(limiter.calls).toEqual([
      { budget: "question.fetch", userId: "user_student" }
    ]);
  });
});
