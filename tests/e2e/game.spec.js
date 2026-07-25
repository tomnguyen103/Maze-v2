import { expect, test } from "@playwright/test";

const WINNING_SEED = "DAYLIGHT-0";
const WINNING_PATH = "right,right,right,right,down,down,left,left,left,left,down,down,down,down,right,right,right,right,right,right,up,right,right,up,down,down,down,down,right,right,up,up,up,up,up".split(",");
const DEFEAT_SEED = "DEFEAT-RECORD";
const DEFEAT_PATH = "down,down,right,right,up,up,right".split(",");
const KEY_BY_DIRECTION = /** @type {Record<string, string>} */ ({
  up: "ArrowUp",
  right: "ArrowRight",
  down: "ArrowDown",
  left: "ArrowLeft"
});

const TEST_QUESTION = {
  id: "browser-math",
  prompt: "What is 4 + 3?",
  choices: [
    { id: "a", label: "6" },
    { id: "b", label: "7" },
    { id: "c", label: "8" }
  ],
  answerId: "b",
  hint: "Combine four objects with three more.",
  difficultyBand: "foundation",
  difficultyRank: 21,
  explanation: "Four plus three equals seven."
};

/** @param {import("@playwright/test").Page} page */
async function mockQuestionApi(page) {
  await page.route("**/api/question?**", async (route) => {
    const ordinal = Number(
      new URL(route.request().url()).searchParams.get("question") ?? 0
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: {
          ...TEST_QUESTION,
          id: `${TEST_QUESTION.id}-${ordinal}`,
          prompt: `${TEST_QUESTION.prompt} Card ${ordinal + 1}.`
        },
        source: "bundled"
      })
    });
  });
}

/** @param {import("@playwright/test").Page} page */
async function chooseTrailScout(page) {
  await page.getByRole("button", { name: /Trail Scout/ }).click();
}

/** @param {import("@playwright/test").Page} page */
async function stubClipboard(page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} }
    });
  });
}

/** @param {import("@playwright/test").Page} page */
async function answerCorrectlyIfChallenged(page) {
  const challenge = page.locator("#challenge-dialog");
  if (await challenge.isVisible()) {
    await expect(page.locator("#challenge-question")).toBeFocused();
    await page.locator('[data-answer="b"]').click();
    await expect(challenge).not.toBeVisible();
    await expect(page.locator("#maze-canvas")).toBeFocused();
  }
}

test("starts a playable maze and responds to keyboard actions", async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {string[]} */
  const consoleProblems = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const isClerkDevelopmentKeyNotice = message
      .text()
      .startsWith("Clerk: Clerk has been loaded with development keys.");
    if (
      (message.type() === "error" || message.type() === "warning") &&
      !isClerkDevelopmentKeyNotice
    ) {
      consoleProblems.push(message.text());
    }
  });
  await page.goto("/play");

  await expect(
    page.getByRole("heading", { name: "Choose your Quest Level" })
  ).toBeVisible();
  await expect(page.locator('[data-level="trail-scout"]')).toContainText(
    "times tables"
  );
  await chooseTrailScout(page);
  await expect(
    page.getByRole("heading", {
      name: /Labyrinth 1: find 3 Echoes and outsmart 2 Wardens/i
    })
  ).toBeVisible();
  await expect(page.locator("#quest-level-name")).toHaveText(
    "Quest Level 2 · Trail Scout"
  );
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 1 of 20 · Foundation"
  );
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

test("keeps event messages outside the playable maze", async ({ page }) => {
  await page.goto("/?seed=VISIBLE-GRID&level=trail-scout");

  await stubClipboard(page);
  await page.locator("#seed-copy").click();

  const eventRibbon = page.locator("#event-ribbon");
  await expect(eventRibbon).toHaveClass(/is-visible/);
  await expect(eventRibbon).toHaveText(
    "Share link copied. Send it to another Explorer."
  );

  const mazeBounds = await page.locator("#maze-canvas").boundingBox();
  const messageBounds = await eventRibbon.boundingBox();
  if (!mazeBounds || !messageBounds) {
    throw new Error("Expected the maze and event message to be rendered.");
  }

  const overlapsMaze =
    messageBounds.x < mazeBounds.x + mazeBounds.width &&
    messageBounds.x + messageBounds.width > mazeBounds.x &&
    messageBounds.y < mazeBounds.y + mazeBounds.height &&
    messageBounds.y + messageBounds.height > mazeBounds.y;
  expect(overlapsMaze).toBe(false);
  expect(messageBounds.y).toBeGreaterThanOrEqual(
    mazeBounds.y + mazeBounds.height
  );
});

