import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** @param {string} relative */
function source(relative) {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

function fakeResponse() {
  /** @type {Record<string, string>} */
  const headers = {};
  let body = "";
  const raw = {
    statusCode: 200,
    writableEnded: false,
    headers,
    setHeader(/** @type {string} */ name, /** @type {string} */ value) {
      headers[name.toLowerCase()] = value;
    },
    end(/** @type {string} */ chunk) {
      body += chunk ?? "";
      raw.writableEnded = true;
    },
    json: () => JSON.parse(body || "{}"),
    get body() {
      return body;
    }
  };
  return /** @type {import("node:http").ServerResponse & typeof raw} */ (
    /** @type {unknown} */ (raw)
  );
}

/** @param {{ url?: string, method?: string, body?: unknown }} [options] */
function fakeRequest({ url = "/", method = "GET", body = undefined } = {}) {
  const chunks = body === undefined ? [] : [JSON.stringify(body)];
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({
      url,
      method,
      headers: { "content-type": "application/json" },
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield Buffer.from(chunk);
      },
      on(/** @type {string} */ event, /** @type {Function} */ listener) {
        if (event === "data") for (const chunk of chunks) listener(Buffer.from(chunk));
        if (event === "end") listener();
        return this;
      },
      setEncoding() {
        return this;
      }
    })
  );
}

describe("SM-01 — the serverless shim must accept every Classroom sub-resource", () => {
  it("agrees with the route the shim forwards to", async () => {
    // `api/profile.js` guards the rewritten path before dispatch, so a
    // sub-resource the guard omits answers 404 in production while working
    // locally, where Express reaches the route directly.
    const { CLASS_EXPEDITION_SUB_RESOURCES } = await import(
      "../api/profile.js"
    );
    const route = source("server/classroom-route.js");
    const served = (route.match(/\(status\|[^)]+\)/)?.[0] ?? "")
      .replace(/[()]/g, "")
      .split("|")
      .map((name) => name.replaceAll("\\", ""))
      .filter(Boolean);

    expect(served).toContain("constellation");
    expect([...CLASS_EXPEDITION_SUB_RESOURCES].sort()).toEqual(
      [...served].sort()
    );
  });

  it("routes a Class Constellation request rather than 404ing it", async () => {
    const { CLASS_EXPEDITION_SUB_RESOURCES } = await import(
      "../api/profile.js"
    );
    expect(CLASS_EXPEDITION_SUB_RESOURCES).toContain("constellation");
  });
});

describe("Q-04 / Q-34 — a rejected offline replay must be terminal, not a 500", () => {
  it("classifies an unusable ruleset as replay input, not a server fault", async () => {
    const { ReplayInputError } = await import("../server/run-replay.js");
    const { offlineReplayConfigFor } = await import("../server/run-replay.js");
    expect(() =>
      offlineReplayConfigFor("bright-start", 1, "not-a-real-revision")
    ).toThrow(ReplayInputError);
  });

  it("classifies a bad trusted Question, rather than letting it escape", () => {
    // A resolver answering with something unusable used to throw a plain
    // Error, which escaped every classifier and became the 500 the client
    // retries forever. The audit asks for `ReplayInputError` here; that would
    // be worse, not better — see the trusted-content suite below.
    const replay = source("server/run-replay.js");
    for (const message of [
      "Trusted Question resolver returned an invalid Question.",
      "Trusted Question resolver returned no Question."
    ]) {
      const at = replay.indexOf(message);
      expect(at).toBeGreaterThan(-1);
      expect(replay.slice(at - 160, at)).toContain(
        "TrustedReplayContentError"
      );
    }
  });
});

