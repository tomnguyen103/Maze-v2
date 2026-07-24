const DEMO_ACCESS_KEY = "echo-maze:demo-access:v1";

/** @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} DemoAccessStorage */

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
  storage.setItem(
    DEMO_ACCESS_KEY,
    JSON.stringify({ version: 1, completed: true })
  );
}
