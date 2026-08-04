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

/**
 * The level dialog (HM-01) is a 3-step wizard: Practice Intention, Learning
 * Deck, then Quest Level. `data-step` on `#level-dialog` names the visible
 * one, and only the current step's "Next"/"Back" buttons and form controls
 * are in the accessibility tree at a time. A test that picks a level has to
 * reach step 3 first; a test that goes back to re-check an earlier step's
 * radio (e.g. after a rejected level pick leaves the dialog on step 3) has
 * to retreat first. Both directions go through here so every test reaches
 * its target step regardless of where a prior interaction left the dialog.
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} targetStep
 */
export async function goToLevelStep(page, targetStep) {
  const dialog = page.locator("#level-dialog");
  for (;;) {
    const step = Number(await dialog.getAttribute("data-step"));
    if (step === targetStep) {
      return;
    }
    const direction = step < targetStep ? "Next" : "Back";
    await page.getByRole("button", { name: direction, exact: true }).click();
  }
}