describe("Q-46 — the server verifier and the replay viewer must agree", () => {
  it("uses one owner for whether an action advanced the Run", async () => {
    const engine = await import("../src/game/game-session.js");
    expect(typeof engine.actionAdvancedRun).toBe("function");

    // Neither verifier may keep its own copy of the rule.
    for (const relative of ["server/run-replay.js", "src/game/run-replay.js"]) {
      expect(source(relative)).toContain("actionAdvancedRun");
      expect(source(relative)).not.toMatch(/return next !== previous;/);
    }
  });

  it("treats a rung Signal Bell as an advance on both sides", async () => {
    const { createRun, applyAction, actionAdvancedRun } = await import(
      "../src/game/game-session.js"
    );
    const run = createRun("ECHO-BELLS-AGREE", {
      size: 11,
      echoCount: 1,
      wardenCount: 1,
      ruleset: {
        atlasRegionId: "mastery",
        revision: "warden-bells-v1",
        label: "Warden Bells"
      }
    });
    expect(run.signalBells.length).toBeGreaterThan(0);

    // Nothing adjacent: the bell cannot be rung, nothing advances.
    const idle = applyAction(run, { type: "ring-bell" });
    expect(idle.moves).toBe(run.moves);
    expect(actionAdvancedRun(run, idle, { type: "ring-bell" })).toBe(false);

    // Standing next to an unspent bell: ringing it spends the turn.
    const bell = run.signalBells[0];
    const beside = {
      ...run,
      explorer: { ...run.explorer, row: bell.row, col: bell.col + 1 }
    };
    const rung = applyAction(beside, { type: "ring-bell" });
    expect(rung.moves).toBe(beside.moves + 1);
    expect(actionAdvancedRun(beside, rung, { type: "ring-bell" })).toBe(true);

    // The defect: a fresh object that advanced nothing. The old server check
    // asked only whether the identity changed, so it accepted this.
    const cosmetic = { ...run, event: { type: "blocked", message: "no bell" } };
    expect(cosmetic).not.toBe(run);
    expect(actionAdvancedRun(run, cosmetic, { type: "ring-bell" })).toBe(false);
  });
});

describe("Q-26 — a deleted account is 410 everywhere, not 500", () => {
  it("answers every store that can raise it", async () => {
    const { DeletedUserError, answerDeletedUser } = await import(
      "../server/deleted-user-guard.js"
    );
    const response = fakeResponse();
    const answered = answerDeletedUser(new DeletedUserError(), response);
    expect(answered).toBe(true);
    expect(response.statusCode).toBe(410);
    expect(response.json().error).toContain("deleted");
    expect(answerDeletedUser(new Error("something else"), fakeResponse())).toBe(
      false
    );
  });

  it("is reachable from every route that touches a guarded store", () => {
    // A route that can surface `DeletedUserError` but does not classify it
    // reports a deleted account as 500 or 503, which a client retries
    // forever. The route list is derived, not hand-maintained: a new route
    // that reaches a guarded store fails this the day it is written.
    const serverDir = fileURLToPath(new URL("../server/", import.meta.url));
    const guardedStores = readdirSync(serverDir).filter(
      (name) =>
        name.endsWith("-store.js") &&
        readFileSync(serverDir + name, "utf8").includes("new DeletedUserError")
    );
    expect(guardedStores.length).toBeGreaterThan(3);

    /** @type {string[]} */
    const unhandled = [];
    for (const name of readdirSync(serverDir)) {
      if (!name.endsWith("-route.js")) continue;
      const text = readFileSync(serverDir + name, "utf8");
      const reachesGuardedStore = guardedStores.some((store) =>
        // A route reaches a store either by importing it directly or by
        // being handed its factory result — both name the module somewhere.
        text.includes(store.replace(/\.js$/, ""))
      );
      if (!reachesGuardedStore) continue;
      if (!text.includes("answerDeletedUser(error, response)")) {
        unhandled.push(name);
      }
    }
    expect(unhandled).toEqual([]);
  });
});

describe("Q-27 / Q-28 — classify by error class, never by message text", () => {
  it("does not match validation errors on their message prefix", () => {
    expect(source("server/run-access-route.js")).not.toContain(
      "message.startsWith"
    );
  });

  it("never returns an unclassified error's own text to the caller", async () => {
    const { createQuestionHandler, QuestionInputError } = await import(
      "../server/question-route.js"
    );
    expect(QuestionInputError.prototype).toBeInstanceOf(Error);

    const handler = createQuestionHandler({
      getQuestion: async () => {
        // Exactly the shape of a `pg` failure: the message carries SQL.
        throw new Error(
          'relation "question_versions" does not exist\n  SELECT * FROM question_versions'
        );
      }
    });
    const response = fakeResponse();
    await handler(
      fakeRequest({
        url:
          "/api/question?level=bright-start&seed=echo-1&challenge=warden" +
          "&warden=1&attempt=0&labyrinth=1&question=0"
      }),
      response,
      undefined
    );
    expect(response.statusCode).not.toBe(400);
    expect(response.body).not.toContain("SELECT");
    expect(response.body).not.toContain("question_versions");
  });
});