test("keeps touch controls usable without horizontal overflow", async ({ page }) => {
  await page.goto("/?seed=TOUCH-CONTROLS&level=trail-scout");

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
  await page.goto("/?seed=AUDIO-OFF&level=trail-scout");
  await expect(page.getByRole("button", { name: "Sound off" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("shows guest score state and the global top ten without changing Records", async ({
  page
}) => {
  await page.route("**/api/leaderboard", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        globalMaxScore: 900,
        entries: [
          {
            rank: 1,
            username: "Moss Runner",
            score: 900,
            levelId: "trail-scout",
            labyrinthNumber: 4,
            moves: 81,
            elapsedMs: 92000
          }
        ]
      })
    });
  });
  await page.goto("/?seed=GLOBAL-BOARD&level=trail-scout");

  await expect(page.locator("#player-name")).toHaveText("Guest");
  await expect(page.locator("#player-score")).toHaveText("0");
  await expect(page.locator("#global-max-score")).toHaveText("900");
  await page.getByRole("button", { name: "Top 10" }).click();
  await expect(
    page.getByRole("heading", { name: "Global Scoreboard" })
  ).toBeVisible();
  await expect(page.locator("#scoreboard-list")).toContainText("Moss Runner");
  await expect(page.locator("#scoreboard-list")).toContainText("900");
  await expect(page.getByRole("button", { name: "Records", exact: true })).toBeVisible();
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
        {
          elapsedMs: 65000,
          moves: 70,
          seed: "NARROW-RECORD",
          questLevelId: "trail-scout",
          labyrinthNumber: 13,
          echoTotal: 5
        }
      ])
    );
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/?seed=NARROW-SAVED&level=trail-scout");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy share link for seed NARROW-RECORD" })
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
  await page.getByRole("button", { name: "Replay seed NARROW-RECORD" }).click();
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Advanced"
  );
  await expect(page.locator("#echo-count")).toHaveText("0 / 5");
});

test("hydrates a shared seed at its Labyrinth Number", async ({ page }) => {
  await page.goto(
    "/?seed=SHARED-LABYRINTH&level=trail-scout&labyrinth=13"
  );

  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Advanced"
  );
  await expect(page.locator("#echo-count")).toHaveText("0 / 5");
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

  await page.getByRole("button", { name: "New Quest" }).click();
  await chooseTrailScout(page);
  await expect(page.locator("#seed-value")).not.toHaveText("RUNE-CHOIR-93");
  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");
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

  await page.getByRole("button", { name: "New Quest" }).click();
  await chooseTrailScout(page);

  await expect(page.locator("#seed-value")).toHaveText("RUNE-CHOIR-93");
});

