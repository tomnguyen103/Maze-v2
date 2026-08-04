import { expect, test } from "@playwright/test";
import { expectGameReady, goToLevelStep } from "./game-ready.js";
import { applyAction, createRun } from "../../src/game/game-session.js";
import {
  createDailyContract,
  getDailyQuestion,
  utcDateKey
} from "../../src/game/daily-labyrinth.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("echo-maze:first-light:v1", "seen");
  });
});

const QUEST_FIXTURE = {
  version: 1,
  levelId: "maze-master",
  labyrinthNumber: 7,
  completedLabyrinths: 6,
  usedMapFingerprints: ["111/101/111"],
  usedQuestionIds: ["master-developing-6"],
  nextQuestionOrdinal: 7,
  complete: false
};
const ACTIVE_RUN_FIXTURE = {
  version: 1,
  seed: "STONE-VAULT-07",
  levelId: "maze-master",
  labyrinthNumber: 6
};
const CLOUD_QUEST_FIXTURE = {
  version: 1,
  questId: "quest_cloud_daily_123",
  levelId: "bright-start",
  labyrinthNumber: 12,
  completedLabyrinths: 11,
  usedMapFingerprints: [],
  usedQuestionIds: [],
  nextQuestionOrdinal: 0,
  complete: false
};
const KEY_BY_DIRECTION = /** @type {Record<string, string>} */ ({
  up: "ArrowUp",
  right: "ArrowRight",
  down: "ArrowDown",
  left: "ArrowLeft"
});
const FIXED_DAILY_NOW = new Date("2026-07-26T12:00:00.000Z");

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {{ row: number, col: number }} goal
 * @returns {("up" | "right" | "down" | "left")[]}
 */
