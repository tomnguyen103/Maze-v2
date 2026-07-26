import { expect, test } from "@playwright/test";
import { applyAction, createRun } from "../../src/game/game-session.js";
import { getBundledQuestion } from "../../src/questions/question-bank.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";
import { selectPracticeQuestion } from "../../src/learning/lantern-journal-ui.js";

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
  id: "scout-foundation-0",
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
  topicId: "arithmetic",
  learningObjectiveId: "scout-equal-groups",
  explanation: "Four plus three equals seven."
};

/** @param {number} ordinal */
function reviewedQuestionForRequest(ordinal) {
  return getBundledQuestion({
    levelId: "trail-scout",
    seed: "journal-e2e",
    wardenId: 0,
    labyrinthNumber: 1,
    questionOrdinal: ordinal * 8
  });
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {{ row: number, col: number }} goal
 */
function pathTo(run, goal) {
  const key = (/** @type {{ row: number, col: number }} */ position) =>
    `${position.row},${position.col}`;
  const startKey = key(run.explorer);
  const goalKey = key(goal);
  /** @type {{ row: number, col: number }[]} */
  const queue = [run.explorer];
  /** @type {Map<string, { prior: string, direction: string } | null>} */
  const previous = new Map([[startKey, null]]);
  const moves = [
    { direction: "up", row: -1, col: 0 },
    { direction: "right", row: 0, col: 1 },
    { direction: "down", row: 1, col: 0 },
    { direction: "left", row: 0, col: -1 }
  ];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (key(current) === goalKey) {
      break;
    }
    for (const move of moves) {
      const next = {
        row: current.row + move.row,
        col: current.col + move.col
      };
      const nextKey = key(next);
      if (
        run.labyrinth[next.row]?.[next.col] !== 1 ||
        previous.has(nextKey)
      ) {
        continue;
      }
      previous.set(nextKey, {
        prior: key(current),
        direction: move.direction
      });
      queue.push(next);
    }
  }
  /** @type {string[]} */
  const path = [];
  let cursor = goalKey;
  while (cursor !== startKey) {
    const step = previous.get(cursor);
    if (!step) {
      throw new Error(`No passage path to ${goalKey}.`);
    }
    path.unshift(step.direction);
    cursor = step.prior;
  }
  return path;
}

/**
 * @param {string} seed
 * @returns {{ actions: ({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden" })[], finalRun: ReturnType<typeof createRun> }}
 */
function milestoneWinningPlan(seed) {
  let run = createRun(seed, getLabyrinthConfig("trail-scout", 4));
  /** @type {({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden" })[]} */
  const actions = [];
  for (let step = 0; step < 800 && run.status !== "won"; step += 1) {
    if (run.status === "challenge") {
      const kind = run.challenge?.kind;
      actions.push({ type: "answer", ...(kind ? { kind } : {}) });
      run = applyAction(run, {
        type: "provide-question",
        question: TEST_QUESTION
      });
      run = applyAction(run, {
        type: "answer-question",
        answerId: TEST_QUESTION.answerId
      });
      continue;
    }
    const target =
      run.echoes.find((echo) => !echo.collected) ?? run.gate;
    const direction = pathTo(run, target)[0];
    if (!direction) {
      throw new Error("Expected a move toward the next milestone objective.");
    }
    actions.push({ type: "move", direction });
    run = applyAction(run, {
      type: "move",
      direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
    });
  }
  if (run.status !== "won") {
    throw new Error("Milestone plan did not reach the Gate.");
  }
  return { actions, finalRun: run };
}

/** @param {import("@playwright/test").Page} page */
async function mockQuestionApi(page) {
  /** @type {ReturnType<typeof getBundledQuestion>[]} */
  const servedQuestions = [];
  await page.route("**/api/question?**", async (route) => {
    const ordinal = Number(
      new URL(route.request().url()).searchParams.get("question") ?? 0
    );
    const reviewedQuestion = reviewedQuestionForRequest(ordinal);
    servedQuestions.push(reviewedQuestion);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: reviewedQuestion,
        source: "bundled"
      })
    });
  });
  return () => {
    const question = servedQuestions.at(-1);
    if (!question) {
      throw new Error("The reviewed Question fixture has not served a card.");
    }
    return question;
  };
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

/**
 * @param {import("@playwright/test").Page} page
 * @param {() => ReturnType<typeof getBundledQuestion>} getCurrentQuestion
 */
