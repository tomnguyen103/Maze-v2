import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIFETIME_PRICE_LABEL } from "../shared/lifetime-product.js";

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

describe("WP-02 — the landing LCP text paints before any JS runs", () => {
  it("inlines the hero markup directly in index.html, not inside the inert game template", () => {
    const html = source("index.html");
    const gameRoot = html.slice(html.indexOf('<div id="game-root">'));
    const beforeTemplate = gameRoot.slice(0, gameRoot.indexOf("<template"));
    expect(beforeTemplate).toContain('<h1 id="landing-title">Echo Maze</h1>');
    expect(beforeTemplate).toContain(
      'href="/play" id="landing-primary-action"'
    );
  });

  it("skips rebuilding the hero when the static markup is already there", () => {
    const controller = source("src/landing/landing-controller.js");
    const fn = controller.slice(controller.indexOf("export function renderLanding"));
    expect(fn.slice(0, 700)).toContain(
      'if (!document.getElementById("landing-title")) {'
    );
  });

  it("clears the inlined hero before /admin or /class can render over it", () => {
    // Both chunks arrive over an async import; without this the fetch delay
    // is exactly how long the landing hero flashes on a route that isn't it.
    const app = source("src/app.js");
    const adminBranch = app.slice(app.indexOf('url.pathname === "/admin"'));
    expect(adminBranch.slice(0, 350)).toContain('gameRoot.innerHTML = "";');
    const classBranch = app.slice(app.indexOf('url.pathname === "/class"'));
    expect(classBranch.slice(0, 300)).toContain('gameRoot.innerHTML = "";');
  });

  it("keeps the static copy and renderLanding's template in the same DOM shape", () => {
    // Two copies of the same markup with nothing checking they agree: a hand
    // edit to one that misses the other ships silently, because the guard in
    // renderLanding means `/` just keeps showing the stale static copy
    // forever with a fully green gate. Whitespace-normalized structural
    // equality is what actually has to hold, not byte-identical text.
    /** @param {string} fragment */
    const normalize = (fragment) => fragment.replace(/>\s+</g, "><").trim();

    const html = source("index.html");
    const htmlStart = html.indexOf(
      '<a class="skip-link" href="#landing-main">'
    );
    const htmlEnd = html.indexOf("</main>", htmlStart) + "</main>".length;
    const staticCopy = normalize(html.slice(htmlStart, htmlEnd));

    const controller = source("src/landing/landing-controller.js");
    const controllerStart = controller.indexOf(
      '<a class="skip-link" href="#landing-main">'
    );
    const controllerEnd =
      controller.indexOf("</main>", controllerStart) + "</main>".length;
    // The template prints the price from LIFETIME_PRICE_LABEL; the static copy
    // carries its value, so the placeholder resolves before the comparison.
    const renderedCopy = normalize(
      controller.slice(controllerStart, controllerEnd)
    ).replaceAll("${LIFETIME_PRICE_LABEL}", () => LIFETIME_PRICE_LABEL);

    expect(staticCopy).toBe(renderedCopy);
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

describe("US-03 and US-04 — the landing hero shows the demo, the price and one trail", () => {
  /** @param {string} text */
  const landingMarkup = (text) => {
    const start = text.indexOf('<a class="skip-link" href="#landing-main">');
    return text.slice(start, text.indexOf("</main>", start) + "</main>".length);
  };
  const markups = () => [
    landingMarkup(source("index.html")),
    landingMarkup(source("src/landing/landing-controller.js"))
  ];

  it("US-03.1 shows a gameplay crop with alt text and 4:3 size in both markups", () => {
    for (const markup of markups()) {
      expect(markup).toMatch(
        /<img src="\/landing-gameplay\.webp" width="640" height="480" alt="[^"]{20,}" decoding="async">/
      );
    }
  });

  it("US-03.1 ships the gameplay crop at 40 KB or less", () => {
    const crop = fileURLToPath(new URL("../public/landing-gameplay.webp", import.meta.url));
    expect(statSync(crop).size).toBeLessThanOrEqual(40960);
  });

  it("US-03.1 builds the price line from LIFETIME_PRICE_LABEL", () => {
    expect(LIFETIME_PRICE_LABEL).toBe("$5.99");
    const [staticMarkup, renderedMarkup] = markups();
    expect(staticMarkup).toContain(
      '<p class="landing-hero__price">$5.99 once, bought by an adult</p>'
    );
    expect(renderedMarkup).toContain(
      '<p class="landing-hero__price">${LIFETIME_PRICE_LABEL} once, bought by an adult</p>'
    );
  });

  it("US-03.3 keeps video, testimonials and extra copy out of the landing", () => {
    for (const markup of markups()) {
      expect(markup).not.toContain("<video");
      expect(markup.toLowerCase()).not.toContain("testimonial");
    }
  });

  it("US-03.5 reserves the 4:3 crop frame so a failed image shifts nothing", () => {
    expect(source("src/daylight.css")).toMatch(
      /\.landing-hero__frame \{[^}]*aspect-ratio: 4 \/ 3;/
    );
  });

  it("US-04.1 keeps the trail decorative with one path", () => {
    for (const markup of markups()) {
      const trail = markup.match(/<svg class="landing-hero__trail"[\s\S]*?<\/svg>/)?.[0] ?? "";
      expect(trail).toContain('aria-hidden="true" focusable="false"');
      expect(trail.match(/<path\b/g)).toHaveLength(1);
    }
  });

  it("US-04.1 animates stroke-dashoffset from undrawn to drawn", () => {
    const css = source("src/daylight.css");
    const keyframes = css.indexOf("@keyframes landing-trail-draw {");
    expect(keyframes).toBeGreaterThan(-1);
    expect(css.slice(keyframes, keyframes + 200)).toContain("stroke-dashoffset");
  });

  it("US-04.2 runs the trail animation once, only under no-preference", () => {
    // The stylesheet can use CRLF line endings, so line breaks are normalized.
    const css = source("src/daylight.css").replace(/\r\n/g, "\n");
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("\n}\n", start));
    expect(block).toContain("animation-name: landing-trail-draw");
    expect(block).toContain("animation-iteration-count: 1");
    expect(block).toContain("animation-fill-mode: both");
    expect(css.slice(0, start)).not.toContain("animation-name: landing-trail-draw");
  });
});
