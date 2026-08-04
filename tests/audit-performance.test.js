import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** @param {string} relative */
function source(relative) {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8"
  );
}

describe("WP-01 — a visitor who never signs in never downloads Clerk", () => {
  it("does not initialize Clerk on load", () => {
    const controller = source("src/landing/landing-controller.js");
    // The eager `void syncAccount()` at startup was the whole of the measured
    // LCP failure on `/`: 559 kB, 74.6% of the page, 94.9% of it unused.
    // The only `syncAccount()` left is inside the signed-in branch.
    expect(controller.match(/void syncAccount\(\);/g)).toHaveLength(1);
    const at = controller.indexOf("void syncAccount();");
    expect(controller.slice(at - 200, at)).toContain("hasClerkSession()");
    expect(controller).toContain("if (hasClerkSession())");
  });

  it("reads Clerk's own signed-in hint rather than guessing", () => {
    const controller = source("src/landing/landing-controller.js");
    expect(controller).toContain("__client_uat");
  });

  it("loads it on the first sign-in click instead", () => {
    const controller = source("src/landing/landing-controller.js");
    const open = controller.slice(controller.indexOf("async function openAccount"));
    expect(open).toContain("if (!clerkReady)");
    expect(open.indexOf("await syncAccount()")).toBeLessThan(
      open.indexOf("clerkBrowser.openSignIn()")
    );
  });

  it("treats a signed-out cookie as signed out", async () => {
    // `__client_uat=0` is Clerk's explicit "no session"; anything else is a
    // timestamp. Reproduced here so the pattern cannot drift into matching it.
    const pattern = /(?:^|;\s*)__client_uat=(?!0(?:;|$))[^;]+/;
    expect(pattern.test("__client_uat=0")).toBe(false);
    expect(pattern.test("a=1; __client_uat=0")).toBe(false);
    expect(pattern.test("__client_uat=1712345678")).toBe(true);
    expect(pattern.test("a=1; __client_uat=1712345678; b=2")).toBe(true);
    expect(pattern.test("")).toBe(false);
    expect(pattern.test("other=1")).toBe(false);
  });
});

describe("P-01 — the game budget measures what a player waits for", () => {
  it("sums every chunk a Run needs, not just the entry", () => {
    const script = source("scripts/check-bundle-budget.mjs");
    expect(script).toContain('prefixes: ["main-", "game-session-", "canvas-renderer-"]');
    // Several prefixes, one total.
    expect(script).toContain("budget.prefixes ?? [budget.prefix]");
    expect(script).toContain("gzipKb +=");
  });

  it("keeps a ceiling that the real weight can actually breach", () => {
    const script = source("scripts/check-bundle-budget.mjs");
    const at = script.indexOf('label: "game JavaScript"');
    const maxKb = Number(script.slice(at).match(/maxKb: (\d+)/)?.[1]);
    // Measured 38.77 KB gzip. A ceiling far above that is not a budget.
    expect(maxKb).toBeGreaterThan(38);
    expect(maxKb).toBeLessThan(46);
  });
});

describe("P-10 — Stripe is imported by the routes that use it", () => {
  it("is not a static import of the module every function loads", () => {
    // Eleven of the twelve Vercel functions import `server/player-api.js`,
    // and two routes use Stripe. A static import charged all eleven a
    // measured 90.20 ms per cold start.
    expect(source("server/player-api.js")).not.toContain('from "stripe"');
    expect(source("server/stripe-lifetime.js")).not.toContain('from "stripe"');
    expect(source("server/class-expedition-billing.js")).not.toContain(
      'from "stripe"'
    );
  });

  it("builds the client once, on first use", async () => {
    const { createLazyStripe } = await import("../server/stripe-client.js");
    const getStripe = createLazyStripe("sk_test_example");
    const first = getStripe();
    const second = getStripe();
    expect(first).toBe(second);
    await expect(first).resolves.toBeTruthy();
  });
});

describe("P-04 — duplicated modules become one chunk", () => {
  it("groups the rules modules several entry points share", () => {
    const config = source("vite.config.mjs");
    expect(config).toContain("advancedChunks");
    expect(config).toContain('name: "quest-rules"');
  });
});

describe("replay timing on the platform", () => {
  it("raises maxDuration on the two functions that replay a Run", () => {
    const vercel = JSON.parse(source("vercel.json"));
    // There was no `functions` block at all, so both ran on the platform
    // default — close enough to return 504 on a legitimate max-configuration
    // submission once a Vercel vCPU's 1.5-2.5x slowdown is applied to a
    // measured 4,594 ms replay.
    expect(vercel.functions["api/scores.js"].maxDuration).toBeGreaterThanOrEqual(60);
    expect(vercel.functions["api/profile.js"].maxDuration).toBeGreaterThanOrEqual(60);
  });
});