async function answerCorrectlyIfChallenged(page, getCurrentQuestion) {
  const challenge = page.locator("#challenge-dialog");
  if (await challenge.isVisible()) {
    await expect(page.locator("#challenge-question")).toBeFocused();
    await page
      .locator(`[data-answer="${getCurrentQuestion().answerId}"]`)
      .click();
    await expect(challenge).not.toBeVisible();
    await expect(page.locator("#maze-canvas")).toBeFocused();
  }
}

test("presents transparent lifetime pricing in a focused dialog", async ({ page }) => {
  await page.goto("/play");
  await page.locator("#lifetime-dialog").evaluate(
    /** @param {HTMLDialogElement} dialog */
    (dialog) => dialog.showModal()
  );

  await expect(
    page.getByRole("heading", { name: "Unlock every future Run" })
  ).toBeVisible();
  await expect(page.locator("#lifetime-offer")).toContainText("$5.99 once");
  await expect(page.locator("#lifetime-details")).toContainText(
    "No subscription. No renewal."
  );
  await expect(page.locator("#lifetime-storage-note")).toContainText(
    "stay on this device"
  );
  await expect(
    page.getByRole("button", {
      name: "Unlock lifetime access - $5.99"
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const unlock = page.getByRole("button", {
    name: "Unlock lifetime access - $5.99"
  });
  await unlock.focus();
  await expect(unlock).toBeFocused();
  const dialogWidth = await page.locator("#lifetime-dialog").evaluate(
    (dialog) => dialog.clientWidth
  );
  expect(dialogWidth).toBeGreaterThan(0);
  await expect(page.locator("#lifetime-dialog")).toHaveJSProperty(
    "scrollWidth",
    dialogWidth
  );
});

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
    const isOptionalClerkUiUnavailable =
      (message.location().url.includes(".clerk.accounts.dev/npm/@clerk/ui@") ||
        message.text().includes(".clerk.accounts.dev/npm/@clerk/ui@")) &&
      (message.text().includes("blocked by CORS policy") ||
        message.text() === "Failed to load resource: net::ERR_FAILED");
    if (
      (message.type() === "error" || message.type() === "warning") &&
      !isClerkDevelopmentKeyNotice &&
      !isOptionalClerkUiUnavailable
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

test("opens the full Echo Atlas, pauses time, and restores trigger focus", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/?seed=ATLAS-CHECK&level=trail-scout&labyrinth=4");
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  const timeBefore = await page.locator("#time-value").textContent();

  await page.getByRole("button", { name: "Atlas", exact: true }).click();

  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await expect(page.locator("#atlas-title")).toBeFocused();
  await expect(page.locator("[data-atlas-region]")).toHaveCount(5);
  await expect(page.locator("[data-atlas-node]")).toHaveCount(20);
  await expect(page.locator("[data-atlas-node='4']")).toHaveAttribute(
    "aria-current",
    "step"
  );
  await expect(page.locator("[data-atlas-node='4']")).toContainText(
    "Current Gate Warden milestone"
  );
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.waitForTimeout(1100);
  await expect(page.locator("#time-value")).toHaveText(timeBefore ?? "00:00");

  const bounds = await atlas.boundingBox();
  if (!bounds) {
    throw new Error("Expected the Echo Atlas dialog.");
  }
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const horizontalOverflow = await atlas.evaluate(
    (dialog) => dialog.scrollWidth - dialog.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(atlas.getByRole("button", { name: "Close" })).toBeVisible();

  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(atlas).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Atlas", exact: true })
  ).toBeFocused();
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("restores a completed five-Sigil Atlas until New Quest is chosen", async ({
  page
}) => {
  await page.goto("/play");
  await page.evaluate(() => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 20,
        completedLabyrinths: 20,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: true
      })
    );
  });
  await page.reload();

  await expect(page.locator("#pause-run")).toBeDisabled();
  await expect(page.locator("#pause-run")).toHaveText("Quest complete");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#moves-value")).toHaveText("000");

  await page.getByRole("button", { name: "Atlas", exact: true }).click();

  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await expect(page.locator("#atlas-progress")).toContainText(
    "5 of 5 Sigils restored"
  );
  await expect(page.locator("[data-atlas-node='20']")).toContainText(
    "Gate Warden milestone completed"
  );
  await atlas.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "New Quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your Quest Level" })
  ).toBeVisible();
});

