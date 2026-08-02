/*
 * Echo Maze offline asset pinning, per ADR 0036.
 *
 * This is deliberately a small hand-written worker. Its state is one
 * IndexedDB record rather than process memory, because a worker restart must
 * not forget which version a non-terminal Run is using or release a pending
 * verification package too early. Cache Storage remains the durable asset
 * store; IndexedDB holds only the version/run references that protect it.
 */

const PIN_PREFIX = "echo-maze-pin-";
const ACCOUNT_SCOPED = "account";
const PUBLIC_SCOPED = "public";
const ACCOUNT_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const STATE_DB_NAME = "echo-maze-offline-v1";
const STATE_STORE_NAME = "state";
const STATE_KEY = "runtime";
const STATE_WAIT_MS = 2000;

/**
 * @typedef {{
 *   version: string,
 *   terminal: boolean,
 *   durable: boolean,
 *   accountScope: string | null
 * }} RunReference
 * @typedef {{
 *   activeVersion: string | null,
 *   activeAccountScope: string | null,
 *   staged: { version: string, blocked: boolean } | null,
 *   runs: Record<string, RunReference>
 * }} WorkerState
 */

/** @returns {WorkerState} */
function emptyState() {
  return {
    activeVersion: null,
    activeAccountScope: null,
    staged: null,
    runs: {}
  };
}

/** @param {unknown} value @returns {WorkerState} */
function normalizeState(value) {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const runs =
    candidate.runs && typeof candidate.runs === "object"
      ? /** @type {Record<string, RunReference>} */ (candidate.runs)
      : {};
  return {
    activeVersion:
      typeof candidate.activeVersion === "string"
        ? candidate.activeVersion
        : null,
    activeAccountScope:
      typeof candidate.activeAccountScope === "string"
        ? candidate.activeAccountScope
        : null,
    staged:
      candidate.staged && typeof candidate.staged === "object"
        ? {
            version:
              typeof candidate.staged.version === "string"
                ? candidate.staged.version
                : "",
            blocked: candidate.staged.blocked === true
          }
        : null,
    runs
  };
}

/**
 * IndexedDB is the worker's durable state boundary. A missing or unavailable
 * database leaves the worker usable for the current lifetime, but callers get
 * a failed mutation result rather than a false durability claim.
 */
let databasePromise = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  databasePromise ??= new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(STATE_DB_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE_NAME)) {
        database.createObjectStore(STATE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable."));
  });
  return databasePromise;
}

/** @param {IDBRequest} request */
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

/** @returns {Promise<WorkerState>} */
async function loadState() {
  const database = await openDatabase();
  if (!database) {
    return emptyState();
  }
  const transaction = database.transaction(STATE_STORE_NAME, "readonly");
  const stored = await requestResult(
    transaction.objectStore(STATE_STORE_NAME).get(STATE_KEY)
  );
  return normalizeState(stored);
}

/** @param {WorkerState} state @returns {Promise<boolean>} */
async function saveState(state) {
  const database = await openDatabase();
  if (!database) {
    return false;
  }
  const transaction = database.transaction(STATE_STORE_NAME, "readwrite");
  await requestResult(
    transaction.objectStore(STATE_STORE_NAME).put(state, STATE_KEY)
  );
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
  return true;
}

let statePromise = loadState().catch(() => emptyState());
let mutationChain = Promise.resolve();

/** @param {(state: WorkerState) => Promise<unknown>} operation */
function mutateState(operation) {
  const mutation = mutationChain.then(async () => {
    const state = await statePromise;
    const result = await operation(state);
    if (!(await saveState(state))) {
      return { ok: false, reason: "storage" };
    }
    return result;
  });
  mutationChain = mutation.catch(() => {});
  return mutation;
}

self.addEventListener("install", (event) => {
  // Never skipWaiting: taking over immediately is exactly the mid-Run swap
  // this worker exists to prevent.
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }
  const reply = (/** @type {unknown} */ payload) => {
    event.ports?.[0]?.postMessage(payload);
  };
  const respond = (promise) => {
    event.waitUntil(
      promise.then(reply, (error) =>
        reply({ ok: false, reason: String(error?.message ?? error) })
      )
    );
  };

  if (message.type === "pin") {
    respond(mutateState((state) => pin(message, state)));
    return;
  }
  if (message.type === "run-state") {
    respond(
      mutateState(async (state) => {
        const existing = state.runs[message.runId];
        state.runs[message.runId] = {
          version: message.version ?? existing?.version ?? state.activeVersion ?? "",
          terminal: message.terminal === true,
          durable: message.durable === true,
          accountScope:
            message.accountScope ??
            existing?.accountScope ??
            state.activeAccountScope
        };
        return settle(state);
      })
    );
    return;
  }
  if (message.type === "release") {
    respond(
      mutateState(async (state) => {
        delete state.runs[message.runId];
        return settle(state);
      })
    );
    return;
  }
  if (message.type === "stage") {
    respond(
      mutateState(async (state) => {
        state.staged = {
          version: message.version,
          blocked: message.blocked === true
        };
        return settle(state);
      })
    );
    return;
  }
  if (message.type === "sign-out") {
    respond(
      mutateState(async (state) => {
        await dropAccountScoped(state);
        return { ...(await settle(state)), ok: true };
      })
    );
    return;
  }
  if (message.type === "status") {
    respond(mutationChain.then(() => statePromise.then(status)));
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    Promise.race([
      mutationChain.then(() => statePromise),
      new Promise((resolve) =>
        setTimeout(() => resolve(null), STATE_WAIT_MS)
      )
    ])
      .then((state) =>
        fetchFromPinnedVersion(event.request, state ?? emptyState())
      )
      .catch(() => fetch(event.request))
  );
});