test("requires account creation before a guest starts a second Labyrinth", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One terminal browser Run is sufficient.");
  await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await page.getByLabel(/Interactive maze/).focus();

  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
    if (await page.locator("#challenge-dialog").isVisible()) {
      break;
    }
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator('[data-answer="a"]').click();
    if (attempt < 2) {
      await expect(page.locator('[data-answer="a"]')).toBeVisible();
      await expect(page.locator("#challenge-feedback")).toContainText(
        "Four plus three equals seven."
      );
      await expect(page.locator("#challenge-source")).toContainText(
        "trusty question card"
      );
      const answerBounds = await page
        .locator('[data-answer="a"]')
        .boundingBox();
      expect(answerBounds?.height).toBeGreaterThanOrEqual(44);
    }
  }

  const dialog = page.getByRole("dialog", {
    name: "Create an account to continue."
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-rank")).toHaveText("Attempt #1");
  await expect(
    page.getByRole("button", { name: "Create account to continue" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry Labyrinth" })).toHaveCount(0);
  await expect.poll(() =>
    page.evaluate(() => {
      const stored = localStorage.getItem("echo-maze:quest-progress:v1");
      return stored ? JSON.parse(stored).usedMapFingerprints.length : 0;
    })
  ).toBe(1);
  await expect(page.locator("#seed-value")).toHaveText(DEFEAT_SEED);
});

test("reveals a Hint, grants one free skip, then warns before paid skips", async ({
  page
}) => {
  await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);

  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();

  const firstQuestion = await page.locator("#challenge-question").textContent();
  await page.getByRole("button", { name: "Show Hint" }).click();
  await expect(page.locator("#question-hint")).toHaveText(TEST_QUESTION.hint);
  const hideHint = page.getByRole("button", { name: "Hide Hint" });
  await expect(hideHint).toBeEnabled();
  await hideHint.click();
  await expect(page.locator("#question-hint")).toBeHidden();
  await expect(page.getByRole("button", { name: "Show Hint" })).toBeEnabled();

  await page.getByRole("button", { name: "Skip free" }).click();
  await expect(page.locator("#vitality-count")).toHaveText("3 / 3");
  await expect(page.getByRole("button", { name: "Show Hint" })).toBeEnabled();
  await expect(page.locator("#challenge-question")).not.toHaveText(
    firstQuestion ?? ""
  );

  await page.getByRole("button", { name: "Skip · 1 Vitality" }).click();
  await expect(page.locator("#skip-warning")).toContainText(
    "Skipping costs 1 Vitality."
  );
  await page.getByRole("button", { name: "Keep question" }).click();
  await expect(page.locator("#skip-warning")).toBeHidden();

  for (const expectedVitality of [2, 1]) {
    await page.getByRole("button", { name: "Skip · 1 Vitality" }).click();
    await page.getByRole("button", { name: "Use skip" }).click();
    await expect(page.locator("#vitality-count")).toHaveText(
      `${expectedVitality} / 3`
    );
  }

  await page.getByRole("button", { name: "Skip · 1 Vitality" }).click();
  await expect(page.locator("#skip-warning")).toContainText(
    "This skip uses your last Vitality and will end this Labyrinth."
  );
  await page.getByRole("button", { name: "Use skip" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create an account to continue." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account to continue" })
  ).toBeVisible();
});

test("completes a guest Labyrinth and persists Quest progress before account creation", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One full browser passage is sufficient.");
  await mockQuestionApi(page);
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);

  for (const direction of WINNING_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
    await answerCorrectlyIfChallenged(page);
  }

  const dialog = page.getByRole("dialog", {
    name: "Create an account to continue."
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-seed")).toHaveText(WINNING_SEED);
  await expect(page.locator("#result-rank")).toHaveText("Personal #1");
  await expect(page.locator("#best-run")).toContainText(WINNING_SEED);
  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");

  await expect(
    page.getByRole("button", { name: "Create account to continue" })
  ).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => {
      const stored = localStorage.getItem("echo-maze:quest-progress:v1");
      return stored ? JSON.parse(stored) : null;
    })
  ).toMatchObject({ labyrinthNumber: 2, completedLabyrinths: 1 });

  if (await page.getByRole("button", { name: "Continue Quest" }).isVisible()) {
  await page.getByRole("button", { name: "Continue Quest" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#seed-value")).not.toHaveText(WINNING_SEED);
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 2 of 20 · Foundation"
  );
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  await page.reload();
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 2 of 20 · Foundation"
  );

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toBeVisible();
  await expect(records).toContainText(WINNING_SEED);
  await page.getByRole("button", { name: `Replay seed ${WINNING_SEED}` }).click();
  await expect(records).not.toBeVisible();
  await expect(page.locator("#seed-value")).toHaveText(WINNING_SEED);
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 1 of 20 · Foundation"
  );

  for (const direction of WINNING_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
    if (await page.locator("#challenge-dialog").isVisible()) {
      break;
    }
  }
  await expect(page.locator('[data-answer="b"]')).toBeVisible();
  await page.locator('[data-answer="b"]').click();
  await expect(page.locator("#challenge-dialog")).not.toBeVisible();

  await page.getByRole("button", { name: "Records", exact: true }).click();
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
  await page.getByRole("button", { name: `Copy share link for seed ${WINNING_SEED}` }).click();
  await expect(
    page.getByRole("button", { name: `Copy share link for seed ${WINNING_SEED}` })
  ).toHaveText("Copied");
  expect(
    await page.evaluate(() => Reflect.get(window, "__copiedSeed"))
  ).toContain(`/play?seed=${WINNING_SEED}&level=trail-scout&labyrinth=1`);
  await page.getByRole("button", { name: `Replay seed ${WINNING_SEED}` }).click();
  await expect(records).not.toBeVisible();

  await page.reload();
  await expect(page.locator("#best-run")).toContainText(WINNING_SEED);
  }
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
    await page.goto("/?seed=REFLOW-CHECK&level=trail-scout");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${viewport.width}px viewport overflow`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?seed=LAPTOP-FOLD&level=trail-scout");
  const maze = await page.locator("#maze-canvas").boundingBox();
  const pulse = await page.locator("#pulse-action").boundingBox();
  if (!maze || !pulse) {
    throw new Error("Expected the maze and Pulse control to be rendered.");
  }
  expect(maze.y + maze.height).toBeLessThanOrEqual(800);
  expect(pulse.y + pulse.height).toBeLessThanOrEqual(800);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?seed=MOBILE-FOLD&level=trail-scout");
  await stubClipboard(page);
  await page.locator("#seed-copy").click();
  await expect(page.locator("#event-ribbon")).toHaveClass(/is-visible/);
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
  await page.goto("/?seed=LARGE-TEXT&level=trail-scout");
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
