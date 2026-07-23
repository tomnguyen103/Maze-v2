import { expect, test } from "@playwright/test";

const WINNING_PATH = "down,down,right,right,down,down,left,left,down,down,right,right,down,down,left,left,down,down,right,right,right,right,up,up,up,up,right,right,right,right,up,up,right,right,down,right,right,down,down,down,down,down,down,down,left,left,left,left,left,right,right,right,right,right,up,up,up,up,up,up,up,up,up,up,up,up,left,left,left,left,left,left,left,left,left,left,right,right,right,right,right,right,right,right,right,right,down,down,down,down,down,down,down,down,down,down,down,down,left,left,left,left,left,left,left,left,left,left,left,left".split(",");
const KEY_BY_DIRECTION = /** @type {Record<string, string>} */ ({
  up: "ArrowUp",
  right: "ArrowRight",
  down: "ArrowDown",
  left: "ArrowLeft"
});

test("starts a playable maze and responds to keyboard actions", async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Recover the echoes/i })
  ).toBeVisible();
  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
    if ((await page.locator("#moves-value").textContent()) !== "000") {
      break;
    }
  }
  await expect(page.locator("#moves-value")).not.toHaveText("000");

  await page.keyboard.press("q");
  await expect(page.locator("#pulse-count")).toHaveText("1");
  expect(pageErrors).toEqual([]);
});

test("keeps touch controls usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const touchActions = page.locator("button:visible, a:visible");
  for (let index = 0; index < (await touchActions.count()); index += 1) {
    const action = touchActions.nth(index);
    const bounds = await action.boundingBox();
    expect(bounds?.width, `touch action ${index} width`).toBeGreaterThanOrEqual(44);
    expect(bounds?.height, `touch action ${index} height`).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("never starts audio before the player opts in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sound off" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("preserves native button keyboard behavior and pause timing", async ({
  page
}) => {
  await page.goto("/?seed=BUTTON-KEYS");
  const pulseCount = page.locator("#pulse-count");
  await page.getByRole("button", { name: "Pause" }).focus();
  await page.keyboard.press("Space");

  await expect(page.locator("#run-state")).toHaveText("Paused");
  await expect(pulseCount).toHaveText("2");
  const pausedTime = await page.locator("#time-value").textContent();
  await page.waitForTimeout(250);
  await expect(page.locator("#time-value")).toHaveText(pausedTime ?? "00:00");

  await page.getByRole("button", { name: "Resume" }).press("Space");
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("supports swipe movement and fresh seeded runs", async ({ page }) => {
  await page.goto("/?seed=TRIAL-0");
  const canvas = page.getByLabel(/Interactive maze/);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Expected the maze Canvas.");
  }
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2 + 80
  });
  await expect(page.locator("#moves-value")).toHaveText("001");

  await page.getByRole("button", { name: "New maze" }).click();
  await expect(page.locator("#seed-value")).not.toHaveText("TRIAL-0");
  expect(new URL(page.url()).searchParams.get("seed")).not.toBe("TRIAL-0");
});

test("completes a seeded passage, records the result, and replays it", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One full browser passage is sufficient.");
  await page.goto("/?seed=TRIAL-0");

  for (const direction of WINNING_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }

  const dialog = page.getByRole("dialog", { name: "You carried the Echoes out." });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-seed")).toHaveText("TRIAL-0");
  await expect(page.locator("#result-rank")).toHaveText(/Wayfinder|Survivor|Lightkeeper/);
  await expect(page.locator("#best-run")).toContainText("TRIAL-0");

  await page.getByRole("button", { name: "Replay seed" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#seed-value")).toHaveText("TRIAL-0");
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  await page.reload();
  await expect(page.locator("#best-run")).toContainText("TRIAL-0");
});

test("reflows across required widths and keeps the game in the laptop fold", async ({
  page
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${viewport.width}px viewport overflow`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const brief = await page.locator(".mission__brief").boundingBox();
  const maze = await page.locator("#maze-canvas").boundingBox();
  if (!brief || !maze) {
    throw new Error("Expected the mission and maze to be rendered.");
  }
  expect(brief.y + brief.height).toBeLessThan(800);
  expect(maze?.y).toBeLessThan(800);
});

test("preserves layout with reduced motion and 200 percent text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
    document.querySelector("#canvas-frame")?.classList.add("is-hurt");
  });

  const animationDuration = await page
    .locator("#canvas-frame")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.001);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