function pathTo(run, goal) {
  const key = (/** @type {{ row: number, col: number }} */ position) =>
    `${position.row},${position.col}`;
  const startKey = key(run.explorer);
  const goalKey = key(goal);
  /** @type {{ row: number, col: number }[]} */
  const queue = [{ row: run.explorer.row, col: run.explorer.col }];
  /** @type {Map<string, { prior: string, direction: "up" | "right" | "down" | "left" } | null>} */
  const previous = new Map([[startKey, null]]);
  const moves = /** @type {{ direction: "up" | "right" | "down" | "left", row: number, col: number }[]} */ ([
    { direction: "up", row: -1, col: 0 },
    { direction: "right", row: 0, col: 1 },
    { direction: "down", row: 1, col: 0 },
    { direction: "left", row: 0, col: -1 }
  ]);
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

  /** @type {("up" | "right" | "down" | "left")[]} */
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

/** @param {ReturnType<typeof createDailyContract>} daily */
function dailyWinningPlan(daily) {
  let run = createRun(
    daily.seed,
    getLabyrinthConfig(daily.levelId, daily.labyrinthNumber)
  );
  /** @type {({ type: "move", direction: "up" | "right" | "down" | "left" } | { type: "answer", answerId: string, prompt: string })[]} */
  const actions = [];
  let questionIndex = 0;
  for (let step = 0; step < 900 && run.status !== "won"; step += 1) {
    if (run.status === "challenge") {
      const question = getDailyQuestion(daily, questionIndex);
      questionIndex += 1;
      actions.push({
        type: "answer",
        answerId: question.answerId,
        prompt: question.prompt
      });
      run = applyAction(run, { type: "provide-question", question });
      run = applyAction(run, {
        type: "answer-question",
        answerId: question.answerId
      });
      continue;
    }
    const target =
      run.echoes.find((echo) => !echo.collected) ?? run.gate;
    const direction = pathTo(run, target)[0];
    if (!direction) {
      throw new Error("Expected a move toward the next Daily objective.");
    }
    actions.push({ type: "move", direction });
    run = applyAction(run, {
      type: "move",
      direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
    });
  }
  if (run.status !== "won") {
    throw new Error("Daily plan did not reach the Gate.");
  }
  return actions;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {ReturnType<typeof createDailyContract>} daily
 */
async function completeDaily(page, daily) {
  for (const action of dailyWinningPlan(daily)) {
    if (action.type === "move") {
      await page.keyboard.press(KEY_BY_DIRECTION[action.direction]);
      continue;
    }
    const challenge = page.getByRole("dialog", {
      name: /Warden blocks the path/i
    });
    await expect(challenge).toBeVisible();
    await expect(page.locator("#challenge-question")).toHaveText(action.prompt);
    await page.locator(`[data-answer="${action.answerId}"]`).click();
  }
}

/** @param {import("@playwright/test").Page} page */
async function preserveQuestState(page) {
  await page.addInitScript(
    ({ quest, locator }) => {
      if (sessionStorage.getItem("echo-maze:daily-fixture-seeded") === "true") {
        return;
      }
      localStorage.setItem(
        "echo-maze:quest-progress:v1",
        JSON.stringify(quest)
      );
      localStorage.setItem(
        "echo-maze:active-run:v1",
        JSON.stringify(locator)
      );
      sessionStorage.setItem("echo-maze:daily-fixture-seeded", "true");
    },
    { quest: QUEST_FIXTURE, locator: ACTIVE_RUN_FIXTURE }
  );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {"created" | "improved" | "unchanged" | "rejected"} outcome
 */
async function installSignedInDailyPlayer(page, outcome) {
  await page.addInitScript((bestResult) => {
    const profile = {
      username: "Moss Runner",
      explorerPalette: "teal",
      playgroundPalette: "daylight"
    };
    const submissions =
      /** @type {Record<string, unknown>[]} */ ([]);
    Reflect.set(window, "__echoMazeDailySubmissions", submissions);
    Reflect.set(window, "__echoMazePlayerDependencies", {
      clerkBrowser: {
        user: { id: "user_daily_e2e" },
        getToken: async () => "e2e-session-token",
        initialize: async () => true,
        openSignIn: async () => true,
        openSignUp: async () => true,
        openUserProfile: async () => true,
        signOut: async () => {}
      },
      client: {
        getLeaderboard: async () => ({ entries: [], globalMaxScore: 0 }),
        getVerifiedDailyLeaderboard: async () => ({
          date: "2026-07-26",
          contractVersion: 1,
          verification: "verified-replay-v1",
          entries: []
        }),
        getProfile: async () => ({ profile }),
        getLearningJournal: async () => ({
          journal: { version: 1, events: [] },
          clearGeneration: 0
        }),
        /** @param {Record<string, unknown>} submission */
        submitVerifiedDaily: async (submission) => {
          submissions.push(submission);
          if (bestResult === "rejected") {
            throw Object.assign(
              new Error("Replay result does not match the claim."),
              { status: 409 }
            );
          }
          return {
            verification: "verified-replay-v1",
            bestResult,
            improved: bestResult !== "unchanged"
          };
        }
      }
    });
  }, outcome);
}

/** @param {import("@playwright/test").Page} page */
async function expectPreservedQuestState(page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        quest: localStorage.getItem("echo-maze:quest-progress:v1"),
        active: localStorage.getItem("echo-maze:active-run:v1")
      }))
    )
    .toEqual({
      quest: JSON.stringify(QUEST_FIXTURE),
      active: JSON.stringify(ACTIVE_RUN_FIXTURE)
    });
}