test("allows an explicit Labyrinth 20 share after restoring a completed Atlas", async ({
  page
}) => {
  await page.goto("/play");
  await page.evaluate(() => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 20,
        completedLabyrinths: 20,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: true
      })
    );
  });

  await page.goto("/?seed=COMPLETED-SHARE-20&level=trail-scout&labyrinth=20");

  await expect(page.locator("#pause-run")).toBeEnabled();
  await expect(page.locator("#pause-run")).toHaveText("Pause");
  await expect(page.locator("#run-state")).not.toHaveText("Quest complete");
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
    if ((await page.locator("#moves-value").textContent()) !== "000") {
      break;
    }
  }
  await expect(page.locator("#moves-value")).not.toHaveText("000");
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
  const getCurrentQuestion = await mockQuestionApi(page);
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
    const question = getCurrentQuestion();
    const wrongAnswer = question.choices.find(
      (choice) => choice.id !== question.answerId
    );
    if (!wrongAnswer) throw new Error("Reviewed fixture needs a wrong answer.");
    await page.locator(`[data-answer="${wrongAnswer.id}"]`).click();
    if (attempt < 2) {
      await expect(page.locator("#challenge-question")).not.toHaveText(
        question.prompt
      );
      await expect(page.locator("#challenge-feedback")).toContainText(
        question.explanation
      );
      await expect(page.locator("#challenge-source")).toContainText(
        "trusty question card"
      );
      const answerBounds = await page
        .locator(`[data-answer="${wrongAnswer.id}"]`)
        .boundingBox();
      expect(answerBounds?.height).toBeGreaterThanOrEqual(44);
    }
  }

  const dialog = page.getByRole("dialog", {
    name: "Create an account for three free Runs."
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-rank")).toHaveText("Attempt #1");
  await expect(
    page.getByRole("button", { name: "Create account for three Runs" })
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
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await page.getByLabel(/Interactive maze/).focus();

  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();

  const firstQuestion = await page.locator("#challenge-question").textContent();
  await page.getByRole("button", { name: "Show Hint" }).click();
  await expect(page.locator("#question-hint")).toHaveText(
    getCurrentQuestion().hint
  );
  const hideHint = page.getByRole("button", { name: "Hide Hint" });
  await expect(hideHint).toBeEnabled();
  await expect(hideHint).toHaveAttribute("aria-expanded", "true");
  await hideHint.click();
  await expect(page.locator("#question-hint")).toBeHidden();
  await expect(page.locator("#question-hint")).toHaveText("");
  const showHint = page.getByRole("button", { name: "Show Hint" });
  await expect(showHint).toHaveAttribute("aria-expanded", "false");
  await expect(showHint).toBeEnabled();

  await page.getByRole("button", { name: "Skip free" }).click();
  await expect(page.locator("#vitality-count")).toHaveText("3 / 3");
  await expect(page.getByRole("button", { name: "Show Hint" })).toBeEnabled();
  await expect(page.locator("#challenge-question")).not.toHaveText(
    firstQuestion ?? ""
  );
  await expect.poll(() =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) =>
        entry.startsWith("echo-maze:lantern-journal")
      );
      if (!key) return [];
      return JSON.parse(localStorage.getItem(key) ?? "{}").events?.map(
        (/** @type {{ outcome: string }} */ event) => event.outcome
      ) ?? [];
    })
  ).toEqual(expect.arrayContaining(["hint", "skip"]));

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
    page.getByRole("dialog", { name: "Create an account for three free Runs." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account for three Runs" })
  ).toBeVisible();
});

