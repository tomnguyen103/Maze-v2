import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getFirstLightQuestion } from "../../src/game/first-light.js";
import { expectGameReady } from "./game-ready.js";

const ACTIVE_RUN_RECOVERY_KEY =
  "echo-maze:active-run-recovery:v1";
const ACTIVE_RUN_RECOVERY_MAX_BYTES = 256 * 1024;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, "__echoMazePlayerDependencies", {
      clerkBrowser: {
        user: null,
        getToken: async () => null,
        initialize: async () => false,
        openSignIn: async () => false,
        openSignUp: async () => false,
        openUserProfile: async () => false,
        signOut: async () => {}
      }
    });
  });
  await page.route("**/api/access/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enforcementEnabled: false,
        guestDemoEnforcementEnabled: false
      })
    })
  );
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ globalMaxScore: 0, entries: [] })
    })
  );
});

/**
 * @param {import("@playwright/test").Page} page
 */
function watchRuntimeProblems(page) {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    const text = message.text();
    const source = message.location().url;
    if (
      message.type() === "error" ||
      message.type() === "warning"
    ) {
      problems.push(
        `${message.type()}: ${text}${source ? ` (${source})` : ""}`
      );
    }
  });
  return problems;
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function moveOnce(page) {
  for (const key of [
    "ArrowUp",
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft"
  ]) {
    await page.keyboard.press(key);
    if ((await page.locator("#moves-value").textContent()) !== "000") {
      return;
    }
  }
  throw new Error("Expected one available movement.");
}

/**
 * @param {import("@playwright/test").Locator} dialog
 */
async function expectAccessibleActions(dialog) {
  const actions = dialog.getByRole("button");
  const count = await actions.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const action = actions.nth(index);
    const bounds = await action.boundingBox();
    expect(bounds?.width, `action ${index} width`).toBeGreaterThanOrEqual(
      44
    );
    expect(bounds?.height, `action ${index} height`).toBeGreaterThanOrEqual(
      44
    );
    expect(
      await action.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }),
      `action ${index} text lines`
    ).toBe(1);
  }
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {"first-light" | "campfire"} state
 */
async function recordReleaseScreenshot(page, testInfo, state) {
  const body = await page.screenshot();
  await testInfo.attach(`${state}-${testInfo.project.name}`, {
    body,
    contentType: "image/png"
  });
  if (process.env.RECORD_MILESTONE_1_SCREENSHOTS === "true") {
    await writeFile(
      resolve(
        "docs",
        "playtests",
        "screenshots",
        `milestone-1-${state}-${testInfo.project.name}.png`
      ),
      body
    );
  }
}

test("keeps First Light isolated through replay, Quest handoff, Continue, and Restart", async ({
  page
}) => {
  const runtimeProblems = watchRuntimeProblems(page);
  await page.goto("/play");
  await expectGameReady(page);

  const firstLight = page.getByRole("dialog", {
    name: "Your First Light"
  });
  await expect(firstLight).toBeVisible();
  await expect(page.locator("#first-light-title")).toBeFocused();
  const skipToQuest = page.getByRole("button", {
    name: "Skip to Quest"
  });
  await skipToQuest.focus();
  await expect(skipToQuest).toBeFocused();
  await skipToQuest.press("Enter");
  const levelChoice = page.getByRole("dialog", {
    name: "Choose your Quest Level"
  });
  await expect(levelChoice).toBeVisible();
  await expect(page.locator("#level-title")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), ACTIVE_RUN_RECOVERY_KEY)
    )
    .toBeNull();
  const replayFirstLight = page.getByRole("button", {
    name: "Replay First Light"
  });
  await replayFirstLight.focus();
  await expect(replayFirstLight).toBeFocused();
  await replayFirstLight.press("Enter");
  await expect(page.locator("body")).toHaveAttribute(
    "data-run-mode",
    "first-light"
  );
  await expect(page.locator("#maze-canvas")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), ACTIVE_RUN_RECOVERY_KEY)
    )
    .toBeNull();

  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  const challenge = page.getByRole("dialog", {
    name: "A Warden blocks the path."
  });
  await expect(challenge).toBeVisible();
  const showHint = page.getByRole("button", { name: "Show Hint" });
  await expect(showHint).toBeFocused();
  await showHint.press("Enter");
  await expect(page.locator("#challenge-question")).toBeFocused();
  const firstLightQuestion = getFirstLightQuestion({
    wardenId: 0,
    attempt: 0
  });
  const correctChoice = page.locator(
    `[data-answer="${firstLightQuestion.answerId}"]`
  );
  await correctChoice.focus();
  await expect(correctChoice).toBeFocused();
  await correctChoice.press("Enter");
  await expect(challenge).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), ACTIVE_RUN_RECOVERY_KEY)
    )
    .toBeNull();

  await page.keyboard.press("ArrowDown");
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const result = page.getByRole("dialog", {
    name: "First Light complete."
  });
  await expect(result).toBeVisible();
  await expect(page.locator("#result-title")).toBeFocused();
  const chooseQuestLevel = page.getByRole("button", {
    name: "Choose Quest Level"
  });
  await chooseQuestLevel.focus();
  await expect(chooseQuestLevel).toBeFocused();
  await chooseQuestLevel.press("Enter");

  await expect(levelChoice).toBeVisible();
  await expect(
    page.getByRole("dialog", {
      name: "Continue from the Campfire?"
    })
  ).not.toBeVisible();
  const trailScout = page.locator('[data-level="trail-scout"]');
  await trailScout.focus();
  await expect(trailScout).toBeFocused();
  await expect(trailScout).toBeEnabled();
  await trailScout.press("Enter");
  await expect(levelChoice).not.toBeVisible({ timeout: 15000 });
  await expect(page.locator("body")).toHaveAttribute(
    "data-run-mode",
    "quest"
  );
  await expect(page.locator("#maze-canvas")).toBeFocused();
  await moveOnce(page);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), ACTIVE_RUN_RECOVERY_KEY)
    )
    .not.toBeNull();

  await page.reload();
  await expectGameReady(page);
  const campfire = page.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await expect(page.locator("#campfire-resume-title")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    campfire.getByRole("button", { name: "Continue Run" })
  ).toBeFocused();
  await campfire
    .getByRole("button", { name: "Continue Run" })
    .press("Enter");
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#maze-canvas")).toBeFocused();

  await page.reload();
  await expectGameReady(page);
  await expect(campfire).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    campfire.getByRole("button", { name: "Restart Run" })
  ).toBeFocused();
  await campfire
    .getByRole("button", { name: "Restart Run" })
    .press("Enter");
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#maze-canvas")).toBeFocused();
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), ACTIVE_RUN_RECOVERY_KEY)
    )
    .toBeNull();
  expect(runtimeProblems).toEqual([]);
});

