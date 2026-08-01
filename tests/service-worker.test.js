import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The service worker is a plain script for a scope no test environment
 * provides, so it runs here in a sandbox with a fake `ServiceWorkerGlobalScope`
 * and a fake Cache Storage. That keeps the assertions about its behaviour
 * rather than about a mock of itself.
 */
function loadServiceWorker() {
  /** @type {Map<string, Map<string, string>>} */
  const store = new Map();
  /** @type {Map<string, (event: Record<string, unknown>) => void>} */
  const listeners = new Map();
  /** @type {Promise<unknown>[]} */
  const pending = [];

  const caches = {
    async open(/** @type {string} */ name) {
      const entries = store.get(name) ?? new Map();
      store.set(name, entries);
      return {
        async add(/** @type {{ url: string }} */ request) {
          entries.set(String(request.url), "cached");
        },
        async match(/** @type {{ url: string }} */ request) {
          return entries.get(String(request.url)) ?? undefined;
        }
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(/** @type {string} */ name) {
      return store.delete(name);
    }
  };

  const scope = {
    self: /** @type {Record<string, unknown>} */ ({}),
    caches,
    fetch: async () => "network",
    Request: class {
      /** @param {string} url */
      constructor(url) {
        this.url = url;
      }
    },
    console
  };
  scope.self = {
    addEventListener: (
      /** @type {string} */ type,
      /** @type {(event: Record<string, unknown>) => void} */ listener
    ) => {
      listeners.set(type, listener);
    },
    clients: { claim: async () => {} }
  };
  const context = createContext(scope);
  runInContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    context
  );

  /**
   * @param {Record<string, unknown>} data
   * @returns {Promise<Record<string, unknown>>}
   */
  function send(data) {
    return new Promise((resolve) => {
      const listener = listeners.get("message");
      if (!listener) {
        throw new Error("The worker registered no message listener.");
      }
      listener({
        data,
        ports: [{ postMessage: resolve }],
        waitUntil: (/** @type {Promise<unknown>} */ promise) => {
          pending.push(promise);
        }
      });
    });
  }

  /** @param {string} url */
  async function fetchThrough(url) {
    const listener = listeners.get("fetch");
    if (!listener) {
      throw new Error("The worker registered no fetch listener.");
    }
    /** @type {Promise<unknown> | null} */
    let answered = null;
    listener({
      request: { url },
      respondWith: (/** @type {Promise<unknown>} */ response) => {
        answered = response;
      }
    });
    return answered ? await answered : "unhandled";
  }

  return { send, fetchThrough, cacheNames: () => [...store.keys()] };
}

describe("Offline asset pinning service worker", () => {
  /** @type {ReturnType<typeof loadServiceWorker>} */
  let worker;

  beforeEach(async () => {
    worker = loadServiceWorker();
    await worker.send({
      type: "pin",
      version: "v1",
      accountScope: "user_01MOSS",
      assets: [
        { url: "https://echo.test/shell.js", scope: "public" },
        { url: "https://echo.test/pack.json", scope: "account" }
      ]
    });
  });

  it("never activates a staged version while a Run is non-terminal", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });

    const staged = await worker.send({ type: "stage", version: "v2" });

    expect(staged).toMatchObject({ activeVersion: "v1", stagedVersion: "v2" });
  });

  it("routes an active Run through the version it was pinned against", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });
    await worker.send({ type: "stage", version: "v2" });
    await worker.send({
      type: "pin",
      version: "v2",
      assets: [{ url: "https://echo.test/shell.js", scope: "public" }]
    });

    await expect(worker.fetchThrough("https://echo.test/pack.json")).resolves.toBe(
      "cached"
    );
    expect(worker.cacheNames()).toContain("echo-maze-pin-v1-account-user_01MOSS");
  });

  it("keeps every pinned asset while a Run is non-terminal", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });
    await worker.send({ type: "stage", version: "v2" });
    await worker.send({
      type: "pin",
      version: "v2",
      assets: [{ url: "https://echo.test/shell.js", scope: "public" }]
    });

    expect(worker.cacheNames()).toContain("echo-maze-pin-v1-account-user_01MOSS");
    expect(worker.cacheNames()).toContain("echo-maze-pin-v1-public");
  });

  it("activates only after terminal state and durable pending storage", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });
    await worker.send({ type: "stage", version: "v2" });

    // Terminal but not yet durably stored: still not a safe handover.
    const terminalOnly = await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: true,
      durable: false
    });
    expect(terminalOnly).toMatchObject({
      activeVersion: "v1",
      stagedVersion: "v2"
    });

    const durable = await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: true,
      durable: true
    });
    expect(durable).toMatchObject({ activeVersion: "v2", stagedVersion: null });
  });

  it("pauses rather than activating when a version is security-blocked", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });

    const blocked = await worker.send({
      type: "stage",
      version: "v2",
      blocked: true
    });

    expect(blocked).toMatchObject({ paused: true, activeVersion: "v1" });
    // The Run's own assets survive the pause, so Active Run Recovery still has
    // everything it needs when the Explorer reconnects.
    expect(worker.cacheNames()).toContain("echo-maze-pin-v1-account-user_01MOSS");
  });

  it("survives a staged update byte-exact for an active local recovery", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: false
    });
    const before = await worker.fetchThrough("https://echo.test/pack.json");

    await worker.send({ type: "stage", version: "v2" });
    await worker.send({
      type: "pin",
      version: "v2",
      assets: [{ url: "https://echo.test/pack.json", scope: "account" }]
    });
    const after = await worker.fetchThrough("https://echo.test/pack.json");

    expect(after).toBe(before);
  });

  it("evicts a version only once nothing references it", async () => {
    await worker.send({
      type: "run-state",
      runId: "run_1",
      version: "v1",
      terminal: true,
      durable: true
    });
    await worker.send({ type: "stage", version: "v2" });
    await worker.send({
      type: "pin",
      version: "v2",
      assets: [{ url: "https://echo.test/shell.js", scope: "public" }]
    });
    await worker.send({ type: "release", runId: "run_1" });

    expect(worker.cacheNames()).not.toContain("echo-maze-pin-v1-account-user_01MOSS");
    expect(worker.cacheNames()).toContain("echo-maze-pin-v2-public");
  });

  it("drops account-scoped content on sign-out and keeps the public shell", async () => {
    await worker.send({ type: "sign-out" });

    expect(worker.cacheNames()).not.toContain("echo-maze-pin-v1-account-user_01MOSS");
    expect(worker.cacheNames()).toContain("echo-maze-pin-v1-public");
  });

  it("keeps a terminal Run whose verification package is not durable yet", async () => {
    // settle() blocks activation on this state too, so forgetting it here would
    // release a version the pending verification package still needs.
    await worker.send({
      type: "run-state",
      runId: "run_undurable",
      version: "v1",
      terminal: true,
      durable: false
    });
    await worker.send({ type: "stage", version: "v2" });

    await worker.send({ type: "sign-out" });

    await expect(worker.send({ type: "status" })).resolves.toMatchObject({
      activeVersion: "v1"
    });
  });

  it("drops a Run that has reached a terminal state durably", async () => {
    // Nothing references this Run's version any more, so sign-out may forget
    // it and the staged version is free to take over.
    await worker.send({
      type: "run-state",
      runId: "run_done",
      version: "v1",
      terminal: true,
      durable: true
    });

    await worker.send({ type: "sign-out" });

    await expect(
      worker.send({ type: "stage", version: "v2" })
    ).resolves.toMatchObject({ activeVersion: "v2" });
  });

  it("keeps a Run that sign-out does not end pinned to its version", async () => {
    // Forgetting a non-terminal Run here would let the staged version activate
    // and evict the assets that Run is mid-play against — the exact version mix
    // the worker exists to prevent. A Guest Run is not ended by sign-out at all.
    await worker.send({
      type: "run-state",
      runId: "run_guest",
      version: "v1",
      terminal: false
    });

    await worker.send({ type: "sign-out" });

    await expect(worker.send({ type: "status" })).resolves.toMatchObject({
      nonTerminalRuns: 1
    });
  });
});

describe("Service worker dependency budget", () => {
  it("is hand-written and imports nothing", () => {
    const source = readFileSync(
      new URL("../public/sw.js", import.meta.url),
      "utf8"
    );

    // The header explains at length which libraries were ruled out and why,
    // so the assertion runs against the code rather than the explanation.
    const code = source.slice(source.indexOf("const PIN_PREFIX"));
    expect(code).not.toMatch(/\bimport\b|\brequire\(|importScripts/);
    expect(code).not.toMatch(/workbox|vite-plugin-pwa/i);
    // skipWaiting is precisely the mid-Run takeover this worker exists to
    // prevent, so its absence is a contract rather than an omission.
    expect(code).not.toContain("skipWaiting()");
  });
});