describe("BE-F-01 — one escaped rejection must not kill the server", () => {
  it("forwards a rejected handler instead of dropping it on the floor", async () => {
    const { dispatch } = await import("../server/dispatch.js");
    /** @type {unknown} */
    let forwarded = null;
    const failure = new Error("handler exploded");
    await dispatch(
      async () => {
        throw failure;
      },
      fakeRequest(),
      fakeResponse(),
      (/** @type {unknown} */ error) => {
        forwarded = error;
      }
    );
    expect(forwarded).toBe(failure);
  });

  it("answers the caller when there is no next to forward to", async () => {
    const { dispatch } = await import("../server/dispatch.js");
    const response = fakeResponse();
    await dispatch(
      async () => {
        throw new Error("handler exploded");
      },
      fakeRequest(),
      response,
      undefined
    );
    // 503 with a retry advisory, matching every other "our side failed"
    // answer this API gives.
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.body).not.toContain("exploded");
  });

  it("leaves no bare `void` dispatch behind", () => {
    for (const relative of ["server/player-api.js", "server/question-api.js"]) {
      expect(source(relative)).not.toMatch(/void \w+\(request, response/);
    }
  });

  it("installs process-level handlers on the persistent server", () => {
    const text = source("server.js");
    expect(text).toContain('process.on("unhandledRejection"');
    expect(text).toContain('process.on("uncaughtException"');
  });
});

describe("FE-F-01 / FE-F-05 — the Atlas loader must not duplicate listeners", () => {
  it("discards the cached view only when the import itself failed", () => {
    const text = source("src/main.js");
    const start = text.indexOf("async function showQuestAtlas(");
    const body = text.slice(start, text.indexOf("\n}", start));
    expect(start).toBeGreaterThan(-1);

    // The view attaches listeners to `#atlas-dialog` when it is created, so a
    // failure anywhere after creation must not null the cache: the next open
    // would build a second view and attach a second set.
    const resets = body.split("atlasViewPromise = null").length - 1;
    expect(resets).toBe(1);
    const resetIndex = body.indexOf("atlasViewPromise = null");
    const viewAwaitIndex = body.indexOf("await atlasViewPromise");
    expect(viewAwaitIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(viewAwaitIndex);
    expect(resetIndex).toBeLessThan(body.indexOf("projectAtlas("));
  });

  it("tells the player to reload once the retry chunk is spent", () => {
    const text = source("src/main.js");
    const start = text.indexOf("async function showQuestAtlas(");
    const body = text.slice(start, text.indexOf("\n}", start));
    expect(body).toContain("retrying");
    expect(body).toMatch(/retrying\s*\n?\s*\?/);
  });
});

describe("a fault on our side must not burn a player's receipt", () => {
  it("keeps a trusted-content failure separate from a rejected submission", async () => {
    const { ReplayInputError, TrustedReplayContentError } = await import(
      "../server/run-replay.js"
    );
    // `server/offline-submission.js` consumes the receipt on a
    // `ReplayInputError`. A gap in our own reviewed content is not the
    // submitter's fault and must stay retryable, so it cannot be one.
    expect(TrustedReplayContentError.prototype).not.toBeInstanceOf(
      ReplayInputError
    );
    const submission = source("server/offline-submission.js");
    const guard = submission.indexOf("instanceof TrustedReplayContentError");
    const terminal = submission.indexOf("instanceof ReplayInputError");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(terminal);
  });

  it("classifies the offline replay ruleset as the caller's input", async () => {
    const { ReplayInputError, offlineReplayConfigFor } = await import(
      "../server/run-replay.js"
    );
    // The revision comes from the receipt the caller presented.
    expect(() =>
      offlineReplayConfigFor("bright-start", 1, "not-a-real-revision")
    ).toThrow(ReplayInputError);
  });
});

describe("the persistent server never renders a stack trace", () => {
  it("registers a terminal error handler ahead of Express's own", () => {
    // `dispatch` forwards to `next(error)`. Without a four-argument handler,
    // Express 5 renders the message and stack into the body unless
    // NODE_ENV is "production", and `npm start` never sets it.
    const text = source("server.js");
    expect(text).toMatch(/app\.use\(\s*\(/);
    expect(text).toContain("_next");
    expect(text).toContain("Something went wrong. Try again.");
    expect(text).not.toContain("error.stack");
  });
});
