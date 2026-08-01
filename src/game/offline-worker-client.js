import { normalizeOfflineAssetPackage } from "../../shared/offline-asset-package.js";

const ACCOUNT_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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
  let registrationPromise = null;

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
        return worker
          ? { ok: true, registration: registered, worker }
          : { ok: false, reason: "inactive" };
      })
      .catch(() => ({ ok: false, reason: "registration" }));
    return registrationPromise;
  }

  /** @param {Record<string, unknown>} message */
  async function message(message) {
    const result = await registration();
    if (!result.ok) {
      return result;
    }
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
        result.worker.postMessage(message, [channel.port2]);
      } catch {
        finish({ ok: false, reason: "message" });
      }
    });
  }

  return {
    register: registration,
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
      if (needsAccountScope && !validAccountScope(accountScope)) {
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
    }
  };
}