test("reviews coarse Journal outcomes and keeps Practice outside the Run", async ({
  page
}) => {
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await page.getByLabel(/Interactive maze/).focus();

  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const question = getCurrentQuestion();
    const wrongAnswer = question.choices.find(
      (choice) => choice.id !== question.answerId
    );
    if (!wrongAnswer) throw new Error("Reviewed fixture needs a wrong answer.");
    await page.locator(`[data-answer="${wrongAnswer.id}"]`).click();
    await expect(page.locator("#challenge-feedback")).toContainText(
      question.explanation
    );
    await expect(page.locator("#challenge-question")).not.toHaveText(
      question.prompt
    );
  }
  await page
    .locator(`[data-answer="${getCurrentQuestion().answerId}"]`)
    .click();
  await expect(page.locator("#challenge-dialog")).not.toBeVisible();

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  const journal = page.getByRole("dialog", {
    name: "What you have practiced"
  });
  await expect(journal).toBeVisible();
  await expect(journal).toContainText("Correct 1");
  await expect(journal).toContainText("Wrong 2");
  await expect(journal).toContainText("Guest Journal");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  expect(
    await journal.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    )
  ).toBeLessThanOrEqual(1);
  await expect(journal.getByRole("button", { name: "Practice" })).toBeVisible();
  await expect(
    journal.getByRole("button", { name: "Clear Journal" })
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("font-size");
  });

  const practiceButton = journal.getByRole("button", { name: "Practice" });
  const triggeringQuestion = {
    id: (await practiceButton.getAttribute("data-practice-question")) ?? "",
    topicId: (await practiceButton.getAttribute("data-topic")) ?? "",
    learningObjectiveId:
      (await practiceButton.getAttribute("data-objective")) ?? "",
    difficultyBand: (await practiceButton.getAttribute("data-band")) ?? ""
  };
  const expectedPractice = selectPracticeQuestion(triggeringQuestion);
  const runBeforePractice = await page.evaluate(() => ({
    score: document.getElementById("player-score")?.textContent,
    vitality: document.getElementById("vitality-count")?.textContent,
    moves: document.getElementById("moves-value")?.textContent,
    stage: document.getElementById("quest-stage")?.textContent,
    time: document.getElementById("time-value")?.textContent
  }));

  await practiceButton.click();
  const practice = page.getByRole("dialog", {
    name: "Try a different Question"
  });
  await expect(practice).toBeVisible();
  await expect(page.locator("#practice-question")).toHaveText(
    expectedPractice.prompt
  );
  const correctLabel = expectedPractice.choices.find(
    (choice) => choice.id === expectedPractice.answerId
  )?.label;
  if (!correctLabel) throw new Error("Practice answer label was missing.");
  await practice.getByRole("button", { name: correctLabel, exact: true }).click();
  await expect(page.locator("#practice-feedback")).toContainText("Nice work");

  expect(
    await page.evaluate(() => ({
      score: document.getElementById("player-score")?.textContent,
      vitality: document.getElementById("vitality-count")?.textContent,
      moves: document.getElementById("moves-value")?.textContent,
      stage: document.getElementById("quest-stage")?.textContent,
      time: document.getElementById("time-value")?.textContent
    }))
  ).toEqual(runBeforePractice);

  await page.getByRole("button", { name: "Back to Journal" }).click();
  await expect(journal).toBeVisible();
  await expect(journal.getByRole("button", { name: "Practice" })).toHaveCount(0);

  const storedJournal = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.startsWith("echo-maze:lantern-journal")
    );
    return key ? localStorage.getItem(key) : null;
  });
  expect(storedJournal).not.toContain("\"prompt\"");
  expect(storedJournal).not.toContain("answerId");

  await page.getByRole("button", { name: "Clear Journal" }).click();
  await expect(page.locator("#journal-clear-warning")).toBeVisible();
  await page.getByRole("button", { name: "Clear now" }).click();
  await expect(journal).toContainText("Your lantern is ready.");
  await expect(page.getByRole("button", { name: "Clear Journal" })).toBeDisabled();
});

