import { describe, expect, it, vi } from "vitest";
import { sendVisitBeacon } from "../src/landing/visit-beacon.js";

/** @returns {Storage} */
function memoryStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return /** @type {Storage} */ (
    /** @type {unknown} */ ({
      getItem: (/** @type {string} */ key) => values.get(key) ?? null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) =>
        values.set(key, String(value))
    })
  );
}

/**
 * @param {{
 *   search?: string,
 *   sessionStorage?: Storage,
 *   webdriver?: boolean,
 *   fetch?: import("vitest").Mock
 * }} [options]
 */
function browser({
  search = "",
  sessionStorage = memoryStorage(),
  webdriver = false,
  fetch = vi.fn(async () => new Response(null, { status: 204 }))
} = {}) {
  return {
    fetch,
    location: { search },
    navigator: { webdriver },
    sessionStorage
  };
}

/** @param {ReturnType<typeof browser>} environment */
function send(environment) {
  sendVisitBeacon(
    /** @type {Parameters<typeof sendVisitBeacon>[0]} */ (
      /** @type {unknown} */ (environment)
    )
  );
}

describe("Landing visit beacon", () => {
  it("US-09.1 sends the allowlisted Campaign Code from the link", () => {
    const environment = browser({ search: "?c=YouTube&utm_source=ad" });

    send(environment);

    expect(environment.fetch).toHaveBeenCalledWith("/api/access/visit", {
      body: JSON.stringify({ campaign: "youtube" }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST"
    });
  });

  it("US-09.2 sends the empty campaign for an unknown code, so the raw value stays in the browser", () => {
    const environment = browser({ search: "?c=parent%40example.test" });

    send(environment);

    expect(environment.fetch).toHaveBeenCalledWith(
      "/api/access/visit",
      expect.objectContaining({ body: JSON.stringify({ campaign: "" }) })
    );
  });

  it("US-09.4 sends one beacon per tab session", () => {
    const environment = browser({ search: "?c=reddit" });

    send(environment);
    send(environment);
    send(environment);

    expect(environment.fetch).toHaveBeenCalledTimes(1);
  });

  it("US-09.3 skips an automated browser", () => {
    const environment = browser({ webdriver: true });

    send(environment);

    expect(environment.fetch).not.toHaveBeenCalled();
  });

  it("US-09.5 swallows blocked storage and sends nothing", () => {
    const blocked = /** @type {Storage} */ (
      /** @type {unknown} */ ({
        getItem: () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
        setItem: () => {}
      })
    );
    const environment = browser({ sessionStorage: blocked });

    expect(() => send(environment)).not.toThrow();
    expect(environment.fetch).not.toHaveBeenCalled();
  });

  it("US-09.5 swallows a failed request", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      expect(() => send(browser({ fetch }))).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
