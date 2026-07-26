import { expect, test } from "@playwright/test";
import { applyAction, createRun } from "../../src/game/game-session.js";
import {
  createDailyContract,
  getDailyQuestion,
  utcDateKey
} from "../../src/game/daily-labyrinth.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";

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
  await expect(dialog).not.toContainText(/leaderboard|rank|reward|streak/i);

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

test("saves a Daily Personal Best without changing Quest, Records, or demo state", async ({
  page
}) => {
  await page.clock.install({ time: FIXED_DAILY_NOW });
  const daily = createDailyContract(utcDateKey(FIXED_DAILY_NOW));
  const actions = dailyWinningPlan(daily);
  /** @type {string[]} */
  const accessRequests = [];
  /** @type {string[]} */
  const scoreRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/access/runs") {
      accessRequests.push(request.url());
    }
    if (pathname === "/api/scores" && request.method() === "POST") {
      scoreRequests.push(request.url());
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
  await expect(page.getByRole("button", { name: "Records" })).toBeDisabled();
  for (const action of actions) {
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
});
