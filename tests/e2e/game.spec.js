import { expect, test } from "@playwright/test";

const WINNING_SEED = "DAYLIGHT-0";
const WINNING_PATH = "right,right,right,right,down,down,down,down,left,left,up,left,left,down,down,down,right,right,right,right,right,right,up,up,up,up,right,right,up,up,right,right,down,down,right,right,down,down,down,down,left,left,left,left,down,down,down,up,up,up,right,right,right,right,up,down,left,left,left,left,down,down,down,down,right,right,down,down,left,left,left,left,left,left,up,up,right,right,up,up,left,left,left,left,left,down,down,right,down,down,left,left".split(",");
const DEFEAT_SEED = "DEFEAT-RECORD";
const DEFEAT_PATH = "right,right,right,right,down,down,down,down,left,left,down,down,down,down,down,down,down,down,right,right,right,right,right,right,right,right,right,right,up,down,left,left,left,left,left,right,right,right,right".split(",");
const KEY_BY_DIRECTION = /** @type {Record<string, string>} */ ({
  up: "ArrowUp",
  right: "ArrowRight",
  down: "ArrowDown",
  left: "ArrowLeft"
});

test("starts a playable maze and responds to keyboard actions", async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {string[]} */
  const consoleProblems = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push(message.text());
    }
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Find 3 Echoes/i })
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
  expect(consoleProblems).toEqual([]);
});

test("keeps touch controls usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const touchActions = page.locator("button:visible, a:visible");
  for (let index = 0; index < (await touchActions.count()); index += 1) {
    const action = touchActions.nth(index);
    const bounds = await action.boundingBox();
    const name = await action.evaluate(
      (element) => element.id || element.textContent?.trim() || element.tagName
    );
    expect(bounds?.width, `touch action ${index} ${name} width`).toBeGreaterThanOrEqual(44);
    expect(bounds?.height, `touch action ${index} ${name} height`).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  const overflowSources = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1
      )
      .slice(0, 5)
      .map((element) => element.id || element.className || element.tagName)
  );
  expect(overflow, `overflow sources: ${overflowSources.join(", ")}`).toBeLessThanOrEqual(1);
});

test("never starts audio before the player opts in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sound off" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("pauses an active run while Records are open", async ({ page }) => {
  await page.goto("/?seed=RECORDS-PAUSE");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(page.locator("#run-state")).toHaveText("Paused");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("keeps saved Record actions usable on a narrow screen", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:run-records:v1",
      JSON.stringify([
        { elapsedMs: 65000, moves: 70, seed: "NARROW-RECORD" }
      ])
    );
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy seed NARROW-RECORD" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replay seed NARROW-RECORD" })
  ).toBeVisible();
  const dialog = await page.locator("#records-dialog").boundingBox();
  if (!dialog) {
    throw new Error("Expected the Records dialog.");
  }
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
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
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, "getRandomValues", {
      configurable: true,
      /** @param {Uint16Array | Uint32Array} values */
      value: (values) => {
        values[0] = 5;
        values[1] = 0;
        values[2] = 93;
        return values;
      }
    });
  });
  await page.goto("/?seed=RUNE-CHOIR-93");
  const canvas = page.getByLabel(/Interactive maze/);
  const initialLabyrinth = await canvas.screenshot();
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

  await page.getByRole("button", { name: "New run" }).click();
  await expect(page.locator("#seed-value")).not.toHaveText("RUNE-CHOIR-93");
  expect(new URL(page.url()).searchParams.get("seed")).not.toBe("RUNE-CHOIR-93");
  const nextLabyrinth = await canvas.screenshot();
  expect(Buffer.compare(initialLabyrinth, nextLabyrinth)).not.toBe(0);
});

