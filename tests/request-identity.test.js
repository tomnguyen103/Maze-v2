import { describe, expect, it } from "vitest";
import {
  clientAddress,
  createAddressHasher,
  describeAddressSalt,
  hashClientAddress,
  reportAddressSalt,
  resolveAddressSalt,
  trustsProxyHeaders
} from "../server/request-identity.js";

/**
 * @param {Record<string, string>} headers
 * @param {string} [remoteAddress]
 */
function fakeRequest(headers, remoteAddress = "203.0.113.7") {
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ ({ headers, socket: { remoteAddress } })
  );
}

const strongUrl =
  "postgres://app:9f2c1d4b8a7e6f3c5b2a1d9e@db.neon.tech/echo_maze";

describe("clientAddress", () => {
  it("uses the socket address when no proxy is trusted", () => {
    expect(
      clientAddress(
        fakeRequest({ "x-forwarded-for": "198.51.100.9" }, "203.0.113.7"),
        false
      )
    ).toBe("203.0.113.7");
  });

  it("uses the first forwarded address when a proxy is trusted", () => {
    expect(
      clientAddress(
        fakeRequest({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }),
        true
      )
    ).toBe("198.51.100.9");
  });

  it("falls back to the socket address when the forwarded header is empty", () => {
    expect(clientAddress(fakeRequest({ "x-forwarded-for": "" }), true)).toBe(
      "203.0.113.7"
    );
  });
});

describe("hashClientAddress", () => {
  it("never returns the raw address", () => {
    const hash = hashClientAddress("203.0.113.7", {
      salt: "salt",
      date: "2026-07-26"
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203");
  });

  it("rotates daily", () => {
    expect(
      hashClientAddress("203.0.113.7", { salt: "s", date: "2026-07-26" })
    ).not.toBe(
      hashClientAddress("203.0.113.7", { salt: "s", date: "2026-07-27" })
    );
  });

  it("returns null without an address or without a salt", () => {
    expect(
      hashClientAddress(null, { salt: "s", date: "2026-07-26" })
    ).toBeNull();
    expect(
      hashClientAddress("203.0.113.7", { salt: "", date: "2026-07-26" })
    ).toBeNull();
  });
});

describe("describeAddressSalt", () => {
  it("prefers an explicitly configured salt", () => {
    expect(
      describeAddressSalt({
        REQUEST_ADDRESS_SALT: "explicit",
        DATABASE_URL: strongUrl
      })
    ).toEqual({ salt: "explicit", source: "configured", weak: false });
  });

  it("derives a stable salt from a strong connection string", () => {
    const first = describeAddressSalt({ DATABASE_URL: strongUrl });
    const second = describeAddressSalt({ DATABASE_URL: strongUrl });
    expect(first.source).toBe("derived");
    expect(first.weak).toBe(false);
    expect(first.salt).toMatch(/^[a-f0-9]{64}$/);
    expect(first.salt).toBe(second.salt);
  });

  it("never exposes the connection string in the derived salt", () => {
    const { salt } = describeAddressSalt({ DATABASE_URL: strongUrl });
    expect(salt).not.toContain("9f2c1d4b8a7e6f3c5b2a1d9e");
    expect(salt).not.toContain("neon.tech");
  });

  it("flags a connection string whose secret is guessable", () => {
    // An address hash is only 2^32 possibilities, so a guessable salt makes
    // ip_hash reversible — worse than not hashing at all.
    for (const url of [
      "postgres://postgres:postgres@localhost:5432/echo_maze",
      "postgres://app:short@db.example.com/echo_maze",
      "not-a-url"
    ]) {
      expect(describeAddressSalt({ DATABASE_URL: url }).weak).toBe(true);
    }
  });

  it("reports no salt at all without a database", () => {
    expect(describeAddressSalt({})).toEqual({
      salt: "",
      source: "none",
      weak: false
    });
  });
});

describe("reportAddressSalt", () => {
  it("says nothing when there is no database to key against", () => {
    /** @type {unknown[]} */
    const warnings = [];
    reportAddressSalt({}, (message) => warnings.push(message));
    expect(warnings).toEqual([]);
  });

  it("names the source once so a rotated password is visible in logs", () => {
    /** @type {Record<string, unknown>[]} */
    const warnings = [];
    reportAddressSalt({ DATABASE_URL: strongUrl }, (message, details) =>
      warnings.push({ message, details })
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details).toEqual({ source: "derived" });
  });

  it("warns loudly when the derived salt is guessable", () => {
    /** @type {string[]} */
    const warnings = [];
    reportAddressSalt(
      { DATABASE_URL: "postgres://postgres:postgres@localhost/echo_maze" },
      (message) => warnings.push(message)
    );
    expect(warnings[0]).toMatch(/REQUEST_ADDRESS_SALT/);
    expect(warnings[0]).toMatch(/reversed/);
  });

  it("never puts the salt or the connection string in the log line", () => {
    /** @type {unknown[]} */
    const warnings = [];
    reportAddressSalt({ DATABASE_URL: strongUrl }, (message, details) =>
      warnings.push({ message, details })
    );
    const serialized = JSON.stringify(warnings);
    expect(serialized).not.toContain("9f2c1d4b8a7e6f3c5b2a1d9e");
    expect(serialized).not.toContain(
      resolveAddressSalt({ DATABASE_URL: strongUrl })
    );
  });
});

describe("trustsProxyHeaders", () => {
  it("is off unless explicitly enabled", () => {
    expect(trustsProxyHeaders({})).toBe(false);
    expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: "1" })).toBe(false);
    expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: "true" })).toBe(true);
  });
});

describe("createAddressHasher", () => {
  it("hashes the address the trust policy selects", () => {
    const hasher = createAddressHasher({
      salt: "salt",
      trustProxy: true,
      today: () => "2026-07-26"
    });
    expect(
      hasher(fakeRequest({ "x-forwarded-for": "198.51.100.9" }))
    ).toBe(
      hashClientAddress("198.51.100.9", { salt: "salt", date: "2026-07-26" })
    );
  });

  it("returns null when no salt is configured", () => {
    const hasher = createAddressHasher({ today: () => "2026-07-26" });
    expect(hasher(fakeRequest({}))).toBeNull();
  });
});
