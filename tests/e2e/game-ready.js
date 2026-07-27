import { expect } from "@playwright/test";

/**
 * The app swaps in the real Run asynchronously after the load event; input
 * sent before `data-game-ready` lands on the placeholder Run and is silently
 * lost when the swap resets progress. Every test that drives gameplay must
 * cross this barrier first.
 *
 * The bound is explicit because readiness spans the main-chunk fetch plus run
 * initialisation, which under a fully loaded worker queue legitimately
 * exceeds the 5s default.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function expectGameReady(page) {
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-game-ready",
    "true",
    { timeout: 15000 }
  );
}