test("keeps an active Run operable when the Journal chunk is unavailable", async ({
  page
}) => {
  let failedChunkRequests = 0;
  await page.route("**/assets/lantern-journal-ui-*.js", async (route) => {
    failedChunkRequests += 1;
    await route.abort("failed");
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  const canvas = page.getByLabel(/Interactive maze/);
  await canvas.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#moves-value")).toHaveText("001");

  const journalButton = page.getByRole("button", {
    name: "Journal",
    exact: true
  });
  await journalButton.click();
  await journalButton.click();
  await expect(page.locator("#live-region")).toHaveText(
    "Lantern Journal is temporarily unavailable. Try again."
  );
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.locator("#run-state")).toHaveText("Exploring");

  await canvas.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#moves-value")).toHaveText("002");
  await expect.poll(() => failedChunkRequests).toBeGreaterThanOrEqual(1);
});

test("resumes an active Run after a double-click during slow Journal loading", async ({
  page
}) => {
  let chunkRequested = false;
  let releaseChunk = () => {};
  const chunkGate = new Promise((resolve) => {
    releaseChunk = () => resolve(undefined);
  });
  await page.route("**/assets/lantern-journal-ui-*.js", async (route) => {
    chunkRequested = true;
    await chunkGate;
    await route.continue();
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expect.poll(() => chunkRequested).toBe(true);
  await page.getByLabel(/Interactive maze/).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  const journalButton = page.getByRole("button", {
    name: "Journal",
    exact: true
  });
  await journalButton.click();
  await journalButton.click();
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  releaseChunk();
  const journal = page.getByRole("dialog", {
    name: "What you have practiced"
  });
  await expect(journal).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(journal).not.toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("completes a guest Labyrinth and persists Quest progress before account creation", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One full browser passage is sufficient.");
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await page.getByLabel(/Interactive maze/).focus();

  for (const direction of WINNING_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
    await answerCorrectlyIfChallenged(page, getCurrentQuestion);
  }

  const dialog = page.getByRole("dialog", {
    name: "Create an account for three free Runs."
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#result-seed")).toHaveText(WINNING_SEED);
  await expect(page.locator("#result-rank")).toHaveText("Personal #1");
  await expect(page.locator("#best-run")).toContainText(WINNING_SEED);
  expect(new URL(page.url()).pathname).toBe("/play");
  expect(new URL(page.url()).search).toBe("");

  await expect(
    page.getByRole("button", { name: "Create account for three Runs" })
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

test("defeats the deterministic Labyrinth 4 Gate Warden before escape", async ({
  page
}) => {
  const seed = "MILESTONE-4";
  const plan = milestoneWinningPlan(seed);
  expect(plan.finalRun.wardensDefeated).toBe(
    plan.finalRun.config.wardenCount
  );
  await page.route("**/api/question?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 503,
      body: JSON.stringify({ error: "forced fallback" })
    });
  });
  await page.goto(`/?seed=${seed}&level=trail-scout&labyrinth=4`);
  await page.getByLabel(/Interactive maze/).focus();

  let gateChallenges = 0;
  let questionOrdinal = 0;
  for (const action of plan.actions) {
    if (action.type === "move") {
      await page.keyboard.press(KEY_BY_DIRECTION[action.direction]);
      continue;
    }

    const challenge = page.locator("#challenge-dialog");
    await expect(challenge).toBeVisible();
    await expect(page.locator("#challenge-question")).toBeFocused();
    if (action.kind === "gate-warden") {
      gateChallenges += 1;
      await expect(page.locator("#challenge-title")).toHaveText(
        "The Gate Warden seals the way."
      );
      await expect(page.locator("#challenge-promise")).toContainText(
        "break the seal"
      );
      await expect(page.locator("#run-state")).toHaveText("Brain battle");
    }
    const bundled = getBundledQuestion({
      levelId: "trail-scout",
      labyrinthNumber: 4,
      questionOrdinal,
      seed,
      wardenId: questionOrdinal
    });
    questionOrdinal += 1;
    await expect(page.locator("#challenge-source")).toContainText(
      "trusty question card"
    );
    await page.locator(`[data-answer="${bundled.answerId}"]`).click();
    await expect(challenge).not.toBeVisible();
    if (action.kind === "gate-warden") {
      await expect(page.locator("#run-state")).toHaveText("Gate open");
    }
  }

  expect(gateChallenges).toBe(1);
  await expect(page.locator("#result-seed")).toHaveText(seed);
  await expect(
    page.getByRole("group", { name: "Echo Atlas progress" })
  ).toBeVisible();
  await expect(page.locator("#result-atlas")).toContainText("Atlas 4 / 20");
  await expect(page.locator("#result-atlas")).toContainText(
    "Foundation Sigil restored"
  );
  await expect(page.locator("#result-atlas")).toContainText(
    "Gate Warden milestone completed"
  );
  await expect(page.locator("#player-score")).toHaveText(
    String(plan.finalRun.score)
  );
  await expect.poll(() =>
    page.evaluate(() => {
      const stored = localStorage.getItem("echo-maze:quest-progress:v1");
      return stored ? JSON.parse(stored) : null;
    })
  ).toMatchObject({
    labyrinthNumber: 5,
    completedLabyrinths: 4,
    usedQuestionIds: expect.any(Array)
  });
  expect(
    await page.evaluate(() => {
      const stored = localStorage.getItem("echo-maze:quest-progress:v1");
      return stored ? JSON.parse(stored).usedQuestionIds.length : 0;
    })
  ).toBe(questionOrdinal);
  await expect.poll(() =>
    page.evaluate((expectedSeed) => {
      const stored = localStorage.getItem("echo-maze:run-records:v1");
      const records = /** @type {{ seed: string, labyrinthNumber: number }[]} */ (
        stored ? JSON.parse(stored) : []
      );
      return records.find(
        (record) =>
          record.seed === expectedSeed &&
          record.labyrinthNumber === 4
      ) ?? null;
    }, seed)
  ).toMatchObject({
    seed,
    labyrinthNumber: 4,
    questLevelId: "trail-scout",
    outcome: "escaped"
  });
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