/**
 * Serving a request for a non-terminal Run from a staged version is the same
 * fault as activating one, so the answer is always the version that Run was
 * pinned against.
 *
 * @param {Request} request
 * @param {WorkerState} state
 */
function fetchFromPinnedVersion(request, state) {
  const selected = versionForRequest(state);
  if (!selected?.version) {
    return fetch(request);
  }
  return (selected.accountScope
    ? caches.open(
        cacheName(selected.version, ACCOUNT_SCOPED, selected.accountScope)
      )
    : Promise.resolve(null)
  )
    .then((cache) => cache?.match(request))
    .then(
      (hit) =>
        hit ??
        caches
          .open(cacheName(selected.version, PUBLIC_SCOPED))
          .then((cache) => cache.match(request))
          .then((publicHit) => publicHit ?? fetch(request))
    );
}

/** @param {WorkerState} state */
function versionForRequest(state) {
  for (const run of Object.values(state.runs)) {
    if (!run.terminal) {
      return {
        version: run.version || state.activeVersion,
        accountScope: run.accountScope
      };
    }
  }
  return state.activeVersion
    ? { version: state.activeVersion, accountScope: state.activeAccountScope }
    : null;
}

/** @param {{ version: string, assets: { url: string, scope?: string }[] }} message @param {WorkerState} state */
async function pin(message, state) {
  const accountAssets = (message.assets ?? []).filter(
    (asset) => asset.scope !== PUBLIC_SCOPED
  );
  const accountScope = message.accountScope ?? state.activeAccountScope;
  if (
    (accountAssets.length > 0 || accountScope !== null) &&
    !ACCOUNT_SCOPE_PATTERN.test(accountScope ?? "")
  ) {
    throw new Error("Account-scoped package needs an account scope.");
  }
  const protectedRuns = Object.values(state.runs).some(
    (run) => !run.terminal || !run.durable
  );
  if (
    protectedRuns &&
    accountScope &&
    state.activeAccountScope &&
    accountScope !== state.activeAccountScope
  ) {
    throw new Error("A non-terminal Run blocks an account cache switch.");
  }
  const accountCache = accountAssets.length
    ? await caches.open(cacheName(message.version, ACCOUNT_SCOPED, accountScope))
    : null;
  const publicCache = await caches.open(
    cacheName(message.version, PUBLIC_SCOPED)
  );
  for (const asset of message.assets ?? []) {
    const cache = asset.scope === PUBLIC_SCOPED ? publicCache : accountCache;
    if (!cache) {
      throw new Error("Account-scoped package needs an account cache.");
    }
    await cache.add(new Request(asset.url, { cache: "reload" }));
  }
  if (!protectedRuns) {
    state.activeVersion = message.version;
    state.activeAccountScope = accountScope;
    await evictUnreferenced(state);
  } else {
    state.activeVersion ??= message.version;
    state.activeAccountScope ??= accountScope;
  }
  return { ok: true, version: message.version };
}

/** @param {WorkerState} state */
async function settle(state) {
  const nonTerminal = Object.values(state.runs).filter((run) => !run.terminal);
  const undurable = Object.values(state.runs).filter(
    (run) => run.terminal && !run.durable
  );

  if (state.staged?.blocked && nonTerminal.length > 0) {
    // A version blocked for security cannot be activated and cannot be played
    // through either. Pausing preserves Active Run Recovery; the Explorer
    // reconnects rather than continuing under rules that changed underneath.
    return { ...status(state), paused: true };
  }
  if (nonTerminal.length > 0 || undurable.length > 0) {
    return { ...status(state), paused: false };
  }
  if (state.staged && !state.staged.blocked) {
    state.activeVersion = state.staged.version;
    state.staged = null;
  }
  await evictUnreferenced(state);
  return { ...status(state), paused: false };
}

/** @param {WorkerState} state */
async function evictUnreferenced(state) {
  const referenced = new Set(
    Object.values(state.runs)
      .filter((run) => !run.terminal || !run.durable)
      .map((run) => run.version)
      .filter(Boolean)
  );
  if (state.activeVersion) {
    referenced.add(state.activeVersion);
  }
  for (const name of await caches.keys()) {
    if (!name.startsWith(PIN_PREFIX)) {
      continue;
    }
    if (![...referenced].some((version) => name.includes(`-${version}-`))) {
      await caches.delete(name);
    }
  }
}

/** @param {WorkerState} state */
async function dropAccountScoped(state) {
  for (const name of await caches.keys()) {
    if (
      name.startsWith(PIN_PREFIX) &&
      (name.endsWith(`-${ACCOUNT_SCOPED}`) ||
        name.includes(`-${ACCOUNT_SCOPED}-`))
    ) {
      await caches.delete(name);
    }
  }
  state.activeAccountScope = null;
  // Sign-out drops account-scoped entries. Guest non-terminal entries and
  // terminal entries without a durable verification package keep their pins.
  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.terminal ? run.durable : run.accountScope) {
      delete state.runs[runId];
    }
  }
  return { ok: true };
}

/** @param {WorkerState} state */
function status(state) {
  return {
    activeVersion: state.activeVersion,
    stagedVersion: state.staged?.version ?? null,
    accountScope: state.activeAccountScope,
    nonTerminalRuns: Object.values(state.runs).filter((run) => !run.terminal)
      .length
  };
}

/** @param {string} version @param {string} scope @param {string | null} [accountScope] */
function cacheName(version, scope, accountScope = null) {
  return `${PIN_PREFIX}${version}-${scope}${
    scope === ACCOUNT_SCOPED && accountScope ? `-${accountScope}` : ""
  }`;
}
