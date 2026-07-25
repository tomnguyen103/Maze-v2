const DEMO_ACCESS_KEY = "echo-maze:demo-access:v1";

/** @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem?: (key: string) => void }} DemoAccessStorage */

/** @param {DemoAccessStorage} [storage] */
export function hasCompletedGuestDemo(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(DEMO_ACCESS_KEY);
    if (!value) {
      return false;
    }
    const record = /** @type {unknown} */ (JSON.parse(value));
    return (
      Boolean(record) &&
      typeof record === "object" &&
      /** @type {{ version?: unknown, completed?: unknown }} */ (record).version === 1 &&
      /** @type {{ completed?: unknown }} */ (record).completed === true
    );
  } catch {
    return false;
  }
}

/** @param {boolean} authenticated @param {DemoAccessStorage} [storage] */
export function requiresDemoAccount(
  authenticated,
  storage = globalThis.localStorage
) {
  return !authenticated && hasCompletedGuestDemo(storage);
}

/** @param {DemoAccessStorage} [storage] */
export function markGuestDemoComplete(storage = globalThis.localStorage) {
  saveGuestDemoRecord(storage, false);
}

/** @param {DemoAccessStorage} [storage] */
export function markGuestDemoPendingAuthentication(
  storage = globalThis.localStorage
) {
  saveGuestDemoRecord(storage, true);
}

/** @param {DemoAccessStorage} [storage] */
export function clearPendingGuestDemo(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(DEMO_ACCESS_KEY);
    if (!value) {
      return;
    }
    const record = /** @type {unknown} */ (JSON.parse(value));
    if (
      Boolean(record) &&
      typeof record === "object" &&
      /** @type {{ version?: unknown, completed?: unknown, pendingAuthentication?: unknown }} */ (record).version === 1 &&
      /** @type {{ completed?: unknown, pendingAuthentication?: unknown }} */ (record).completed === true &&
      /** @type {{ pendingAuthentication?: unknown }} */ (record).pendingAuthentication === true
    ) {
      storage.removeItem?.(DEMO_ACCESS_KEY);
    }
  } catch {
    // Storage failures must not break the guest completion flow.
  }
}

/** @param {DemoAccessStorage} storage @param {boolean} pendingAuthentication */
function saveGuestDemoRecord(storage, pendingAuthentication) {
  try {
    storage.setItem(
      DEMO_ACCESS_KEY,
      JSON.stringify({
        version: 1,
        completed: true,
        pendingAuthentication
      })
    );
  } catch {
    // Storage failures must not break the guest completion flow.
  }
}