/** @param {import("@playwright/test").Page} page */
async function stableCanvasData(page) {
  let previous = "";
  await expect
    .poll(async () => {
      const current = await page.locator("#maze-canvas").evaluate(
        (/** @type {HTMLCanvasElement} */ canvas) => canvas.toDataURL()
      );
      const stable = current.length > 0 && current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
  return previous;
}

test("reconstructs today's UTC Daily offline without spending Run Access", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  /** @type {string[]} */
  const accessRequests = [];
  /** @type {string[]} */
  const questionRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/access/runs") {
      accessRequests.push(request.url());
    }
    if (pathname === "/api/question") {
      questionRequests.push(request.url());
    }
  });
  await preserveQuestState(page);

  await page.goto(`/play?daily=${daily.date}`);

  await expect(
    page.getByRole("heading", { name: /Today’s shared Labyrinth/i })
  ).toBeVisible();
  await expect(page.locator("#seed-value")).toHaveText(daily.seed);
  await expect(page.locator("#quest-stage")).toContainText(
    `Labyrinth ${daily.labyrinthNumber} · Developing`
  );
  const firstCanvas = await stableCanvasData(page);
  await expectPreservedQuestState(page);

  await page.reload();

  expect(await stableCanvasData(page)).toBe(firstCanvas);
  expect(accessRequests).toEqual([]);
  expect(questionRequests).toEqual([]);
  await expectPreservedQuestState(page);
});

test("defers an asynchronous Cloud restore while a direct Daily is active", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  await preserveQuestState(page);
  await page.route(
    "**/assets/quest-continuity-controller-*.js",
    async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          export function createQuestContinuityController({ onProgress }) {
            return {
              setAuthenticated() {},
              queueBoundary() { return Promise.resolve(false); },
              retry() {
                document.documentElement.dataset.cloudRetryTest = "complete";
                onProgress(${JSON.stringify(CLOUD_QUEST_FIXTURE)}, "cloud");
                return Promise.resolve(true);
              },
              resolveConflict() { return Promise.resolve(false); }
            };
          }
        `
      });
    }
  );

  await page.goto(`/play?daily=${daily.date}`);
  await expectGameReady(page);
  await expect(page.locator("#seed-value")).toHaveText(daily.seed);

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("html")).toHaveAttribute(
    "data-cloud-retry-test",
    "complete"
  );

  await expect(page.locator("#seed-value")).toHaveText(daily.seed);
  await expect(page.locator("#quest-stage")).toContainText(
    `Labyrinth ${daily.labyrinthNumber}`
  );
  await expect(page.locator("#quest-stage")).toContainText("Developing");
  await expectPreservedQuestState(page);
});

test("retries the optional Cloud sync chunk after a transient load failure", async ({
  page
}) => {
  /** @type {string[]} */
  const pageErrors = [];
  let chunkRequests = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    "**/assets/quest-continuity-controller-*.js",
    async (route) => {
      chunkRequests += 1;
      if (chunkRequests <= 2) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    }
  );

  await page.goto("/play");
  await expectGameReady(page);
  await goToLevelStep(page, 3);
  await page.locator('[data-level="trail-scout"]').click();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await expect.poll(() => chunkRequests).toBe(2);

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => chunkRequests).toBe(3);
  expect(pageErrors).toEqual([]);
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("explains an expired UTC link and shares only today's public date", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const current = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  const expired = utcDateKey(
    new Date(FIXED_DAILY_NOW.getTime() - 86_400_000)
  );
  await preserveQuestState(page);
  await page.addInitScript(() => {
    Reflect.set(window, "__copiedDaily", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedDaily", value);
        }
      }
    });
  });

  await page.goto(`/play?daily=${expired}`);
  await expectGameReady(page);

  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("00:00 UTC");
  await expect(dialog).toContainText(expired);
  await expect(
    dialog.getByRole("button", { name: "Start today’s Daily" })
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Copy today’s link" }).click();

  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedDaily")))
  );
  expect(copied.pathname).toBe("/play");
  expect([...copied.searchParams.entries()]).toEqual([
    ["daily", current.date]
  ]);
  await expect(dialog).toContainText("Verified Daily Board");
  await expect(dialog).not.toContainText(/reward|streak/i);

  await dialog.getByRole("button", { name: "Start today’s Daily" }).click();
  await expect(page).toHaveURL(new RegExp(`daily=${current.date}`));
  await expect(page.locator("#seed-value")).toHaveText(current.seed);
});

test("keeps the Daily choice operable at 390px and 200 percent text", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const expired = utcDateKey(
    new Date(FIXED_DAILY_NOW.getTime() - 86_400_000)
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/play?daily=${expired}`);
  await expectGameReady(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });

  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  const start = dialog.getByRole("button", { name: "Start today’s Daily" });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeVisible();
  await expect(page.locator("#daily-title")).toBeFocused();
  const layout = await page.evaluate(() => {
    const dailyDialog = document.querySelector("#daily-dialog");
    return {
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      dialogOverflow: dailyDialog
        ? dailyDialog.scrollWidth - dailyDialog.clientWidth
        : Number.POSITIVE_INFINITY
    };
  });
  expect(layout.pageOverflow).toBeLessThanOrEqual(1);
  expect(layout.dialogOverflow).toBeLessThanOrEqual(1);
});