test("starts fresh from a 24-character seed with repeated random values", async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, "getRandomValues", {
      configurable: true,
      /** @param {Uint16Array | Uint32Array} values */
      value: (values) => {
        values[0] = 5;
        values[1] = 0;
        values[2] = 93;
        return values;
      }
    });
  });
  const originalSeed = "ABCDEFGHIJKLMNOPQRSTUVWX";
  await page.goto(`/?seed=${originalSeed}`);
  const canvas = page.getByLabel(/Interactive maze/);
  const initialLabyrinth = await canvas.screenshot();

  await page.getByRole("button", { name: "New run" }).click();

  await expect(page.locator("#seed-value")).not.toHaveText(originalSeed);
  const nextLabyrinth = await canvas.screenshot();
  expect(Buffer.compare(initialLabyrinth, nextLabyrinth)).not.toBe(0);
});

test("saves a defeated Run Record and restores it after reload", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One terminal browser Run is sufficient.");
  await page.goto(`/?seed=${DEFEAT_SEED}`);

  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }

  const dialog = page.getByRole("dialog", {
    name: "Warden contact ended the run."
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-rank")).toHaveText("Attempt #1");
  await page.reload();
  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toContainText(DEFEAT_SEED);
  await expect(records).toContainText("Defeated");
});

test("completes a seeded passage, records the result, and replays it", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One full browser passage is sufficient.");
  await page.goto(`/?seed=${WINNING_SEED}`);

  for (const [index, direction] of WINNING_PATH.entries()) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
    if (index === 27) {
      await expect(page.locator("#warden-state")).toHaveText("Intercept active");
      await expect(page.locator("#live-region")).toContainText(
        "Warden mode: Intercept active."
      );
    }
  }

  const dialog = page.getByRole("dialog", { name: "Gate reached." });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-seed")).toHaveText(WINNING_SEED);
  await expect(page.locator("#result-rank")).toHaveText("Personal #1");
  await expect(page.locator("#best-run")).toContainText(WINNING_SEED);

  await page.getByRole("button", { name: "Replay seed" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#seed-value")).toHaveText(WINNING_SEED);
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toBeVisible();
  await expect(records).toContainText(WINNING_SEED);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedSeed", value);
        }
      }
    });
  });
  await page.getByRole("button", { name: `Copy seed ${WINNING_SEED}` }).click();
  await expect(
    page.getByRole("button", { name: `Copy seed ${WINNING_SEED}` })
  ).toHaveText("Copied");
  expect(
    await page.evaluate(() => Reflect.get(window, "__copiedSeed"))
  ).toBe(WINNING_SEED);
  await page.getByRole("button", { name: `Replay seed ${WINNING_SEED}` }).click();
  await expect(records).not.toBeVisible();

  await page.reload();
  await expect(page.locator("#best-run")).toContainText(WINNING_SEED);
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
  const maze = await page.locator("#maze-canvas").boundingBox();
  const pulse = await page.locator("#pulse-action").boundingBox();
  if (!maze || !pulse) {
    throw new Error("Expected the maze and Pulse control to be rendered.");
  }
  expect(maze.y + maze.height).toBeLessThanOrEqual(800);
  expect(pulse.y + pulse.height).toBeLessThanOrEqual(800);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const mobileMaze = await page.locator("#maze-canvas").boundingBox();
  const touchControls = await page.locator(".touch-controls").boundingBox();
  const mobilePulse = await page.locator("#pulse-action").boundingBox();
  if (!mobileMaze || !touchControls || !mobilePulse) {
    throw new Error("Expected mobile gameplay controls.");
  }
  expect(mobileMaze.y + mobileMaze.height).toBeLessThanOrEqual(844);
  expect(touchControls.y + touchControls.height).toBeLessThanOrEqual(844);
  expect(mobilePulse.y + mobilePulse.height).toBeLessThanOrEqual(844);
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
  const overflowSources = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1
      )
      .slice(0, 5)
      .map((element) => element.id || element.className || element.tagName)
  );
  expect(overflow, `overflow sources: ${overflowSources.join(", ")}`).toBeLessThanOrEqual(1);
});
