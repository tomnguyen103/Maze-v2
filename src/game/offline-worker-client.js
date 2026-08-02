import { normalizeOfflineAssetPackage } from "../../shared/offline-asset-package.js";

const ACCOUNT_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** @typedef {{ ok: true, registration: ServiceWorkerRegistration, worker: ServiceWorker } | { ok: false, reason: string }} OfflineWorkerRegistration */

/** @param {unknown} value @returns {boolean} */
function validAccountScope(value) {
  return typeof value === "string" && ACCOUNT_SCOPE_PATTERN.test(value);
}

/**
 * Small browser-side boundary for the hand-written worker. It owns message
 * ports and turns registration, unsupported browsers, and failed pins into an
 * explicit result that the game can present honestly.
 *
 * @param {{
 *   navigatorLike?: Navigator,
 *   workerPath?: string,
 *   messageChannel?: () => MessageChannel,
 *   timeoutMs?: number
 * }} [dependencies]
 */
export function createOfflineWorkerClient({
  navigatorLike = globalThis.navigator,
  workerPath = "/sw.js",
  messageChannel = () => new MessageChannel(),
  timeoutMs = 8000
} = {}) {
  /** @type {Promise<OfflineWorkerRegistration> | null} */
  let registrationPromise = null;

  /** @returns {Promise<OfflineWorkerRegistration>} */
  async function registration() {
    if (!navigatorLike?.serviceWorker?.register) {
      return { ok: false, reason: "unsupported" };
    }
    registrationPromise ??= navigatorLike.serviceWorker
      .register(workerPath)
      .then(async (registered) => {
        const worker =
          registered.active ??
          (await navigatorLike.serviceWorker.ready).active ??
          registered.waiting ??
          registered.installing;
        return /** @type {OfflineWorkerRegistration} */ (worker
          ? { ok: true, registration: registered, worker }
          : { ok: false, reason: "inactive" });
      })
      .catch(() => /** @type {OfflineWorkerRegistration} */ ({
        ok: false,
        reason: "registration"
      }));
    return registrationPromise;
  }

  /** @param {ServiceWorker} worker @param {Record<string, unknown>} message */
  function postMessage(worker, message) {
    const channel = messageChannel();
    return new Promise((resolve) => {
      let settled = false;
      /** @param {unknown} value */
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = setTimeout(
        () => finish({ ok: false, reason: "timeout" }),
        Math.max(1, timeoutMs)
      );
      channel.port1.onmessage = (event) => finish(event.data);
      try {
        worker.postMessage(message, [channel.port2]);
      } catch {
        finish({ ok: false, reason: "message" });
      }
    });
  }

  /** @param {Record<string, unknown>} message */
  async function message(message) {
    const result = await registration();
    if (!result.ok) {
      return result;
    }
    return postMessage(result.worker, message);
  }

  async function signOut() {
    if (registrationPromise) {
      return message({ type: "sign-out" });
    }
    const serviceWorker = navigatorLike?.serviceWorker;
    const controller = serviceWorker?.controller;
    if (controller) {
      return postMessage(controller, { type: "sign-out" });
    }
    if (typeof serviceWorker?.getRegistration === "function") {
      try {
        const existing = await serviceWorker.getRegistration();
        const worker =
          existing?.active ?? existing?.waiting ?? existing?.installing;
        if (worker) {
          return postMessage(worker, { type: "sign-out" });
        }
      } catch {
        // A missing or inaccessible registration is equivalent to no worker.
      }
    }
    return { ok: true, reason: "not-registered" };
  }

  return {
    register: registration,
    /** @param {Record<string, unknown>} value */
    message,
    /**
     * @param {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} assetPackage
     * @param {{ accountScope?: string | null }} [options]
     */
    async pin(assetPackage, { accountScope = null } = {}) {
      let normalized;
      try {
        normalized = normalizeOfflineAssetPackage(assetPackage);
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : "invalid-package"
        };
      }
      const needsAccountScope = normalized.assets.some(
        (asset) => asset.scope === "account"
      );
      if (
        (needsAccountScope || accountScope !== null) &&
        !validAccountScope(accountScope)
      ) {
        return {
          ok: false,
          reason: "account-scope"
        };
      }
      return message({
        type: "pin",
        ...normalized,
        ...(accountScope ? { accountScope } : {})
      });
    },
    /**
     * @param {{
     *   runId: string,
     *   version: string,
     *   terminal: boolean,
     *   durable: boolean,
     *   accountScope?: string | null
     * }} state
     */
    setRunState(state) {
      if (state.accountScope != null && !validAccountScope(state.accountScope)) {
        return Promise.resolve({ ok: false, reason: "account-scope" });
      }
      return message({
        type: "run-state",
        runId: state.runId,
        version: state.version,
        terminal: state.terminal === true,
        durable: state.durable === true,
        ...(state.accountScope ? { accountScope: state.accountScope } : {})
      });
    },
    /** @param {string} runId */
    release(runId) {
      return message({ type: "release", runId });
    },
    /** @param {string} version @param {{ blocked?: boolean }} [options] */
    stage(version, { blocked = false } = {}) {
      return message({ type: "stage", version, blocked });
    },
    signOut,
    status() {
      return message({ type: "status" });
    }
  };
}
