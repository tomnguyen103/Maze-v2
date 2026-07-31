/*
 * Echo Maze offline asset pinning, per ADR 0036.
 *
 * Hand-written on purpose. The conventional choice here would be Workbox or
 * `vite-plugin-pwa`, and this is the one place the standing no-new-dependency
 * constraint forces something bespoke. Its scope is deliberately narrow: hold
 * one versioned set of assets an active receipt named, refuse to disturb them
 * while a Run is non-terminal, and hand over to a staged version only once
 * nothing depends on the old one.
 *
 * The rule the whole file exists for: while any Run is non-terminal, no staged
 * version activates, no request for that Run is served by a staged version,
 * and no pinned asset is evicted. Mixing engine versions mid-Run would break
 * exact recovery and make the server's later replay disagree with what the
 * Explorer actually saw.
 */

const PIN_PREFIX = "echo-maze-pin-";
const ACCOUNT_SCOPED = "account";
const PUBLIC_SCOPED = "public";

/**
 * Runs that have not reached a terminal state, and the pending verification
 * packages that outlive them. A version may activate only when both are empty
 * of references to the version it would replace.
 *
 * @type {Map<string, { version: string, terminal: boolean, durable: boolean }>}
 */
const runs = new Map();

/** @type {{ version: string, blocked: boolean } | null} */
let staged = null;
/** @type {string | null} */
let activeVersion = null;

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

  if (message.type === "pin") {
    event.waitUntil(
      pin(message).then(
        (result) => reply(result),
        (error) => reply({ ok: false, reason: String(error?.message ?? error) })
      )
    );
    return;
  }
  if (message.type === "run-state") {
    const existing = runs.get(message.runId);
    runs.set(message.runId, {
      version: message.version ?? existing?.version ?? activeVersion ?? "",
      terminal: message.terminal === true,
      durable: message.durable === true
    });
    event.waitUntil(settle().then(reply, reply));
    return;
  }
  if (message.type === "release") {
    runs.delete(message.runId);
    event.waitUntil(settle().then(reply, reply));
    return;
  }
  if (message.type === "stage") {
    staged = { version: message.version, blocked: message.blocked === true };
    event.waitUntil(settle().then(reply, reply));
    return;
  }
  if (message.type === "sign-out") {
    event.waitUntil(dropAccountScoped().then(reply, reply));
    return;
  }
  if (message.type === "status") {
    reply(status());
  }
});

self.addEventListener("fetch", (event) => {
  const version = versionForRequest();
  if (!version) {
    return;
  }
  event.respondWith(
    caches
      .open(cacheName(version, ACCOUNT_SCOPED))
      .then((cache) => cache.match(event.request))
      .then(
        (hit) =>
          hit ??
          caches
            .open(cacheName(version, PUBLIC_SCOPED))
            .then((cache) => cache.match(event.request))
            .then((publicHit) => publicHit ?? fetch(event.request))
      )
  );
});

/**
 * Serving a request for a non-terminal Run from a staged version is the same
 * fault as activating one, so the answer is always the version that Run was
 * pinned against.
 */
function versionForRequest() {
  for (const run of runs.values()) {
    if (!run.terminal) {
      return run.version || activeVersion;
    }
  }
  return activeVersion;
}

/** @param {{ version: string, assets: { url: string, scope?: string }[] }} message */
async function pin(message) {
  const accountCache = await caches.open(
    cacheName(message.version, ACCOUNT_SCOPED)
  );
  const publicCache = await caches.open(
    cacheName(message.version, PUBLIC_SCOPED)
  );
  for (const asset of message.assets ?? []) {
    const cache = asset.scope === PUBLIC_SCOPED ? publicCache : accountCache;
    await cache.add(new Request(asset.url, { cache: "reload" }));
  }
  activeVersion ??= message.version;
  return { ok: true, version: message.version };
}

/**
 * Decides whether the staged version may take over, and evicts only what
 * nothing references any more.
 */
async function settle() {
  const nonTerminal = [...runs.values()].filter((run) => !run.terminal);
  const undurable = [...runs.values()].filter(
    (run) => run.terminal && !run.durable
  );

  if (staged?.blocked && nonTerminal.length > 0) {
    // A version blocked for security cannot be activated and cannot be played
    // through either. Pausing preserves Active Run Recovery; the Explorer
    // reconnects rather than continuing under rules that changed underneath.
    return { ...status(), paused: true };
  }
  if (nonTerminal.length > 0 || undurable.length > 0) {
    return { ...status(), paused: false };
  }
  if (staged && !staged.blocked) {
    activeVersion = staged.version;
    staged = null;
  }
  await evictUnreferenced();
  return { ...status(), paused: false };
}

async function evictUnreferenced() {
  const referenced = new Set(
    [...runs.values()].map((run) => run.version).filter(Boolean)
  );
  if (activeVersion) {
    referenced.add(activeVersion);
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

/**
 * Sign-out removes the account-scoped half of every pinned version. The public
 * shell, fonts, and other non-account assets may stay: they carry nothing that
 * belongs to the Explorer who signed out, and another account can neither
 * reuse nor inspect anything that does.
 */
async function dropAccountScoped() {
  for (const name of await caches.keys()) {
    if (name.startsWith(PIN_PREFIX) && name.endsWith(`-${ACCOUNT_SCOPED}`)) {
      await caches.delete(name);
    }
  }
  runs.clear();
  return { ok: true };
}

function status() {
  return {
    activeVersion,
    stagedVersion: staged?.version ?? null,
    nonTerminalRuns: [...runs.values()].filter((run) => !run.terminal).length
  };
}

/** @param {string} version @param {string} scope */
function cacheName(version, scope) {
  return `${PIN_PREFIX}${version}-${scope}`;
}