for (const recoveryState of ["corrupt", "oversized"]) {
  test(`keeps current-tab play safe when recovery is ${recoveryState}`, async ({
    page
  }) => {
    const runtimeProblems = watchRuntimeProblems(page);
    await page.goto(
      `/play?seed=MILESTONE-RECOVERY-${recoveryState.toUpperCase()}&level=trail-scout`
    );
    await expectGameReady(page);
    await page.getByLabel(/Interactive maze/).focus();
    await moveOnce(page);
    await expect
      .poll(() =>
        page.evaluate(
          (key) => localStorage.getItem(key),
          ACTIVE_RUN_RECOVERY_KEY
        )
      )
      .not.toBeNull();
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, value),
      {
        key: ACTIVE_RUN_RECOVERY_KEY,
        value:
          recoveryState === "corrupt"
            ? "{"
            : "x".repeat(ACTIVE_RUN_RECOVERY_MAX_BYTES + 1)
      }
    );

    await page.reload();
    await expectGameReady(page);
    await expect(
      page.getByRole("dialog", {
        name: "Continue from the Campfire?"
      })
    ).not.toBeVisible();
    await expect(page.locator("#event-ribbon")).toHaveText(
      "Campfire Resume is unavailable for this Run. Current-tab play continues."
    );
    await expect(page.locator("#event-ribbon")).not.toContainText(
      /SyntaxError|SecurityError|JSON|256|KiB|bytes/i
    );
    await expect(page.locator("#maze-canvas")).toBeFocused();
    await moveOnce(page);
    expect(runtimeProblems).toEqual([]);
  });
}

test("keeps First Light and Campfire choices accessible at exact release viewports", async ({
  page
}, testInfo) => {
  const runtimeProblems = watchRuntimeProblems(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, "getRandomValues", {
      configurable: true,
      /** @param {Uint16Array} values */
      value: (values) => {
        values.fill(0);
        values[0] = 5;
        values[2] = 93;
        return values;
      }
    });
  });
  const viewport =
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto("/play");
  await expectGameReady(page);

  const firstLight = page.getByRole("dialog", {
    name: "Your First Light"
  });
  await expect(firstLight).toBeVisible();
  await recordReleaseScreenshot(page, testInfo, "first-light");
  if (testInfo.project.name === "desktop") {
    for (const dialogViewport of [
      { width: 320, height: 720 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 768, height: 1024 }
    ]) {
      await page.setViewportSize(dialogViewport);
      await expectAccessibleActions(firstLight);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        ),
        `First Light at ${dialogViewport.width}px`
      ).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize(viewport);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect(firstLight).toHaveAttribute(
    "aria-describedby",
    "first-light-intro first-light-boundary"
  );
  await expect(page.locator("#live-region")).toHaveAttribute(
    "aria-live",
    "polite"
  );
  await expectAccessibleActions(firstLight);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);

  await page
    .getByRole("button", { name: "Skip to Quest" })
    .click();
  await page.locator('[data-level="trail-scout"]').click();
  await expect(
    page.getByRole("dialog", { name: "Choose your Quest Level" })
  ).not.toBeVisible({ timeout: 15000 });
  await expect(page.locator("body")).toHaveAttribute(
    "data-run-mode",
    "quest"
  );
  await expect(page.locator("#maze-canvas")).toBeFocused();
  await moveOnce(page);
  await page.reload();
  await expectGameReady(page);
  const campfire = page.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await recordReleaseScreenshot(page, testInfo, "campfire");
  if (testInfo.project.name === "desktop") {
    for (const dialogViewport of [
      { width: 320, height: 720 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 768, height: 1024 }
    ]) {
      await page.setViewportSize(dialogViewport);
      await expectAccessibleActions(campfire);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        ),
        `Campfire at ${dialogViewport.width}px`
      ).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize(viewport);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect(campfire).toHaveAttribute(
    "aria-describedby",
    "campfire-resume-intro campfire-resume-boundary"
  );
  await expect(page.locator("#campfire-resume-title")).toBeFocused();
  await expectAccessibleActions(campfire);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  expect(
    await campfire.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    )
  ).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(campfire).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    campfire.getByRole("button", { name: "Continue Run" })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#maze-canvas")).toBeFocused();
  expect(runtimeProblems).toEqual([]);
});