test("shows a public verified board and keeps Guest participation casual", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  await preserveQuestState(page);
  /** @type {() => void} */
  let releaseBoard = () => {};
  const boardReady = new Promise((resolve) => {
    releaseBoard = () => resolve(undefined);
  });
  await page.route("**/api/daily/leaderboard", async (route) => {
    await boardReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-07-26",
        contractVersion: 1,
        verification: "verified-replay-v1",
        entries: [
          { rank: 1, username: "Moss Runner", score: 900, moves: 76 },
          { rank: 2, username: "River Scout", score: 850, moves: 71 }
        ]
      })
    });
  });

  await page.goto("/play");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await expect(dialog.getByRole("status", {
    name: "Verified Daily Board status"
  })).toHaveText("Loading verified escapes…");
  await expect(dialog).toContainText(
    "Guest Daily stays casual. Sign in and create a username to join the verified board."
  );

  releaseBoard();
  await expect(dialog.getByRole("list", {
    name: "Verified Daily Board"
  })).toContainText("Moss Runner");
  await expect(dialog).toContainText("#1");
  await expect(dialog).toContainText("900");
  await expect(dialog).toContainText("76 moves");
  await expect(dialog).not.toContainText(/user_|@/);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", {
    name: "Daily",
    exact: true
  })).toBeFocused();
});

for (const outcome of /** @type {const} */ ([
  "created",
  "improved",
  "unchanged"
])) {
  test(`reports a signed-in verified Daily ${outcome} result`, async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Signed-in outcome copy needs one browser profile."
    );
    await page.clock.install({ time: FIXED_DAILY_NOW });
    await installSignedInDailyPlayer(page, outcome);
    await preserveQuestState(page);
    const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));

    await page.goto(`/play?daily=${daily.date}`);
    await expectGameReady(page);
    await completeDaily(page, daily);

    const result = page.getByRole("dialog", {
      name: "Daily Labyrinth complete."
    });
    await expect(result).toContainText("verified replay");
    await expect(result).toContainText("Personal Best · Verified");
    await expect(result).toContainText({
      created: "first checked score joined",
      improved: "improved today’s Verified Daily best",
      unchanged: "existing Verified Daily best stays"
    }[outcome]);
    const submissions =
      /** @type {{ contract: ReturnType<typeof createDailyContract>, actionLog: { version: number, actions: { type: string }[] }, claimed: { status: string } }[]} */ (
        await page.evaluate(() =>
          Reflect.get(window, "__echoMazeDailySubmissions")
        )
      );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      contract: daily,
      actionLog: { version: 1 },
      claimed: { status: "won" }
    });
    expect(submissions[0].actionLog.actions.length).toBeGreaterThan(0);
    expect(
      submissions[0].actionLog.actions.every((action) =>
        [
          "move",
          "pulse",
          "answer-question",
          "skip-question"
        ].includes(action.type)
      )
    ).toBe(true);
  });
}

test("keeps a rejected signed-in Daily replay local and truthful", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One rejected-submission browser check is sufficient."
  );
  await page.clock.install({ time: FIXED_DAILY_NOW });
  await installSignedInDailyPlayer(page, "rejected");
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));

  await page.goto(`/play?daily=${daily.date}`);
  await expectGameReady(page);
  await completeDaily(page, daily);

  const result = page.getByRole("dialog", {
    name: "Daily Labyrinth complete."
  });
  await expect(result).toContainText("replay not verified");
  await expect(result).toContainText(
    "This result did not pass the replay check. Local Daily play still works."
  );
  await expect(result).toContainText("Personal Best");
  await expect(result).not.toContainText("Personal Best · Verified");
});

