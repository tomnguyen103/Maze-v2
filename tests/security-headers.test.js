import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  clerkHostFromPublishableKey,
  contentSecurityPolicy,
  createSecurityHeadersMiddleware,
  securityHeaders
} from "../server/security-headers.js";

/** @param {string[]} values */
function keywordsOf(values) {
  return values.filter((entry) => !entry.startsWith("https://"));
}

/** @param {string} policy */
function directives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
      })
  );
}

const devKey = `pk_test_${Buffer.from("bright-fox-42.clerk.accounts.dev$").toString("base64")}`;
const liveKey = `pk_live_${Buffer.from("clerk.echomaze.example$").toString("base64")}`;

describe("clerkHostFromPublishableKey", () => {
  it("decodes the development instance host", () => {
    expect(clerkHostFromPublishableKey(devKey)).toBe(
      "bright-fox-42.clerk.accounts.dev"
    );
  });

  it("decodes a production custom domain", () => {
    expect(clerkHostFromPublishableKey(liveKey)).toBe(
      "clerk.echomaze.example"
    );
  });

  it("returns null instead of throwing on an unusable key", () => {
    expect(clerkHostFromPublishableKey("")).toBeNull();
    expect(clerkHostFromPublishableKey("pk_test")).toBeNull();
    expect(clerkHostFromPublishableKey("pk_test_!!!not-base64!!!")).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  it("allows only self by default", () => {
    const policy = directives(contentSecurityPolicy({}));
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("style-src")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
  });

  it("blocks the injection vectors the app never uses", () => {
    const policy = directives(contentSecurityPolicy({}));
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("never permits inline or eval'd script, with or without Clerk", () => {
    for (const options of [{}, { clerkHost: "x.clerk.accounts.dev" }]) {
      const policy = directives(contentSecurityPolicy(options));
      expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
      expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
      expect(contentSecurityPolicy(options)).not.toContain("'unsafe-eval'");
    }
  });

  it("permits inline style only once Clerk is configured", () => {
    // Clerk's UI bundle injects its own <style> at runtime. Our own markup and
    // CSS carry none, so the guest-only deployment keeps the stricter policy.
    expect(directives(contentSecurityPolicy({})).get("style-src")).toEqual([
      "'self'"
    ]);
    expect(
      directives(
        contentSecurityPolicy({ clerkHost: "x.clerk.accounts.dev" })
      ).get("style-src")
    ).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("permits Clerk telemetry only once Clerk is configured", () => {
    expect(
      directives(
        contentSecurityPolicy({ clerkHost: "x.clerk.accounts.dev" })
      ).get("connect-src")
    ).toContain("https://clerk-telemetry.com");
    expect(contentSecurityPolicy({})).not.toContain("clerk-telemetry");
  });

  it("allows the Turnstile script, not only its frame", () => {
    // Clerk's bot protection loads a script from challenges.cloudflare.com.
    // frame-src alone blocks the CAPTCHA when bot protection is enabled.
    const policy = directives(
      contentSecurityPolicy({ clerkHost: "x.clerk.accounts.dev" })
    );
    expect(policy.get("script-src")).toContain(
      "https://challenges.cloudflare.com"
    );
    expect(policy.get("frame-src")).toContain(
      "https://challenges.cloudflare.com"
    );
    expect(contentSecurityPolicy({})).not.toContain("challenges.cloudflare.com");
  });

  it("allows everything the Clerk sign-in surface needs", () => {
    // Derived from what src/player/clerk-browser.js actually does: it injects a
    // script tag from the instance host and Clerk frames its own components.
    const host = "bright-fox-42.clerk.accounts.dev";
    const policy = directives(contentSecurityPolicy({ clerkHost: host }));
    expect(policy.get("script-src")).toContain(`https://${host}`);
    expect(policy.get("connect-src")).toContain(`https://${host}`);
    expect(policy.get("frame-src")).toContain(`https://${host}`);
    expect(policy.get("frame-src")).toContain(
      "https://challenges.cloudflare.com"
    );
    expect(policy.get("style-src")).toContain("'unsafe-inline'");
    expect(policy.get("img-src")).toContain("https://img.clerk.com");
    expect(policy.get("worker-src")).toContain("blob:");
  });

  it("permits the Stripe-hosted Checkout redirect as a form target only", () => {
    const policy = directives(contentSecurityPolicy({}));
    expect(policy.get("form-action")).toEqual([
      "'self'",
      "https://checkout.stripe.com"
    ]);
    expect(policy.get("script-src")).not.toContain(
      "https://checkout.stripe.com"
    );
  });

  it("adds the resolved Clerk host to the directives Clerk actually needs", () => {
    const policy = directives(
      contentSecurityPolicy({ clerkHost: "bright-fox-42.clerk.accounts.dev" })
    );
    const host = "https://bright-fox-42.clerk.accounts.dev";
    expect(policy.get("script-src")).toContain(host);
    expect(policy.get("connect-src")).toContain(host);
    expect(policy.get("frame-src")).toContain(host);
    expect(policy.get("img-src")).toContain("https://img.clerk.com");
    expect(policy.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  it("omits Clerk hosts entirely when no key is configured", () => {
    const policy = contentSecurityPolicy({});
    expect(policy).not.toContain("clerk");
  });

  it("upgrades insecure requests only in production", () => {
    expect(contentSecurityPolicy({ production: true })).toContain(
      "upgrade-insecure-requests"
    );
    expect(contentSecurityPolicy({})).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("sets the non-CSP hardening headers", () => {
    const headers = securityHeaders({});
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  it("denies every powerful feature the game does not use", () => {
    const policy = securityHeaders({})["permissions-policy"];
    for (const feature of [
      "camera",
      "microphone",
      "geolocation",
      "payment",
      "usb"
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("sends HSTS only in production, never over plain local HTTP", () => {
    expect(securityHeaders({ production: true })["strict-transport-security"])
      .toBe("max-age=31536000; includeSubDomains");
    expect(
      securityHeaders({})["strict-transport-security"]
    ).toBeUndefined();
  });
});

describe("createSecurityHeadersMiddleware", () => {
  it("applies every header and continues the chain", () => {
    const middleware = createSecurityHeadersMiddleware({
      CLERK_PUBLISHABLE_KEY: devKey
    });
    /** @type {Record<string, string>} */
    const applied = {};
    let continued = false;
    middleware(
      /** @type {never} */ ({}),
      /** @type {never} */ ({
        /**
         * @param {string} name
         * @param {string} value
         */
        setHeader(name, value) {
          applied[name] = value;
        }
      }),
      () => {
        continued = true;
      }
    );
    expect(continued).toBe(true);
    expect(applied["x-content-type-options"]).toBe("nosniff");
    expect(applied["content-security-policy"]).toContain(
      "https://bright-fox-42.clerk.accounts.dev"
    );
  });

  it("falls back to the browser key when only the Vite variable is set", () => {
    const middleware = createSecurityHeadersMiddleware({
      VITE_CLERK_PUBLISHABLE_KEY: devKey
    });
    /** @type {Record<string, string>} */
    const applied = {};
    middleware(
      /** @type {never} */ ({}),
      /** @type {never} */ ({
        /**
         * @param {string} name
         * @param {string} value
         */
        setHeader(name, value) {
          applied[name] = value;
        }
      }),
      () => {}
    );
    expect(applied["content-security-policy"]).toContain(
      "https://bright-fox-42.clerk.accounts.dev"
    );
  });

  it("treats NODE_ENV=production as the production posture", () => {
    /** @type {Record<string, string>} */
    const applied = {};
    createSecurityHeadersMiddleware({ NODE_ENV: "production" })(
      /** @type {never} */ ({}),
      /** @type {never} */ ({
        /**
         * @param {string} name
         * @param {string} value
         */
        setHeader(name, value) {
          applied[name] = value;
        }
      }),
      () => {}
    );
    expect(applied["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });
});

describe("vercel.json header parity", () => {
  it("declares the same header names the middleware sets", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    const declared = new Set(
      config.headers[0].headers.map(
        (/** @type {{ key: string }} */ header) => header.key.toLowerCase()
      )
    );
    for (const name of Object.keys(securityHeaders({ production: true }))) {
      expect(declared).toContain(name);
    }
  });

  it("keeps every non-Clerk CSP directive byte-identical to the middleware", async () => {
    // vercel.json cannot derive the Clerk host, so its Clerk-bearing directives
    // use wildcards on purpose. Everything else must not drift.
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    const edge = directives(
      config.headers[0].headers.find(
        (/** @type {{ key: string }} */ header) =>
          header.key === "Content-Security-Policy"
      ).value
    );
    const code = directives(
      contentSecurityPolicy({
        clerkHost: "bright-fox-42.clerk.accounts.dev",
        production: true
      })
    );
    // Only directives that carry a HOST may differ, and only in their hosts:
    // the edge cannot decode the publishable key, so it uses wildcards. Every
    // keyword — 'self', 'unsafe-inline', 'none' — must match exactly. Excluding
    // style-src here is how 'unsafe-inline' silently went missing from the edge
    // copy once before.
    const hostBearing = new Set([
      "script-src",
      "connect-src",
      "frame-src",
      "img-src"
    ]);
    expect([...code.keys()].sort()).toEqual([...edge.keys()].sort());
    for (const [name, value] of code) {
      if (hostBearing.has(name)) {
        expect(keywordsOf(edge.get(name) ?? [])).toEqual(keywordsOf(value));
      } else {
        expect(edge.get(name)).toEqual(value);
      }
    }
  });

  it("gives the edge every Clerk host family the middleware needs", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    const edge = directives(
      config.headers[0].headers.find(
        (/** @type {{ key: string }} */ header) =>
          header.key === "Content-Security-Policy"
      ).value
    );
    // Turnstile is Clerk's bot protection: it loads a script as well as
    // rendering in a frame, so listing it only in frame-src blocks the CAPTCHA.
    expect(edge.get("script-src")).toContain(
      "https://challenges.cloudflare.com"
    );
    expect(edge.get("frame-src")).toContain(
      "https://challenges.cloudflare.com"
    );
    expect(edge.get("connect-src")).toContain("https://clerk-telemetry.com");
    expect(edge.get("style-src")).toContain("'unsafe-inline'");
    expect(edge.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("mirrors the Permissions-Policy feature list exactly", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8")
    );
    const edge = config.headers[0].headers.find(
      (/** @type {{ key: string }} */ header) =>
        header.key === "Permissions-Policy"
    ).value;
    expect(edge).toBe(securityHeaders({})["permissions-policy"]);
  });
});
