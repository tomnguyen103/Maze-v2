import { describe, expect, it } from "vitest";
import {
  clerkHostFromPublishableKey,
  contentSecurityPolicy,
  createSecurityHeadersMiddleware,
  securityHeaders
} from "../server/security-headers.js";

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

  it("never permits inline or eval'd script", () => {
    const policy = contentSecurityPolicy({ clerkHost: "x.clerk.accounts.dev" });
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
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