test("explains an empty verified board and keeps the Daily action available", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One empty-board browser check is sufficient."
  );
  await page.clock.install({ time: FIXED_DAILY_NOW });
  await preserveQuestState(page);
  await page.route("**/api/daily/leaderboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-07-26",
        contractVersion: 1,
        verification: "verified-replay-v1",
        entries: []
      })
    })
  );

  await page.goto("/play");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });

  await expect(dialog.getByRole("status", {
    name: "Verified Daily Board status"
  })).toHaveText(
    "No verified escapes yet. The first checked Gate is waiting."
  );
  await expect(
    dialog.getByRole("button", { name: "Start today’s Daily" })
  ).toBeEnabled();
});

test("retries a network-failed verified board without blocking local play", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One network retry browser check is sufficient."
  );
  await page.clock.install({ time: FIXED_DAILY_NOW });
  await preserveQuestState(page);
  let attempts = 0;
  await page.route("**/api/daily/leaderboard", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.abort();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-07-26",
        contractVersion: 1,
        verification: "verified-replay-v1",
        entries: [
          { rank: 1, username: "Moss Runner", score: 900, moves: 76 }
        ]
      })
    });
  });

  await page.goto("/play");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await expect(dialog).toContainText(
    "Network could not reach the Verified Daily Board. Local Daily play still works."
  );
  await dialog.getByRole("button", { name: "Retry verified board" }).click();
  await expect(dialog).toContainText("Moss Runner");
  expect(attempts).toBe(2);
  await expect(
    dialog.getByRole("button", { name: "Start today’s Daily" })
  ).toBeEnabled();
});

test("separates server unavailability and rejects a different UTC board", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One server-state browser check is sufficient."
  );
  await page.clock.install({ time: FIXED_DAILY_NOW });
  await preserveQuestState(page);
  let attempts = 0;
  await page.route("**/api/daily/leaderboard", (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? {
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Verified Daily services are unavailable."
            })
          }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              date: "2026-07-27",
              contractVersion: 1,
              verification: "verified-replay-v1",
              entries: [
                { rank: 1, username: "Wrong Day", score: 900, moves: 76 }
              ]
            })
          }
    );
  });

  await page.goto("/play");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await expect(dialog).toContainText(
    "Verified Daily services are unavailable. Local Daily play still works."
  );
  await dialog.getByRole("button", { name: "Retry verified board" }).click();
  await expect(dialog).toContainText(
    "Verified Daily Board date changed. Reopen Daily to see the current board."
  );
  await expect(dialog).not.toContainText("Wrong Day");
});

test("switches an open tab to the new UTC Daily at midnight", async ({
  page
}) => {
  await page.clock.install({
    time: new Date("2026-07-26T23:59:00.000Z")
  });
  await page.addInitScript(() => {
    Reflect.set(window, "__copiedDaily", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedDaily", value);
        }
      }
    });
  });
  await page.goto("/play?daily=2026-07-26");
  await expectGameReady(page);
  await expect(page.locator("#seed-value")).toHaveText("DAILY-20260726");

  await page.clock.fastForward("00:01:02");
  await page.getByRole("button", { name: "Daily", exact: true }).click();

  const dialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await expect(dialog).toContainText("2026-07-27 UTC");
  await expect(dialog).toContainText("2026-07-26 has expired");
  await dialog.getByRole("button", { name: "Copy today’s link" }).click();
  expect(
    new URL(
      await page.evaluate(() => String(Reflect.get(window, "__copiedDaily")))
    ).searchParams.get("daily")
  ).toBe("2026-07-27");

  await dialog.getByRole("button", { name: "Start today’s Daily" }).click();
  await expect(page).toHaveURL(/daily=2026-07-27/);
  await expect(page.locator("#seed-value")).toHaveText("DAILY-20260727");
});

test("does not save or verify a Daily that crosses UTC midnight before escape", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One mid-Run UTC boundary proof is sufficient."
  );
  await page.clock.install({
    time: new Date("2026-07-26T23:59:59.000Z")
  });
  const daily = createDailyContract("2026-07-26");
  /** @type {string[]} */
  const verifiedRequests = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/daily/scores" &&
      request.method() === "POST"
    ) {
      verifiedRequests.push(request.url());
    }
  });

  await page.goto(`/play?daily=${daily.date}`);
  await expectGameReady(page);
  await page.clock.fastForward("00:00:02");
  await completeDaily(page, daily);

  const result = page.getByRole("dialog", {
    name: "This Daily has expired."
  });
  await expect(result).toContainText("UTC date changed");
  await expect(result).toContainText("result was not saved");
  expect(verifiedRequests).toEqual([]);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("echo-maze:daily-records:v1") ?? "[]")
    )
  ).toEqual([]);
});

test("saves a Daily Personal Best without changing Quest, Records, or demo state", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  /** @type {string[]} */
  const accessRequests = [];
  /** @type {string[]} */
  const scoreRequests = [];
  /** @type {string[]} */
  const verifiedScoreRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/access/runs") {
      accessRequests.push(request.url());
    }
    if (pathname === "/api/scores" && request.method() === "POST") {
      scoreRequests.push(request.url());
    }
    if (pathname === "/api/daily/scores" && request.method() === "POST") {
      verifiedScoreRequests.push(request.url());
    }
  });
  await preserveQuestState(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:demo-access:v1",
      JSON.stringify({ version: 1, completed: true })
    );
  });

  await page.goto(`/play?daily=${daily.date}`);
  await expectGameReady(page);
  await expect(page.getByRole("button", { name: "Records" })).toBeDisabled();
  await completeDaily(page, daily);

  const result = page.getByRole("dialog", {
    name: "Daily Labyrinth complete."
  });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Personal Best");
  await expect(
    result.getByRole("button", { name: "Return to Quest" })
  ).toBeVisible();

  const stored = await page.evaluate(() => ({
    quest: localStorage.getItem("echo-maze:quest-progress:v1"),
    active: localStorage.getItem("echo-maze:active-run:v1"),
    records: localStorage.getItem("echo-maze:run-records:v1"),
    demo: localStorage.getItem("echo-maze:demo-access:v1"),
    daily: JSON.parse(
      localStorage.getItem("echo-maze:daily-records:v1") ?? "[]"
    )
  }));
  expect(stored.quest).toBe(JSON.stringify(QUEST_FIXTURE));
  expect(stored.active).toBe(JSON.stringify(ACTIVE_RUN_FIXTURE));
  expect(stored.records).toBeNull();
  expect(stored.demo).toBe(JSON.stringify({ version: 1, completed: true }));
  expect(stored.daily).toEqual([
    expect.objectContaining({
      version: 1,
      date: daily.date,
      seed: daily.seed,
      completed: true,
      bestElapsedMs: expect.any(Number),
      bestMoves: expect.any(Number)
    })
  ]);
  expect(accessRequests).toEqual([]);
  expect(scoreRequests).toEqual([]);
  expect(verifiedScoreRequests).toEqual([]);
});

test("does not claim an unsaved Daily result is a Personal Best", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One storage-failure browser check is sufficient."
  );
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setDailyStorage(key, value) {
      if (key === "echo-maze:daily-records:v1") {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    };
  });

  await page.goto(`/play?daily=${daily.date}`);
  await expectGameReady(page);
  await completeDaily(page, daily);

  const result = page.getByRole("dialog", {
    name: "Daily Labyrinth complete."
  });
  await expect(result).toContainText("storage unavailable");
  await expect(result).toContainText(
    "This result could not be saved on this device."
  );
  await expect(result).toContainText("Not saved");
  await expect(result).not.toContainText("stored locally");
  await expect(result).not.toContainText("Personal Best");
});
