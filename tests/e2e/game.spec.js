import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectGameReady } from "./game-ready.js";
import { installSignedInQuestPlayer } from "./signed-player.js";
import { applyAction, createRun } from "../../src/game/game-session.js";
import { getBundledQuestion } from "../../src/questions/question-bank.js";
import { normalizeQuestion } from "../../src/questions/question-contract.js";
import { getPublishedLearningDeckOptions } from "../../src/questions/learning-deck-catalog.js";
import { getLabyrinthConfig } from "../../src/questions/quest-levels.js";
import {
  createLanternTrail,
  listLanternTrailObjectives
} from "../../src/learning/lantern-trail.js";
import { createTerminalRunReplay } from "../../src/game/run-replay-contract.js";
import { getQuestRunRuleset } from "../../src/game/run-ruleset.js";
import {
  createDailyContract,
  utcDateKey
} from "../../src/game/daily-labyrinth.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("echo-maze:first-light:v1", "seen");
  });
});

const WINNING_SEED = "DAYLIGHT-0";
const WINNING_PATH = "right,right,right,right,down,down,left,left,left,left,down,down,down,down,right,right,right,right,right,right,up,right,right,up,down,down,down,down,right,right,up,up,up,up,up".split(",");
const DEFEAT_SEED = "DEFEAT-RECORD";
const DEFEAT_PATH = "down,down,right,right,up,up,right".split(",");
const NUMBER_TRAIL = getPublishedLearningDeckOptions().find(
  ({ deckId }) => deckId === "number-trail"
);
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
const LENS_QUESTION = normalizeQuestion({
  ...TEST_QUESTION,
  reviewedRevisionId: "database:scout-foundation-0:v1",
  echoLens: {
    version: 1,
    kind: "array",
    title: "See two groups",
    reasoning: "Four and three combine to make seven altogether.",
    steps: [
      "Count the first four.",
      "Count three more.",
      "Count all seven."
    ],
    visual: {
      rows: 2,
      columns: 4,
      filled: 7
    }
  }
});

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
      const directTarget = {
        row: current.row + move.row,
        col: current.col + move.col
      };
      const windway = run.windways.find(
        ({ source }) => key(source) === key(directTarget)
      );
      const next = windway?.destination ?? directTarget;
      const nextKey = key(next);
      if (
        run.labyrinth[directTarget.row]?.[directTarget.col] !== 1 ||
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
 * @param {number} [labyrinthNumber]
 * @returns {{ actions: ({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden" })[], finalRun: ReturnType<typeof createRun> }}
 */
function milestoneWinningPlan(seed, labyrinthNumber = 4) {
  let run = createRun(seed, {
    ...getLabyrinthConfig("trail-scout", labyrinthNumber),
    ruleset: getQuestRunRuleset(labyrinthNumber)
  });
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

/**
 * @param {string} seed
 * @returns {{ actions: ({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden", wardenId: number })[], finalRun: ReturnType<typeof createRun> }}
 */
function echoBridgeTravelPlan(seed) {
  let run = createRun(seed, {
    ...getLabyrinthConfig("trail-scout", 9),
    ruleset: getQuestRunRuleset(9)
  });
  const bridge = run.echoBridges[0];
  if (!bridge) {
    throw new Error("Expected an Echo Bridge fixture.");
  }
  /** @type {({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden", wardenId: number })[]} */
  const actions = [];
  for (const target of [run.echoes[bridge.echoIndex], bridge.from]) {
    for (let step = 0; step < 400; step += 1) {
      if (run.status === "challenge") {
        const kind = run.challenge?.kind;
        actions.push({
          type: "answer",
          ...(kind ? { kind } : {}),
          wardenId: run.challenge?.wardenId ?? 0
        });
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
      if (
        run.explorer.row === target.row &&
        run.explorer.col === target.col
      ) {
        break;
      }
      const direction = pathTo(run, target)[0];
      if (!direction) {
        throw new Error("Expected a move toward the Echo Bridge fixture.");
      }
      actions.push({ type: "move", direction });
      run = applyAction(run, {
        type: "move",
        direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
      });
    }
  }
  const rowDelta = bridge.to.row - bridge.from.row;
  const colDelta = bridge.to.col - bridge.from.col;
  const direction = rowDelta < 0
    ? "up"
    : rowDelta > 0
      ? "down"
      : colDelta < 0
        ? "left"
        : "right";
  actions.push({ type: "move", direction });
  run = applyAction(run, {
    type: "move",
    direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
  });
  if (
    run.explorer.row !== bridge.to.row ||
    run.explorer.col !== bridge.to.col
  ) {
    throw new Error("Echo Bridge fixture did not cross its opened Bridge.");
  }
  return { actions, finalRun: run };
}

/**
 * @param {string} seed
 * @returns {{
 *   actions: ({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden", wardenId: number })[],
 *   adjacentRun: ReturnType<typeof createRun>,
 *   rungRun: ReturnType<typeof createRun>
 * }}
 */
function signalBellRingPlan(seed) {
  let run = createRun(seed, {
    ...getLabyrinthConfig("trail-scout", 17),
    ruleset: getQuestRunRuleset(17)
  });
  const bell = run.signalBells[0];
  const adjacent = [
    { row: bell.row - 1, col: bell.col },
    { row: bell.row, col: bell.col + 1 },
    { row: bell.row + 1, col: bell.col },
    { row: bell.row, col: bell.col - 1 }
  ].filter((position) => run.labyrinth[position.row]?.[position.col] === 1)
    .sort((left, right) =>
      pathTo(run, left).length - pathTo(run, right).length
    )[0];
  /** @type {({ type: "move", direction: string } | { type: "answer", kind?: "gate-warden", wardenId: number })[]} */
  const actions = [];
  for (
    let step = 0;
    step < 800 &&
      (run.explorer.row !== adjacent.row ||
        run.explorer.col !== adjacent.col);
    step += 1
  ) {
    if (run.status === "challenge") {
      const kind = run.challenge?.kind;
      actions.push({
        type: "answer",
        ...(kind ? { kind } : {}),
        wardenId: run.challenge?.wardenId ?? 0
      });
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
    const direction = pathTo(run, adjacent)[0];
    if (!direction) {
      throw new Error("Expected a move toward the Signal Bell fixture.");
    }
    actions.push({ type: "move", direction });
    run = applyAction(run, {
      type: "move",
      direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
    });
  }
  const adjacentRun = run;
  const rungRun = applyAction(run, { type: "ring-bell" });
  if (rungRun.moves !== run.moves + 1) {
    throw new Error("Signal Bell fixture did not ring.");
  }
  return { actions, adjacentRun, rungRun };
}

/**
 * @param {string} seed
 */
function wardenBellWinningPlan(seed) {
  const ringPlan = signalBellRingPlan(seed);
  let run = ringPlan.rungRun;
  /** @type {({ type: "move", direction: string } | { type: "ring-bell" } | { type: "answer", kind?: "gate-warden" })[]} */
  const actions = [...ringPlan.actions, { type: "ring-bell" }];
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
      throw new Error("Expected a move toward the Region 5 objective.");
    }
    actions.push({ type: "move", direction });
    run = applyAction(run, {
      type: "move",
      direction: /** @type {"up" | "right" | "down" | "left"} */ (direction)
    });
  }
  if (run.status !== "won") {
    throw new Error("Warden Bell plan did not reach the Gate.");
  }
  return { actions, finalRun: run };
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {"shell" | "opened-bridge"} state
 */
async function recordRegion3Screenshot(page, testInfo, state) {
  const body = await page.screenshot();
  await testInfo.attach(`region-3-${state}-${testInfo.project.name}`, {
    body,
    contentType: "image/png"
  });
  if (process.env.RECORD_MILESTONE_2_SCREENSHOTS === "true") {
    await writeFile(
      resolve(
        "docs",
        "playtests",
        "screenshots",
        `milestone-2-region-3-${state}-${testInfo.project.name}.png`
      ),
      body
    );
  }
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {"open-phase" | "sealed-phase"} state
 */
async function recordRegion4Screenshot(page, testInfo, state) {
  const body = await page.screenshot();
  await testInfo.attach(`region-4-${state}-${testInfo.project.name}`, {
    body,
    contentType: "image/png"
  });
  if (process.env.RECORD_MILESTONE_2_SCREENSHOTS === "true") {
    await writeFile(
      resolve(
        "docs",
        "playtests",
        "screenshots",
        `milestone-2-region-4-${state}-${testInfo.project.name}.png`
      ),
      body
    );
  }
}

/**
 * Attaches the shot to the run, and writes it into the playtest evidence
 * folder when RECORD_MILESTONE_<n>_SCREENSHOTS=true.
 *
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {2 | 3 | 4} milestone
 * @param {string} slug
 */
async function recordEvidenceScreenshot(page, testInfo, milestone, slug) {
  const body = await page.screenshot();
  await testInfo.attach(`${slug}-${testInfo.project.name}`, {
    body,
    contentType: "image/png"
  });
  if (
    process.env[`RECORD_MILESTONE_${milestone}_SCREENSHOTS`] !== "true"
  ) {
    return;
  }
  await writeFile(
    resolve(
      "docs",
      "playtests",
      "screenshots",
      `milestone-${milestone}-${slug}-${testInfo.project.name}.png`
    ),
    body
  );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} seed
 * @param {ReturnType<typeof milestoneWinningPlan>} plan
 * @param {{ checkGateStaging?: boolean }} [options]
 */
async function completeMilestonePlan(
  page,
  seed,
  plan,
  { checkGateStaging = false } = {}
) {
  await expectGameReady(page);
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
    if (action.kind === "gate-warden") {
      gateChallenges += 1;
      if (checkGateStaging) {
        await expect(page.locator("#gate-staging-skip")).toBeFocused();
        await expect(page.locator("#challenge-question")).toContainText(
          "universal diamond crest"
        );
      }
      await page.locator("#gate-staging-skip").click();
      if (checkGateStaging) {
        await expect(page.locator("#challenge-title")).toHaveText(
          "The Gate Warden seals the way."
        );
        await expect(page.locator("#challenge-promise")).toContainText(
          "break the seal"
        );
        await expect(page.locator("#run-state")).toHaveText("Brain battle");
      }
    }
    await expect(page.locator("#challenge-question")).toBeFocused();
    const bundled = getBundledQuestion({
      levelId: "trail-scout",
      labyrinthNumber: 4,
      questionOrdinal,
      seed,
      wardenId: questionOrdinal,
      challengeKind: action.kind === "gate-warden"
        ? "gate-warden"
        : "warden"
    });
    questionOrdinal += 1;
    await expect(page.locator("#challenge-source")).toContainText(
      "trusty question card"
    );
    await page.locator(`[data-answer="${bundled.answerId}"]`).click();
    await expect(challenge).not.toBeVisible();
    if (checkGateStaging && action.kind === "gate-warden") {
      await expect(page.locator("#run-state")).toHaveText("Gate open");
    }
  }
  return { gateChallenges, questionOrdinal };
}

/**
 * The Question route takes a POST body so the Quest's used-Question ledger can
 * travel with the request. Fixtures read the request the same way the service
 * does rather than from a query string.
 *
 * @param {import("@playwright/test").Request} request
 */
function questionRequestOf(request) {
  try {
    return JSON.parse(request.postData() ?? "{}");
  } catch {
    return {};
  }
}

/** @param {import("@playwright/test").Request} request */
function questionOrdinalOf(request) {
  return Number(questionRequestOf(request).questionOrdinal ?? 0);
}

/** @param {import("@playwright/test").Page} page */
async function mockQuestionApi(page) {
  /** @type {ReturnType<typeof getBundledQuestion>[]} */
  const servedQuestions = [];
  await page.route("**/api/question**", async (route) => {
    const ordinal = questionOrdinalOf(route.request());
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

// createSeed() names a Quest seed from three random Uint16 values, and starting
// a Quest redraws until the Labyrinth is one the Explorer has not mapped.
// Serving that draw from a counter keeps the redraw loop terminating — a
// constant draw would starve it — while making the seed, and so the Labyrinth's
// challenge layout, the same on every run. Only createSeed() reads a
// three-value Uint16 draw in this application's own code.
//
// PINNED_QUEST_SEED is the seed the Quest settles on, not the first draw: the
// boot Run consumes draws before the Quest's own. It therefore depends on how
// many times the page calls createSeed() before the Quest starts, which no test
// can see — so the seed is asserted on screen, and any drift in that count
// fails loudly there instead of quietly restoring the flake.
const PINNED_QUEST_SEED_DRAW_ORIGIN = 11;
const PINNED_QUEST_SEED = "ASH-HOLLOW-77";

/** @param {import("@playwright/test").Page} page */
async function pinQuestSeed(page) {
  await page.addInitScript((origin) => {
    const original = crypto.getRandomValues.bind(crypto);
    let draw = origin;
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      /** @param {ArrayBufferView<ArrayBuffer>} array */
      value: (array) => {
        if (array instanceof Uint16Array && array.length === 3) {
          draw += 1;
          array.set([draw * 7, draw * 13, draw * 29]);
          return array;
        }
        return original(array);
      }
    });
  }, PINNED_QUEST_SEED_DRAW_ORIGIN);
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

test("locks one published Learning Deck into a new Quest", async ({
  page
}, testInfo) => {
  if (!NUMBER_TRAIL) {
    throw new Error("Published Number Trail fixture is missing.");
  }
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 }
  );
  await page.goto("/play");
  await expectGameReady(page);

  const deckGroup = page.getByRole("group", {
    name: "Choose a Learning Deck"
  });
  await expect(deckGroup).toBeVisible();
  // One entry per published Deck: Mixed Trail and Number Trail. Word Trail
  // and Nature Trail are withheld until authored content exists for them.
  await expect(deckGroup.getByRole("radio")).toHaveCount(2);
  await expect(
    deckGroup.getByRole("radio", { name: /Mixed Trail/ })
  ).toBeChecked();
  await recordEvidenceScreenshot(
    page,
    testInfo,
    3,
    "learning-deck-picker"
  );

  await deckGroup.getByRole("radio", { name: /Number Trail/ }).check();
  await chooseTrailScout(page);

  await expect(page.locator("#quest-level-name")).toHaveText(
    "Quest Level 2 · Trail Scout · Number Trail"
  );
  await expect.poll(async () =>
    page.evaluate(() => {
      const stored = localStorage.getItem("echo-maze:quest-progress:v1");
      return stored ? JSON.parse(stored) : null;
    })
  ).toMatchObject({
    version: 2,
    levelId: "trail-scout",
    learningDeckId: "number-trail",
    learningDeckRevision: NUMBER_TRAIL.revisionId
  });

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Echo Atlas" })
      .getByText("Number Trail", { exact: false })
      .first()
  ).toBeVisible();
  await recordEvidenceScreenshot(
    page,
    testInfo,
    3,
    "learning-deck-atlas"
  );
});

test("announces the Mixed Trail continuation once per Quest", async ({
  page
}, testInfo) => {
  if (!NUMBER_TRAIL) {
    throw new Error("Published Number Trail fixture is missing.");
  }
  /** @type {Record<string, unknown>[]} */
  const questionRequests = [];
  /** @type {ReturnType<typeof getBundledQuestion>[]} */
  const served = [];
  await page.route("**/api/question**", async (route) => {
    const request = questionRequestOf(route.request());
    questionRequests.push(request);
    const question = reviewedQuestionForRequest(
      Number(request.questionOrdinal ?? 0)
    );
    served.push(question);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question,
        source: "bundled",
        // The focused Region is spent, so the service continues the Quest on
        // Mixed Trail content without changing the chosen Deck.
        learningDeckSource: "mixed-fallback"
      })
    });
  });

  // The announcement is asserted across two challenges, so the Labyrinth has to
  // hold two. A Quest otherwise draws its seed at random, and 22.4 percent of
  // the 4200 seeds createSeed() can name lay out a Labyrinth holding fewer than
  // two challenges (832 hold one, 107 hold none) — which left this case passing
  // on seed luck. Pin the draw the Quest makes rather than the URL: a shared
  // seed needs level and labyrinth alongside it and would skip the Deck picker.
  await pinQuestSeed(page);
  await page.goto("/play");
  await expectGameReady(page);
  await page
    .getByRole("group", { name: "Choose a Learning Deck" })
    .getByRole("radio", { name: /Number Trail/ })
    .check();
  await chooseTrailScout(page);
  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();

  await expect(page.locator("#seed-value")).toHaveText(PINNED_QUEST_SEED);
  await page.getByLabel(/Interactive maze/).focus();
  const plan = milestoneWinningPlan(PINNED_QUEST_SEED, 1);
  // The pin exists to guarantee the two challenges this case reads, so it says
  // so: a Labyrinth generation change that costs the second one fails here
  // rather than as an unexplained missing dialog further down.
  expect(
    plan.actions.filter((action) => action.type === "answer").length
  ).toBeGreaterThanOrEqual(2);
  // The plan marks the exact move each challenge follows, so walking it with a
  // single cursor keeps the Explorer's position and the plan in step; replaying
  // it from the start after a challenge would spend moves the Run already made.
  let cursor = 0;
  const pressUntilChallenge = async () => {
    while (cursor < plan.actions.length) {
      const action = plan.actions[cursor];
      if (action.type === "answer") {
        return;
      }
      await page.keyboard.press(KEY_BY_DIRECTION[action.direction]);
      cursor += 1;
    }
    throw new Error("The winning plan holds no further challenge.");
  };
  // The walker stops on the answer marker without spending it, so answering has
  // to step past it or the next walk stops on the same challenge forever.
  const answerChallenge = async () => {
    await answerCorrectlyIfChallenged(page, () => {
      const card = served.at(-1);
      if (!card) {
        throw new Error("The reviewed Question fixture has not served a card.");
      }
      return card;
    });
    cursor += 1;
  };

  await pressUntilChallenge();
  await expect(page.locator("#challenge-dialog")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#challenge-notice")).toContainText(
    "Number Trail is out of reviewed Questions here"
  );
  await recordEvidenceScreenshot(page, testInfo, 3, "mixed-trail-fallback");
  // The Quest carries its Deck identity and uniqueness ledger on every ask.
  expect(questionRequests[0]).toMatchObject({
    learningDeckId: "number-trail",
    learningDeckRevision: NUMBER_TRAIL.revisionId
  });
  expect(Array.isArray(questionRequests[0]?.usedQuestionIds)).toBe(true);
  // Announced once: a second fallback Question in the same Quest is silent,
  // and the Deck the Explorer chose has not changed.
  await answerChallenge();
  await pressUntilChallenge();
  await expect(page.locator("#challenge-dialog")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#challenge-notice")).toBeHidden();
  await expect(page.locator("#quest-level-name")).toHaveText(
    "Quest Level 2 · Trail Scout · Number Trail"
  );
});

test("starts a playable maze and responds to keyboard actions", async ({
  page
}, testInfo) => {
  const getCurrentQuestion = await mockQuestionApi(page);
  /** @type {string[]} */
  const presentationRequests = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (/\/assets\/(?:region-theme|audio)-/.test(pathname)) {
      presentationRequests.push(pathname);
    }
  });
  await page.route("**/api/leaderboard**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ globalMaxScore: 0, entries: [] })
    })
  );
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
    const isOptionalClerkRateLimit =
      (
        message.location().url.includes(".clerk.accounts.dev/") &&
        message.text().includes("429")
      ) ||
      (
        message.location().url.includes("/assets/clerk-") &&
        message.text().includes("Y._baseFetch")
      );
    if (
      (message.type() === "error" || message.type() === "warning") &&
      !isClerkDevelopmentKeyNotice &&
      !isOptionalClerkUiUnavailable &&
      !isOptionalClerkRateLimit
    ) {
      consoleProblems.push(message.text());
    }
  });
  await page.goto("/play");
  await expectGameReady(page);

  await expect(
    page.getByRole("heading", { name: "Choose your Quest Level" })
  ).toBeVisible();
  await expect(page.locator('[data-level="trail-scout"]')).toContainText(
    "times tables"
  );
  expect(presentationRequests).toEqual([]);
  await chooseTrailScout(page);
  await expect.poll(() =>
    presentationRequests.some((pathname) =>
      pathname.includes("/assets/region-theme-")
    )
  ).toBe(true);
  expect(
    presentationRequests.some((pathname) =>
      pathname.includes("/assets/audio-")
    )
  ).toBe(false);
  await expect(
    page.getByRole("heading", {
      name: /Labyrinth 1: find 3 Echoes and outsmart 2 Wardens/i
    })
  ).toBeVisible();
  await expect(page.locator("#quest-level-name")).toHaveText(
    "Quest Level 2 · Trail Scout · Mixed Trail"
  );
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 1 of 20 · Atlas Region: Foundation · Trail Twist: Echo Hush"
  );
  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  const seed = (await page.locator("#seed-value").textContent())?.trim();
  if (!seed) {
    throw new Error("Expected the active Region 1 seed.");
  }
  const plan = milestoneWinningPlan(seed, 1);
  for (const action of plan.actions) {
    if (action.type === "answer") {
      await answerCorrectlyIfChallenged(page, getCurrentQuestion);
      continue;
    }
    await page.keyboard.press(KEY_BY_DIRECTION[action.direction]);
    await answerCorrectlyIfChallenged(page, getCurrentQuestion);
    if ((await page.locator("#echo-count").textContent()) === "1 / 3") {
      break;
    }
  }
  await expect(page.locator("#moves-value")).not.toHaveText("000");
  await expect(page.locator("#echo-count")).toHaveText("1 / 3");
  await expect(page.locator("#field-note")).toContainText(
    "Echo Hush keeps ordinary Wardens still for this action"
  );
  await recordEvidenceScreenshot(
    page,
    testInfo,
    2,
    "region-1-echo-hush"
  );
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect.poll(() =>
    presentationRequests.some((pathname) =>
      pathname.includes("/assets/audio-")
    )
  ).toBe(true);
  const pulsesBefore = Number(
    await page.locator("#pulse-count").textContent()
  );
  await page.locator("#maze-canvas").focus();
  await page.keyboard.press("q");
  await expect(page.locator("#pulse-count")).toHaveText(
    String(pulsesBefore - 1)
  );
  expect(pageErrors).toEqual([]);
  expect(consoleProblems).toEqual([]);
});

test("keeps Classic Daily presentation universal after a themed Quest", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One history-dependent Classic presentation proof is sufficient."
  );
  await page.goto("/play");
  await expectGameReady(page);
  await chooseTrailScout(page);
  await expect(page.locator("body")).toHaveAttribute(
    "data-region-theme",
    "mosslight-grove"
  );

  await page.getByRole("button", { name: "Daily", exact: true }).click();
  const dailyDialog = page.getByRole("dialog", {
    name: "Daily Shared Labyrinth"
  });
  await dailyDialog.getByRole("button", {
    name: "Start today’s Daily"
  }).click();

  await expect(page.locator("body")).toHaveAttribute("data-region-theme", "");
  await expect(page.locator("#warden-guild")).toHaveText(
    "Universal Warden marks"
  );
});

test("retries Region presentation after a failed optional chunk", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One optional presentation retry is sufficient."
  );
  let regionThemeRequests = 0;
  await page.route("**/assets/region-theme-*.js", async (route) => {
    regionThemeRequests += 1;
    if (regionThemeRequests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/play");
  await expectGameReady(page);
  await chooseTrailScout(page);
  await expect.poll(() => regionThemeRequests).toBe(1);
  await expect(page.locator("body")).toHaveAttribute("data-region-theme", "");
  await expect(page.locator("#warden-guild")).toHaveText(
    "Universal Warden marks"
  );

  await page.getByRole("button", { name: "New Quest" }).click();
  await chooseTrailScout(page);

  await expect.poll(() => regionThemeRequests).toBe(2);
  await expect(page.locator("body")).toHaveAttribute(
    "data-region-theme",
    "mosslight-grove"
  );
  await expect(page.locator("#warden-guild")).toContainText(
    "Bramblewatch Guild"
  );
});

test("opens the full Echo Atlas, pauses time, and restores trigger focus", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/?seed=ATLAS-CHECK&level=trail-scout&labyrinth=4");
  await expectGameReady(page);
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
  const zoomOutButton = atlas.getByRole("button", { name: "Zoom out" });
  const zoomOutBounds = await zoomOutButton.boundingBox();
  if (!zoomOutBounds) {
    throw new Error("Expected the Atlas Zoom out button.");
  }
  await page.mouse.move(
    zoomOutBounds.x + zoomOutBounds.width / 2,
    zoomOutBounds.y + zoomOutBounds.height / 2
  );
  await page.mouse.down();
  await expect(zoomOutButton).toHaveCSS("transform", "none");
  await page.mouse.up();
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

test("lazy Atlas keeps semantic map and list parity across a URL reload", async ({
  page
}) => {
  await page.goto("/?seed=ATLAS-DEEP-LINK&level=trail-scout&labyrinth=4");
  await expectGameReady(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByType("resource")
          .some((entry) => entry.name.includes("quest-atlas-view"))
      )
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByType("resource")
          .some((entry) => /quest-atlas-[^/]+\.css(?:$|\?)/.test(entry.name))
      )
    )
    .toBe(false);
  const runStateBeforeAtlasSelection = await page.evaluate(() => ({
    quest: localStorage.getItem("echo-maze:quest-progress:v1"),
    locator: localStorage.getItem("echo-maze:active-run:v1"),
    recovery: localStorage.getItem("echo-maze:active-run-recovery:v1")
  }));

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByType("resource")
          .some((entry) => entry.name.includes("quest-atlas-view"))
      )
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByType("resource")
          .some((entry) => /quest-atlas-[^/]+\.css(?:$|\?)/.test(entry.name))
      )
    )
    .toBe(true);
  await expect(atlas.locator("[data-atlas-landmark]")).toHaveCount(20);

  await atlas.locator("[data-atlas-landmark='developing-7']").click();
  await expect(page).toHaveURL(/atlas=developing-7/);
  await expect(atlas.locator("[data-atlas-detail-title]"))
    .toHaveText("Labyrinth 7");
  await expect(atlas.locator("[data-atlas-detail]")).toContainText(
    "Preview only"
  );
  await expect(atlas.locator("[data-atlas-detail-action]")).toHaveCount(0);

  await atlas.getByRole("button", { name: "List view" }).click();
  await expect(atlas.locator("[data-atlas-landmarks]")).toHaveAttribute(
    "data-view",
    "list"
  );
  await expect(atlas.locator("[data-atlas-landmark]")).toHaveCount(20);

  await page.reload();
  await expectGameReady(page);
  await expect(atlas).toBeVisible();
  await expect(atlas.locator("[data-atlas-detail-title]"))
    .toHaveText("Labyrinth 7");
  expect(await page.evaluate(() => ({
    quest: localStorage.getItem("echo-maze:quest-progress:v1"),
    locator: localStorage.getItem("echo-maze:active-run:v1"),
    recovery: localStorage.getItem("echo-maze:active-run-recovery:v1")
  }))).toEqual(runStateBeforeAtlasSelection);

  await atlas.locator("[data-atlas-landmark='foundation-4']").click();
  await expect(atlas.locator("[data-atlas-detail]")).toContainText(
    "Continue Quest"
  );
  await atlas.getByRole("button", { name: "Continue Quest" }).click();
  await expect(atlas).not.toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("keeps a Run paused when Atlas is activated twice while loading", async ({
  page
}) => {
  await page.route("**/assets/quest-atlas-view-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.goto("/?seed=ATLAS-DOUBLE&level=trail-scout&labyrinth=4");
  await expectGameReady(page);

  await page.getByRole("button", { name: "Atlas", exact: true }).dblclick({
    delay: 20
  });
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await expect(page.locator("#run-state")).toHaveText("Paused");

  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("retries the Atlas view after its first chunk request fails", async ({
  page
}) => {
  let requests = 0;
  await page.route("**/assets/quest-atlas-view-*.js", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/?seed=ATLAS-RETRY&level=trail-scout&labyrinth=4");
  await expectGameReady(page);
  const atlasButton = page.getByRole("button", { name: "Atlas", exact: true });

  await atlasButton.click();
  await expect(page.locator("#live-region")).toContainText(
    "Echo Atlas could not open"
  );
  await atlasButton.click();

  await expect(page.getByRole("dialog", { name: "Echo Atlas" })).toBeVisible();
  expect(requests).toBe(2);
});

test("pans from the labeled viewport and centers the current landmark", async ({
  page
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/?seed=ATLAS-CENTER&level=trail-scout&labyrinth=12");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  const viewport = atlas.getByRole("group", { name: /Shift plus arrow keys/ });
  const canvas = atlas.locator("[data-atlas-canvas]");

  await viewport.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(canvas).toHaveCSS("transform", /matrix\([^,]+, 0, 0, [^,]+, -48,/);
  await atlas.getByRole("button", { name: "Zoom in" }).click();
  await viewport.evaluate((element) => {
    element.scrollLeft = 120;
    element.scrollTop = 80;
  });
  await atlas.getByRole("button", { name: "Center Current" }).click();

  const centers = await atlas.evaluate(() => {
    const viewportElement = document.querySelector(".atlas-viewport");
    const current = document.querySelector("[aria-current='step']");
    if (!viewportElement || !current) {
      throw new Error("Expected Atlas viewport and current landmark.");
    }
    const viewportBounds = viewportElement.getBoundingClientRect();
    const currentBounds = current.getBoundingClientRect();
    return {
      viewportX: viewportBounds.left + viewportBounds.width / 2,
      viewportY: viewportBounds.top + viewportBounds.height / 2,
      currentX: currentBounds.left + currentBounds.width / 2,
      currentY: currentBounds.top + currentBounds.height / 2
    };
  });
  expect(Math.abs(centers.viewportX - centers.currentX)).toBeLessThanOrEqual(2);
  expect(Math.abs(centers.viewportY - centers.currentY)).toBeLessThanOrEqual(2);
});

test("Atlas map and inspector fit every contracted viewport at 200-percent text", async ({
  page
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?seed=ATLAS-FIT&level=trail-scout&labyrinth=4");
    await expectGameReady(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await page.getByRole("button", { name: "Atlas", exact: true }).click();
    const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
    await expect(atlas).toBeVisible();
    await expect(atlas.locator("[data-atlas-detail]")).toBeVisible();
    await expect(atlas.getByRole("button", { name: "Center Current" }))
      .toBeVisible();
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )).toBeLessThanOrEqual(1);
    const bounds = await atlas.boundingBox();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0))
      .toBeLessThanOrEqual(viewport.width);
    const detailBounds = await atlas.locator("[data-atlas-detail]")
      .boundingBox();
    expect(detailBounds?.y ?? Number.POSITIVE_INFINITY)
      .toBeLessThan((bounds?.y ?? 0) + (bounds?.height ?? 0));
    if (viewport.width <= 768) {
      expect((detailBounds?.y ?? 0) + (detailBounds?.height ?? 0))
        .toBeLessThanOrEqual((bounds?.y ?? 0) + (bounds?.height ?? 0));
    }
    const isEvidenceViewport =
      testInfo.project.name === "mobile"
        ? viewport.width === 390
        : viewport.width === 1440;
    if (isEvidenceViewport) {
      await recordEvidenceScreenshot(
        page,
        testInfo,
        2,
        "atlas-200pct-reduced"
      );
    }
  }
});

test("lazy Watch Trail stays usable across contracted Replay viewports", async ({
  page
}, testInfo) => {
  const plan = milestoneWinningPlan("TRAIL-VIEW-4");
  const replay = createTerminalRunReplay(
    plan.actions.map((action) =>
      action.type === "move"
        ? { type: "move", direction: action.direction, elapsedMs: 0 }
        : { type: "challenge-outcome", outcome: "correct", elapsedMs: 0 }
    ),
    plan.finalRun
  );
  if (!replay) {
    throw new Error("Expected a retained Replay fixture.");
  }
  await page.addInitScript(({ retainedReplay }) => {
    const corruptReplay = JSON.parse(JSON.stringify(retainedReplay));
    corruptReplay.terminal.moves += 1;
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([
      {
        elapsedMs: retainedReplay.terminal.elapsedMs,
        moves: retainedReplay.terminal.moves,
        seed: "TRAIL-VIEW-4",
        outcome: "escaped",
        echoesCollected: retainedReplay.terminal.echoesCollected,
        echoTotal: retainedReplay.terminal.echoTotal,
        questId: "quest_replay_e2e_123",
        questLevelId: "trail-scout",
        labyrinthNumber: 4,
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1",
        replay: retainedReplay
      },
      {
        elapsedMs: 900,
        moves: 5,
        seed: "OLD-RECORD",
        outcome: "defeated",
        echoesCollected: 1,
        echoTotal: 3,
        questLevelId: "trail-scout",
        labyrinthNumber: 2,
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1"
      },
      {
        elapsedMs: corruptReplay.terminal.elapsedMs + 1,
        moves: corruptReplay.terminal.moves,
        seed: "CORRUPT-TRAIL",
        outcome: "escaped",
        echoesCollected: corruptReplay.terminal.echoesCollected,
        echoTotal: corruptReplay.terminal.echoTotal,
        questId: "quest_replay_e2e_123",
        questLevelId: "trail-scout",
        labyrinthNumber: 3,
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1",
        replay: corruptReplay
      }
    ]));
    localStorage.setItem("echo-maze:quest-progress:v1", JSON.stringify({
      version: 1,
      questId: "quest_replay_e2e_123",
      levelId: "trail-scout",
      labyrinthNumber: 5,
      completedLabyrinths: 4,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    }));
  }, { retainedReplay: replay });

  const viewports = testInfo.project.name === "mobile"
    ? [{ width: 390, height: 844 }]
    : [
        { width: 320, height: 720 },
        { width: 390, height: 844 },
        { width: 768, height: 900 },
        { width: 1440, height: 1000 }
      ];
  for (const [viewportIndex, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({
      reducedMotion: viewportIndex === 0 ? "reduce" : "no-preference"
    });
    await page.goto("/?seed=TRAIL-SHELL&level=trail-scout&labyrinth=5");
    await expectGameReady(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    if (viewportIndex === 0) {
      await expect.poll(() =>
        page.evaluate(() =>
          performance.getEntriesByType("resource").some(
            (entry) => entry.name.includes("run-replay-view")
          )
        )
      ).toBe(false);
    }

    await page.getByRole("button", { name: "Records", exact: true }).click();
    const records = page.getByRole("dialog", { name: "Run Records" });
    await expect(records).toBeVisible();
    await expect(
      records.getByRole("button", {
        name: "Watch retained Trail for seed TRAIL-VIEW-4"
      })
    ).toBeVisible();
    await expect(
      records.getByRole("button", { name: "Play seed TRAIL-VIEW-4" })
    ).toBeVisible();
    await expect(
      records.getByRole("button", { name: "Play seed OLD-RECORD" })
    ).toBeVisible();
    await expect(
      records.getByRole("button", {
        name: "Watch retained Trail for seed OLD-RECORD"
      })
    ).toHaveCount(0);
    await records.getByRole("button", {
      name: "Watch retained Trail for seed TRAIL-VIEW-4"
    }).click();

    const viewer = page.getByRole("dialog", { name: "Watch Trail" });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("[data-run-replay-event]"))
      .toHaveCount(replay.actions.length + 1);
    await expect(viewer.getByRole("toolbar", {
      name: "Run Replay controls"
    })).toBeVisible();
    await expect(viewer.getByLabel(
      "Reconstructed maze state for the selected Trail step."
    )).toBeVisible();
    const nextStep = viewer.getByRole("button", { name: "Next step" });
    if (testInfo.project.name === "mobile") {
      await nextStep.tap();
    } else {
      await nextStep.click();
    }
    await expect(viewer.locator("[data-run-replay-status]"))
      .toContainText("Step 1 of");
    await viewer.getByRole("button", { name: "Play", exact: true }).click();
    if (viewportIndex === 0) {
      await expect(viewer.locator("[data-run-replay-status]"))
        .toContainText("Step 2 of");
      await expect(viewer.getByRole("button", { name: "Play", exact: true }))
        .toBeVisible();
    } else {
      await expect(viewer.getByRole("button", { name: "Pause", exact: true }))
        .toBeVisible();
      await viewer.getByRole("button", { name: "Pause", exact: true }).click();
    }
    await viewer.getByRole("heading", { name: "Watch Trail" }).focus();
    await page.keyboard.press("End");
    await expect(viewer.locator("[data-run-replay-status]"))
      .toContainText(`Step ${replay.actions.length} of`);
    await viewer.getByRole("button", { name: "Restart" }).click();
    await expect(viewer.locator("[data-run-replay-status]"))
      .toContainText(`Step 0 of ${replay.actions.length}`);
    const isEvidenceViewport =
      testInfo.project.name === "mobile"
        ? viewport.width === 390
        : viewport.width === 1440;
    if (isEvidenceViewport) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await viewer.evaluate((dialog) => {
        dialog.scrollTop = 0;
      });
      await expect.poll(() => viewer.evaluate((dialog) => dialog.scrollTop))
        .toBe(0);
      await recordEvidenceScreenshot(
        page,
        testInfo,
        2,
        "watch-trail-200pct-reduced"
      );
    }

    const bounds = await viewer.boundingBox();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0))
      .toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )).toBeLessThanOrEqual(1);

    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(viewer).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Records", exact: true })
    ).toBeFocused();

    await page.getByRole("button", { name: "Records", exact: true }).click();
    await records.getByRole("button", {
      name: "Watch retained Trail for seed CORRUPT-TRAIL"
    }).click();
    await expect(viewer).not.toBeVisible();
    await expect(page.locator("#live-region")).toHaveText(
      "This Trail is corrupt, so it cannot be watched. Play This Seed is still available."
    );
    await page.getByRole("button", { name: "Records", exact: true }).click();
    await expect(
      records.getByRole("button", { name: "Play seed CORRUPT-TRAIL" })
    ).toBeVisible();
    await records.getByRole("button", { name: "Close" }).click();

    const questProgressBeforeAtlas = await page.evaluate(() =>
      localStorage.getItem("echo-maze:quest-progress:v1")
    );
    expect(await page.evaluate(() => {
      const progress = JSON.parse(
        localStorage.getItem("echo-maze:quest-progress:v1") ?? "null"
      );
      const records = JSON.parse(
        localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
      );
      return {
        progressQuestId: progress?.questId,
        progressLevelId: progress?.levelId,
        completedLabyrinths: progress?.completedLabyrinths,
        recordQuestId: records[0]?.questId,
        sameQuest: records[0]?.questId === progress?.questId,
        recordLevelId: records[0]?.questLevelId,
        recordLabyrinthNumber: records[0]?.labyrinthNumber,
        hasReplay: Boolean(records[0]?.replay)
      };
    })).toEqual({
      progressQuestId: expect.any(String),
      progressLevelId: "trail-scout",
      completedLabyrinths: 4,
      recordQuestId: expect.any(String),
      sameQuest: true,
      recordLevelId: "trail-scout",
      recordLabyrinthNumber: 4,
      hasReplay: true
    });

    await page.getByRole("button", { name: "Atlas", exact: true }).click();
    const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
    await expect(atlas).toBeVisible();
    await atlas.getByRole("button", { name: "List view" }).click();
    const retainedLandmark = atlas.locator(
      "[data-atlas-landmark='foundation-4']"
    );
    if (testInfo.project.name === "mobile") {
      await retainedLandmark.tap();
    } else {
      await retainedLandmark.click();
    }
    await expect(atlas.getByRole("button", { name: "Watch Trail" }))
      .toBeVisible();
    await atlas.evaluate((element) => {
      element.scrollTop = 73;
    });
    if (testInfo.project.name === "mobile") {
      await atlas.getByRole("button", { name: "Watch Trail" }).tap();
    } else {
      await atlas.getByRole("button", { name: "Watch Trail" }).click();
    }

    await expect(viewer).toBeVisible();
    await expect(atlas).toBeVisible();
    const atlasScrollTop = await atlas.evaluate((element) => element.scrollTop);
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(viewer).not.toBeVisible();
    await expect(atlas).toBeVisible();
    await expect(retainedLandmark).toBeFocused();
    await expect(atlas.locator("[data-atlas-landmarks]"))
      .toHaveAttribute("data-view", "list");
    expect(new URL(page.url()).searchParams.get("atlas"))
      .toBe("foundation-4");
    expect(await atlas.evaluate((element) => element.scrollTop))
      .toBe(atlasScrollTop);

    const corruptLandmark = atlas.locator(
      "[data-atlas-landmark='foundation-3']"
    );
    if (testInfo.project.name === "mobile") {
      await corruptLandmark.tap();
    } else {
      await corruptLandmark.click();
    }
    await expect(atlas.getByRole("button", { name: "Watch Trail" }))
      .toHaveCount(0);
    expect(await page.evaluate(() =>
      localStorage.getItem("echo-maze:quest-progress:v1")
    )).toBe(questProgressBeforeAtlas);
    await atlas.getByRole("button", { name: "Close" }).click();
  }
});

test("previews, saves, and resets presentation-only Explorer Access Settings", async ({
  page
}) => {
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);
  const settingsButton = page.getByRole("button", { name: "Settings" });
  const initialRunFacts = await page.evaluate(() => ({
    seed: document.querySelector("#seed-value")?.textContent,
    moves: document.querySelector("#moves-value")?.textContent,
    echoes: document.querySelector("#echo-count")?.textContent,
    vitality: document.querySelector("#vitality-count")?.textContent,
    canvasWidth: document.querySelector("#maze-canvas")?.getAttribute("width"),
    canvasHeight: document.querySelector("#maze-canvas")?.getAttribute("height")
  }));
  const defaultFog = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-fog")
      .trim()
  );

  await settingsButton.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Explorer Access Settings"
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#access-settings-title")).toBeFocused();
  const defaultQuestionFamily = await page
    .locator(".access-question-preview")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  const defaultAnswerLineHeight = await page
    .locator(".access-answer-preview strong")
    .evaluate((element) => getComputedStyle(element).lineHeight);

  const contrast = page.getByLabel("Stronger Fog contrast");
  await contrast.focus();
  await page.keyboard.press("Space");
  await page.getByLabel("Larger maze marks").check();
  await page.getByLabel("Reader-friendly Question text").check();
  await page.getByLabel("Reduce visual effects").check();

  await expect(page.locator("html")).toHaveAttribute(
    "data-access-contrast",
    "strong"
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-marks",
    "large"
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:explorer-access-settings:v1")
    )
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-fog")
        .trim()
    )
  ).not.toBe(defaultFog);
  expect(
    await page.locator(".access-question-preview").evaluate(
      (element) => getComputedStyle(element).fontFamily
    )
  ).toContain("Geist");
  expect(
    await page.locator(".access-answer-preview strong").evaluate(
      (element) => getComputedStyle(element).lineHeight
    )
  ).not.toBe(defaultAnswerLineHeight);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-contrast",
    "default"
  );
  expect(
    await page.locator(".access-question-preview").evaluate(
      (element) => getComputedStyle(element).fontFamily
    )
  ).toBe(defaultQuestionFamily);
  expect(
    await page.locator(".access-answer-preview strong").evaluate(
      (element) => getComputedStyle(element).lineHeight
    )
  ).toBe(defaultAnswerLineHeight);

  await settingsButton.click();
  await page.getByLabel("Stronger Fog contrast").check();
  await page.getByLabel("Larger maze marks").check();
  await page.getByLabel("Reader-friendly Question text").check();
  await page.getByLabel("Reduce visual effects").check();
  await page.getByRole("button", { name: "Save settings" }).click();

  const storedSettings = await page.evaluate(() =>
    localStorage.getItem("echo-maze:explorer-access-settings:v1")
  );
  expect(JSON.parse(storedSettings ?? "null")).toEqual({
    version: 2,
    highContrast: true,
    largeMarks: true,
    readerFriendlyQuestions: true,
    reducedEffects: true,
    trailCompassEnabled: false,
    narrationPace: "standard"
  });
  const savedRunFacts = await page.evaluate(() => ({
    seed: document.querySelector("#seed-value")?.textContent,
    moves: document.querySelector("#moves-value")?.textContent,
    echoes: document.querySelector("#echo-count")?.textContent,
    vitality: document.querySelector("#vitality-count")?.textContent,
    canvasWidth: document.querySelector("#maze-canvas")?.getAttribute("width"),
    canvasHeight: document.querySelector("#maze-canvas")?.getAttribute("height")
  }));
  expect(savedRunFacts).toEqual(initialRunFacts);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-type",
    "reader"
  );
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator("#access-settings-status")).toHaveText(
    "Canonical design restored."
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-effects",
    "system"
  );
});

test("keeps a Run paused when Settings is activated twice while loading", async ({
  page
}) => {
  await page.route("**/assets/access-settings-view-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);

  await page.getByRole("button", { name: "Settings" }).dblclick({
    delay: 20
  });
  const dialog = page.getByRole("dialog", {
    name: "Explorer Access Settings"
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#run-state")).toHaveText("Paused");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
});

test("retries the Settings view after its first chunk request fails", async ({
  page
}) => {
  let requests = 0;
  await page.route("**/assets/access-settings-view-*.js", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);
  const settingsButton = page.getByRole("button", { name: "Settings" });

  await settingsButton.click();
  await expect(page.locator("#live-region")).toContainText(
    "Explorer Access Settings are unavailable. Try again."
  );
  await settingsButton.click();

  await expect(
    page.getByRole("dialog", { name: "Explorer Access Settings" })
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("keeps every Access Setting readable at mobile fold and 200 percent text", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?seed=ACCESS-FOLD&level=trail-scout");
  await expectGameReady(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Stronger Fog contrast").check();
  await page.getByLabel("Larger maze marks").check();
  await page.getByLabel("Reader-friendly Question text").check();
  await page.getByLabel("Reduce visual effects").check();
  await page.getByRole("button", { name: "Save settings" }).click();

  const mobileMaze = await page.locator("#maze-canvas").boundingBox();
  const touchControls = await page.locator(".touch-controls").boundingBox();
  if (!mobileMaze || !touchControls) {
    throw new Error("Expected mobile gameplay controls.");
  }
  expect(mobileMaze.y + mobileMaze.height).toBeLessThanOrEqual(844);
  expect(touchControls.y + touchControls.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--maze-mark-scale")
        .trim()
    )
  ).toBe("1.22");
  expect(
    await page.locator("#challenge-question").evaluate(
      (element) => getComputedStyle(element).fontFamily
    )
  ).toContain("Geist");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
    document.querySelector("#canvas-frame")?.classList.add("is-hurt");
  });
  await page.getByRole("button", { name: "Settings" }).click();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const saveSettings = page.getByRole("button", { name: "Save settings" });
  await expect(saveSettings).toBeVisible();
  await saveSettings.scrollIntoViewIfNeeded();
  const saveBounds = await saveSettings.boundingBox();
  if (!saveBounds) {
    throw new Error("Expected the Settings actions.");
  }
  expect(saveBounds.y).toBeGreaterThanOrEqual(0);
  expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(844);
  const animationDuration = await page
    .locator("#canvas-frame")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.001);
});

test("keeps signed-out Quest progress local and playable", async ({
  page
}) => {
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);

  await expect(page.getByLabel(/Interactive maze/)).toBeVisible();
  await expect(page.locator("#quest-sync-status")).toHaveText(
    "Device save"
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#moves-value")).toHaveText("001");
});

test("shows an explicit keyboard-safe choice for different device Quests", async ({
  page
}) => {
  const local = {
    version: 1,
    questId: "quest_local_choice_123",
    levelId: "trail-scout",
    labyrinthNumber: 5,
    completedLabyrinths: 4,
    usedMapFingerprints: [],
    usedQuestionIds: [],
    nextQuestionOrdinal: 0,
    complete: false
  };
  const cloud = {
    progress: {
      ...local,
      questId: "quest_cloud_choice_456",
      levelId: "maze-master",
      labyrinthNumber: 9,
      completedLabyrinths: 8
    },
    revision: 2,
    updatedAt: "2026-07-26T00:00:00.000Z"
  };
  await page.route(
    "**/assets/quest-continuity-controller-*.js",
    async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          export function createQuestContinuityController({ onConflict }) {
            return {
              setAuthenticated() {},
              queueBoundary() { return Promise.resolve(false); },
              retry() {
                onConflict(${JSON.stringify({ local, cloud })});
                return Promise.resolve(false);
              },
              resolveConflict() { return Promise.resolve(true); }
            };
          }
        `
      });
    }
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play");
  await expectGameReady(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const dialog = page.getByRole("dialog", {
    name: "Choose which Quest to keep"
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Trail Scout");
  await expect(dialog).toContainText("Maze Master");
  await expect(page.locator("#quest-conflict-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth)
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Use Cloud Quest" }).click();
  await expect(dialog).not.toBeVisible();
});

test("retries the Cloud Quest choice view after its first chunk fails", async ({
  page
}) => {
  const local = {
    version: 1,
    questId: "quest_local_retry_123",
    levelId: "trail-scout",
    labyrinthNumber: 3,
    completedLabyrinths: 2,
    usedMapFingerprints: [],
    usedQuestionIds: [],
    nextQuestionOrdinal: 0,
    complete: false
  };
  const cloud = {
    progress: {
      ...local,
      questId: "quest_cloud_retry_456",
      labyrinthNumber: 7,
      completedLabyrinths: 6
    },
    revision: 2,
    updatedAt: "2026-07-26T00:00:00.000Z"
  };
  await page.route(
    "**/assets/quest-continuity-controller-*.js",
    async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          export function createQuestContinuityController({ onConflict }) {
            const conflict = ${JSON.stringify({ local, cloud })};
            return {
              setAuthenticated() {},
              queueBoundary() { return Promise.resolve(false); },
              retry() {
                onConflict(conflict);
                return Promise.resolve(false);
              },
              resolveConflict() { return Promise.resolve(true); }
            };
          }
        `
      });
    }
  );
  let requests = 0;
  await page.route("**/assets/quest-conflict-view-*.js", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#live-region")).toContainText(
    "Cloud Quest choice is unavailable. Your device Quest is safe."
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(
    page.getByRole("dialog", { name: "Choose which Quest to keep" })
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("resumes an active Run after a repeated Cloud Quest conflict is resolved", async ({
  page
}) => {
  const local = {
    version: 1,
    questId: "quest_local_repeat_123",
    levelId: "trail-scout",
    labyrinthNumber: 4,
    completedLabyrinths: 3,
    usedMapFingerprints: [],
    usedQuestionIds: [],
    nextQuestionOrdinal: 0,
    complete: false
  };
  const cloud = {
    progress: {
      ...local,
      questId: "quest_cloud_repeat_456",
      labyrinthNumber: 8,
      completedLabyrinths: 7
    },
    revision: 2,
    updatedAt: "2026-07-26T00:00:00.000Z"
  };
  await page.route(
    "**/assets/quest-continuity-controller-*.js",
    async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          export function createQuestContinuityController({ onConflict }) {
            let choices = 0;
            const conflict = ${JSON.stringify({ local, cloud })};
            return {
              setAuthenticated() {},
              queueBoundary() { return Promise.resolve(false); },
              retry() {
                onConflict(conflict);
                return Promise.resolve(false);
              },
              resolveConflict() {
                choices += 1;
                if (choices === 1) {
                  onConflict(conflict);
                  return Promise.resolve(false);
                }
                return Promise.resolve(true);
              }
            };
          }
        `
      });
    }
  );

  await page.goto("/?seed=REPEATED-CLOUD-CONFLICT&level=trail-scout");
  await expectGameReady(page);
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const dialog = page.getByRole("dialog", {
    name: "Choose which Quest to keep"
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep this device" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use Cloud Quest" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
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
  await expectGameReady(page);

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
  await expectGameReady(page);

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
  await expectGameReady(page);

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

  for (const action of await page.locator(".command-bar__actions button").all()) {
    const dimensions = await action.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(
      dimensions.scrollWidth,
      `${await action.textContent()} must not clip`
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }

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
  /** @type {string[]} */
  const leaderboardRequests = [];
  await page.route("**/api/leaderboard**", async (route) => {
    leaderboardRequests.push(route.request().url());
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
  await page.goto(
    "/?seed=GLOBAL-BOARD&level=trail-scout&region=foundation&rules=echo-hush-v1"
  );
  await expectGameReady(page);

  await expect(page.locator("#player-name")).toHaveText("Guest");
  await expect(page.locator("#player-score")).toHaveText("0");
  await expect(page.locator("#global-max-score")).toHaveText("900");
  await page.getByRole("button", { name: "Top 10" }).click();
  await expect(
    page.getByRole("heading", { name: "Global Scoreboard" })
  ).toBeVisible();
  await expect(page.locator("#scoreboard-list")).toContainText("Moss Runner");
  await expect(page.locator("#scoreboard-list")).toContainText("900");
  await expect(page.locator("#scoreboard-partition-label")).toHaveText(
    "Showing Foundation · Echo Hush."
  );
  expect(new URL(leaderboardRequests.at(-1) ?? "").searchParams.get("region"))
    .toBe("foundation");
  expect(new URL(leaderboardRequests.at(-1) ?? "").searchParams.get("rules"))
    .toBe("echo-hush-v1");

  await page.locator("#scoreboard-partition").selectOption("classic-v1");
  await expect(page.locator("#scoreboard-partition-label")).toHaveText(
    "Showing Foundation · Classic Rules."
  );
  await expect.poll(() => leaderboardRequests.length).toBeGreaterThan(1);
  expect(new URL(leaderboardRequests.at(-1) ?? "").searchParams.get("rules"))
    .toBe("classic-v1");
  await expect(page.getByRole("button", { name: "Records", exact: true })).toBeVisible();
});

test("pauses an active run while Records are open", async ({ page }) => {
  await page.goto("/?seed=RECORDS-PAUSE");
  await expectGameReady(page);

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
  await expectGameReady(page);

  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy share link for seed NARROW-RECORD" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play seed NARROW-RECORD" })
  ).toBeVisible();
  const dialog = await page.locator("#records-dialog").boundingBox();
  if (!dialog) {
    throw new Error("Expected the Records dialog.");
  }
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Play seed NARROW-RECORD" }).click();
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Atlas Region: Advanced · Classic Rules"
  );
  await expect(page.locator("#echo-count")).toHaveText("0 / 5");
});

test("hydrates a shared seed at its Labyrinth Number", async ({ page }) => {
  await page.goto(
    "/?seed=SHARED-LABYRINTH&level=trail-scout&labyrinth=13"
  );
  await expectGameReady(page);

  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Atlas Region: Advanced · Classic Rules"
  );
  await expect(page.locator("#echo-count")).toHaveText("0 / 5");
});

test("round-trips an exact Region ruleset through share and active recovery identity", async ({
  page
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, "__copiedShareLink", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", String(value));
        }
      }
    });
  });
  await page.goto(
    "/?seed=RULESET-SHARE&level=trail-scout&labyrinth=13&region=advanced&rules=tide-doors-v1"
  );
  await expectGameReady(page);

  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Atlas Region: Advanced · Trail Twist: Tide Doors"
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("echo-maze:active-run:v1") ?? "null")
      )
    )
    .toMatchObject({
      version: 3,
      atlasRegionId: "advanced",
      rulesetRevision: "tide-doors-v1"
    });

  await page.locator("#seed-copy").click();
  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedShareLink")))
  );
  expect(copied.searchParams.get("region")).toBe("advanced");
  expect(copied.searchParams.get("rules")).toBe("tide-doors-v1");
});

test("carries Region 2 identity from Atlas through Windway play and Watch Trail", async ({
  page
}, testInfo) => {
  const retainedPlan = milestoneWinningPlan("WIND-TRAIL-5", 5);
  const retainedReplay = createTerminalRunReplay(
    retainedPlan.actions.map((action) =>
      action.type === "move"
        ? { type: "move", direction: action.direction, elapsedMs: 0 }
        : { type: "challenge-outcome", outcome: "correct", elapsedMs: 0 }
    ),
    retainedPlan.finalRun
  );
  if (!retainedReplay) {
    throw new Error("Expected a retained Region 2 Trail fixture.");
  }
  await page.addInitScript(({ replay }) => {
    Reflect.set(window, "__copiedShareLink", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", String(value));
        }
      }
    });
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: replay.terminal.elapsedMs,
      moves: replay.terminal.moves,
      seed: "WIND-TRAIL-5",
      outcome: "escaped",
      echoesCollected: replay.terminal.echoesCollected,
      echoTotal: replay.terminal.echoTotal,
      questId: "quest_windways_e2e_123",
      questLevelId: "trail-scout",
      labyrinthNumber: 5,
      atlasRegionId: "developing",
      rulesetRevision: "windways-v1",
      replay
    }]));
    localStorage.setItem("echo-maze:quest-progress:v1", JSON.stringify({
      version: 1,
      questId: "quest_windways_e2e_123",
      levelId: "trail-scout",
      labyrinthNumber: 6,
      completedLabyrinths: 5,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    }));
  }, { replay: retainedReplay });

  await page.goto(
    "/?seed=WIND-VIEW-34&level=trail-scout&labyrinth=5&region=developing&rules=windways-v1"
  );
  await expectGameReady(page);

  await expect(page.locator("#quest-stage")).toContainText(
    "Atlas Region: Developing"
  );
  await expect(page.locator("#quest-stage")).toContainText(
    "Trail Twist: Windways"
  );
  await expect(page.locator("#warden-guild")).toContainText("Kitewatch Guild");
  await expect(page.locator("#warden-guild")).toContainText(
    "Windcall reed chorus is optional"
  );
  await expect(page.locator("#windway-legend")).toBeVisible();
  await expect(page.getByLabel(/Interactive maze/)).toHaveAttribute(
    "aria-label",
    /directional Windway source and destination/
  );
  for (const action of await page.locator(".command-bar__actions > *").all()) {
    expect(await action.evaluate((element) =>
      element.scrollWidth <= element.clientWidth &&
      element.scrollHeight <= element.clientHeight
    )).toBe(true);
  }

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  const developingRegion = atlas.locator(
    "[data-atlas-region='developing']"
  );
  await expect(developingRegion).toContainText("Windcall Ridge");
  await expect(developingRegion).toContainText(
    "Rising wind and bright trail ribbons"
  );
  await expect(developingRegion).toContainText("Rising Wind Sigil");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(atlas).not.toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  for (let move = 0; move < 3; move += 1) {
    await page.locator("[data-move='down']").dispatchEvent("click");
    await expect(page.locator("#moves-value")).toHaveText(
      String(move + 1).padStart(3, "0")
    );
  }
  await expect(page.locator("#field-note")).toHaveText(
    "Windway carried you down."
  );
  await recordEvidenceScreenshot(
    page,
    testInfo,
    2,
    "region-2-windway"
  );

  await page.locator("#seed-copy").click();
  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedShareLink")))
  );
  expect(copied.searchParams.get("region")).toBe("developing");
  expect(copied.searchParams.get("rules")).toBe("windways-v1");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toContainText("Atlas Region: Developing");
  await expect(records).toContainText("Trail Twist: Windways");
  await records.getByRole("button", {
    name: "Watch retained Trail for seed WIND-TRAIL-5"
  }).click();
  const viewer = page.getByRole("dialog", { name: "Watch Trail" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByLabel(
    "Reconstructed maze state for the selected Trail step."
  )).toBeVisible();
  await viewer.getByRole("heading", { name: "Watch Trail" }).focus();
  await page.keyboard.press("End");
  await expect(viewer.locator("[data-run-replay-status]")).toContainText(
    `Step ${retainedReplay.actions.length} of`
  );
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(records).not.toBeVisible();

  await page.goto(
    "/?seed=WIND-SHELL-6&level=trail-scout&labyrinth=6&region=developing&rules=windways-v1"
  );
  await expectGameReady(page);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await atlas.getByRole("button", { name: "List view" }).click();
  await atlas.locator("[data-atlas-landmark='developing-5']").click();
  await expect(atlas.getByRole("button", { name: "Watch Trail" }))
    .toBeVisible();
  await atlas.getByRole("button", { name: "Watch Trail" }).click();
  await expect(viewer).toBeVisible();
});

test("carries Region 3 identity through Echo Bridge play and Watch Trail", async ({
  page
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 }
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const retainedPlan = milestoneWinningPlan("BRIDGE-TRAIL-9", 9);
  const retainedReplay = createTerminalRunReplay(
    retainedPlan.actions.map((action) =>
      action.type === "move"
        ? { type: "move", direction: action.direction, elapsedMs: 0 }
        : { type: "challenge-outcome", outcome: "correct", elapsedMs: 0 }
    ),
    retainedPlan.finalRun
  );
  const travelPlan = echoBridgeTravelPlan("BRIDGE-VIEW-9");
  if (!retainedReplay) {
    throw new Error("Expected a retained Region 3 Trail fixture.");
  }
  await page.addInitScript(({ replay }) => {
    Reflect.set(window, "__copiedShareLink", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", String(value));
        }
      }
    });
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: replay.terminal.elapsedMs,
      moves: replay.terminal.moves,
      seed: "BRIDGE-TRAIL-9",
      outcome: "escaped",
      echoesCollected: replay.terminal.echoesCollected,
      echoTotal: replay.terminal.echoTotal,
      questId: "quest_bridges_e2e_123",
      questLevelId: "trail-scout",
      labyrinthNumber: 9,
      atlasRegionId: "capable",
      rulesetRevision: "echo-bridges-v1",
      replay
    }]));
    localStorage.setItem("echo-maze:quest-progress:v1", JSON.stringify({
      version: 1,
      questId: "quest_bridges_e2e_123",
      levelId: "trail-scout",
      labyrinthNumber: 10,
      completedLabyrinths: 9,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    }));
  }, { replay: retainedReplay });

  await page.goto(
    "/?seed=BRIDGE-VIEW-9&level=trail-scout&labyrinth=9&region=capable&rules=echo-bridges-v1"
  );
  await expectGameReady(page);
  await expect(page.locator("#quest-stage")).toContainText(
    "Atlas Region: Capable"
  );
  await expect(page.locator("#quest-stage")).toContainText(
    "Trail Twist: Echo Bridges"
  );
  await expect(page.locator("#warden-guild")).toContainText("Spanwatch Guild");
  await expect(page.locator("#warden-guild")).toContainText(
    "Sunspan string chorus is optional"
  );
  await expect(page.locator("#echo-bridge-legend")).toBeVisible();
  await expect(page.getByLabel(/Interactive maze/)).toHaveAttribute(
    "aria-label",
    /Pair 1 sealed/
  );
  for (const action of await page
    .locator(".command-bar__actions > :visible")
    .all()) {
    const fit = await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        boxHeight: bounds.height,
        boxWidth: bounds.width,
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        id: element.id,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.trim() ?? ""
      };
    });
    expect(
      fit.scrollWidth <= fit.boxWidth &&
        fit.scrollHeight <= fit.boxHeight &&
        fit.boxWidth >= 44 &&
        fit.boxHeight >= 44,
      `${fit.id || fit.text} must not clip: ${JSON.stringify(fit)}`
    ).toBe(true);
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);

  const atlasButton = page.getByRole("button", { name: "Atlas", exact: true });
  await atlasButton.click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  const capableRegion = atlas.locator("[data-atlas-region='capable']");
  await expect(capableRegion).toContainText("Sunspan Crossing");
  await expect(capableRegion).toContainText(
    "Joined arches and clear blue spans"
  );
  await expect(capableRegion).toContainText("Joined Path Sigil");
  await atlas.getByRole("button", { name: "Close" }).click();

  await expect(atlasButton).toBeFocused();
  const maze = page.getByLabel(/Interactive maze/);
  await recordRegion3Screenshot(page, testInfo, "shell");
  const challenge = page.locator("#challenge-dialog");
  let expectedMoves = 0;
  let questionOrdinal = 0;
  for (const [actionIndex, action] of travelPlan.actions.entries()) {
    if (action.type === "move") {
      await maze.press(KEY_BY_DIRECTION[action.direction]);
      expectedMoves += 1;
      await expect.poll(async () => {
        const state = await page.evaluate(() => ({
          activeElement: document.activeElement?.id ?? "",
          challengeVisible: document
            .querySelector("#challenge-dialog")
            ?.matches(":modal") ?? false,
          moves: Number(document.querySelector("#moves-value")?.textContent ?? -1),
          openDialogs: [...document.querySelectorAll("dialog[open]")]
            .map((dialog) => dialog.id)
        }));
        return state.moves === expectedMoves || state.challengeVisible
          ? "acknowledged"
          : JSON.stringify(state);
      }, {
        message:
          `Region 3 action ${actionIndex} (${action.direction}) was not acknowledged`
      }).toBe("acknowledged");
      continue;
    }
    await expect(challenge, {
      message: `Region 3 action ${actionIndex} expected a Warden Challenge`
    }).toBeVisible();
    const bundled = getBundledQuestion({
      levelId: "trail-scout",
      labyrinthNumber: 9,
      questionOrdinal,
      seed: "BRIDGE-VIEW-9",
      wardenId: action.wardenId,
      challengeKind: action.kind === "gate-warden"
        ? "gate-warden"
        : "warden"
    });
    questionOrdinal += 1;
    await page.locator(`[data-answer="${bundled.answerId}"]`).click();
    await expect(challenge).not.toBeVisible();
  }
  await expect(page.locator("#field-note")).toHaveText(
    "Echo Bridge carried you across the sealed wall."
  );
  await expect(page.locator("#moves-value")).toHaveText(
    String(travelPlan.finalRun.moves).padStart(3, "0")
  );
  await maze.scrollIntoViewIfNeeded();
  await recordRegion3Screenshot(page, testInfo, "opened-bridge");

  await page.locator("#seed-copy").click();
  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedShareLink")))
  );
  expect(copied.searchParams.get("region")).toBe("capable");
  expect(copied.searchParams.get("rules")).toBe("echo-bridges-v1");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toContainText("Atlas Region: Capable");
  await expect(records).toContainText("Trail Twist: Echo Bridges");
  await records.getByRole("button", {
    name: "Watch retained Trail for seed BRIDGE-TRAIL-9"
  }).click();
  const viewer = page.getByRole("dialog", { name: "Watch Trail" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("End");
  await expect(viewer.locator("[data-run-replay-status]")).toContainText(
    `Step ${retainedReplay.actions.length} of`
  );
  await viewer.getByRole("button", { name: "Close" }).click();

  await page.goto(
    "/?seed=BRIDGE-SHELL-10&level=trail-scout&labyrinth=10&region=capable&rules=echo-bridges-v1"
  );
  await expectGameReady(page);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await atlas.getByRole("button", { name: "List view" }).click();
  await atlas.locator("[data-atlas-landmark='capable-9']").click();
  await expect(atlas.getByRole("button", { name: "Watch Trail" }))
    .toBeVisible();
  await atlas.getByRole("button", { name: "Watch Trail" }).click();
  await expect(viewer).toBeVisible();
});

test("carries Region 4 identity and shared Tide phase through play and Watch Trail", async ({
  page
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 }
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const retainedPlan = milestoneWinningPlan("TIDE-TRAIL-13", 13);
  const retainedReplay = createTerminalRunReplay(
    retainedPlan.actions.map((action) =>
      action.type === "move"
        ? { type: "move", direction: action.direction, elapsedMs: 0 }
        : { type: "challenge-outcome", outcome: "correct", elapsedMs: 0 }
    ),
    retainedPlan.finalRun
  );
  if (!retainedReplay) {
    throw new Error("Expected a retained Region 4 Trail fixture.");
  }
  await page.addInitScript(({ replay }) => {
    Reflect.set(window, "__copiedShareLink", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", String(value));
        }
      }
    });
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: replay.terminal.elapsedMs,
      moves: replay.terminal.moves,
      seed: "TIDE-TRAIL-13",
      outcome: "escaped",
      echoesCollected: replay.terminal.echoesCollected,
      echoTotal: replay.terminal.echoTotal,
      questId: "quest_tide_e2e_123",
      questLevelId: "trail-scout",
      labyrinthNumber: 13,
      atlasRegionId: "advanced",
      rulesetRevision: "tide-doors-v1",
      replay
    }]));
    localStorage.setItem("echo-maze:quest-progress:v1", JSON.stringify({
      version: 1,
      questId: "quest_tide_e2e_123",
      levelId: "trail-scout",
      labyrinthNumber: 14,
      completedLabyrinths: 13,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    }));
  }, { replay: retainedReplay });

  await page.goto(
    "/?seed=TIDE-VIEW-13&level=trail-scout&labyrinth=13&region=advanced&rules=tide-doors-v1"
  );
  await expectGameReady(page);
  await expect(page.locator("#quest-stage")).toContainText(
    "Atlas Region: Advanced"
  );
  await expect(page.locator("#quest-stage")).toContainText(
    "Trail Twist: Tide Doors"
  );
  await expect(page.locator("#warden-guild")).toContainText(
    "Currentwatch Guild"
  );
  await expect(page.locator("#warden-guild")).toContainText(
    "Tideglass shell chorus is optional"
  );
  await expect(page.locator("#tide-door-legend")).toBeVisible();
  const maze = page.getByLabel(/Interactive maze/);
  await expect(maze).toHaveAttribute("aria-label", /currently open/);
  await expect(maze).toHaveAttribute("aria-label", /Explorer and Wardens share/);
  for (const action of await page
    .locator(".command-bar__actions > :visible")
    .all()) {
    const fit = await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        boxHeight: bounds.height,
        boxWidth: bounds.width,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth
      };
    });
    expect(
      fit.scrollWidth <= fit.boxWidth &&
        fit.scrollHeight <= fit.boxHeight &&
        fit.boxWidth >= 44 &&
        fit.boxHeight >= 44,
      `Region 4 command must remain readable: ${JSON.stringify(fit)}`
    ).toBe(true);
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  const advancedRegion = atlas.locator("[data-atlas-region='advanced']");
  await expect(advancedRegion).toContainText("Tideglass Reach");
  await expect(advancedRegion).toContainText(
    "Sea-glass channels and alternating tide marks"
  );
  await expect(advancedRegion).toContainText("Turning Tide Sigil");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Atlas", exact: true }))
    .toBeFocused();

  await recordRegion4Screenshot(page, testInfo, "open-phase");
  await page.getByRole("button", { name: /Pulse/ }).click();
  await expect(maze).toHaveAttribute("aria-label", /currently sealed/);
  await expect(page.locator("#field-note")).toContainText(
    "Tide Doors are now sealed"
  );
  await recordRegion4Screenshot(page, testInfo, "sealed-phase");

  await page.locator("#seed-copy").click();
  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedShareLink")))
  );
  expect(copied.searchParams.get("region")).toBe("advanced");
  expect(copied.searchParams.get("rules")).toBe("tide-doors-v1");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toContainText("Atlas Region: Advanced");
  await expect(records).toContainText("Trail Twist: Tide Doors");
  await records.getByRole("button", {
    name: "Watch retained Trail for seed TIDE-TRAIL-13"
  }).click();
  const viewer = page.getByRole("dialog", { name: "Watch Trail" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("End");
  await expect(viewer.locator("[data-run-replay-status]")).toContainText(
    `Step ${retainedReplay.actions.length} of`
  );
  await viewer.getByRole("button", { name: "Close" }).click();

  await page.goto(
    "/?seed=TIDE-SHELL-14&level=trail-scout&labyrinth=14&region=advanced&rules=tide-doors-v1"
  );
  await expectGameReady(page);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await atlas.getByRole("button", { name: "List view" }).click();
  await atlas.locator("[data-atlas-landmark='advanced-13']").click();
  await expect(atlas.getByRole("button", { name: "Watch Trail" }))
    .toBeVisible();
  await atlas.getByRole("button", { name: "Watch Trail" }).click();
  await expect(viewer).toBeVisible();
});

test("carries Region 5 identity and one-use Signal Bell through play and Watch Trail", async ({
  page
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 }
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const seed = "BELL-LURE-REPLAY-1";
  const ringPlan = signalBellRingPlan(seed);
  const retainedPlan = wardenBellWinningPlan(seed);
  const retainedReplay = createTerminalRunReplay(
    retainedPlan.actions.map((action) =>
      action.type === "move"
        ? { type: "move", direction: action.direction, elapsedMs: 0 }
        : action.type === "ring-bell"
          ? { type: "ring-bell", elapsedMs: 0 }
          : { type: "challenge-outcome", outcome: "correct", elapsedMs: 0 }
    ),
    retainedPlan.finalRun
  );
  if (!retainedReplay) {
    throw new Error("Expected a retained Region 5 Trail fixture.");
  }
  await page.addInitScript(({ replay }) => {
    Reflect.set(window, "__copiedShareLink", "");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (/** @type {string} */ value) => {
          Reflect.set(window, "__copiedShareLink", String(value));
        }
      }
    });
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: replay.terminal.elapsedMs,
      moves: replay.terminal.moves,
      seed: "BELL-LURE-REPLAY-1",
      outcome: "escaped",
      echoesCollected: replay.terminal.echoesCollected,
      echoTotal: replay.terminal.echoTotal,
      questId: "quest_bells_e2e_123",
      questLevelId: "trail-scout",
      labyrinthNumber: 17,
      atlasRegionId: "mastery",
      rulesetRevision: "warden-bells-v1",
      replay
    }]));
    localStorage.setItem("echo-maze:quest-progress:v1", JSON.stringify({
      version: 1,
      questId: "quest_bells_e2e_123",
      levelId: "trail-scout",
      labyrinthNumber: 18,
      completedLabyrinths: 17,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    }));
  }, { replay: retainedReplay });

  await page.goto(
    `/?seed=${seed}&level=trail-scout&labyrinth=17&region=mastery&rules=warden-bells-v1`
  );
  await expectGameReady(page);
  await expect(page.locator("#quest-stage")).toContainText(
    "Atlas Region: Mastery"
  );
  await expect(page.locator("#quest-stage")).toContainText(
    "Trail Twist: Warden Bells"
  );
  await expect(page.locator("#warden-guild")).toContainText("Chimewatch Guild");
  await expect(page.locator("#warden-guild")).toContainText(
    "Bellroot dusk chorus is optional"
  );
  await expect(page.locator("#signal-bell-legend")).toBeVisible();
  await expect(page.locator("#windway-legend")).toBeHidden();
  await expect(page.locator("#echo-bridge-legend")).toBeHidden();
  await expect(page.locator("#tide-door-legend")).toBeHidden();
  const maze = page.getByLabel(/Interactive maze/);
  await expect(maze).toHaveAttribute("aria-label", /2 unspent visible Signal Bells/);
  await expect(page.getByRole("button", { name: /Ring Bell/ })).toBeHidden();

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  const masteryRegion = atlas.locator("[data-atlas-region='mastery']");
  await expect(masteryRegion).toContainText("Bellroot Summit");
  await expect(masteryRegion).toContainText(
    "Beacon bells and resonant stone"
  );
  await expect(masteryRegion).toContainText("Last Light Sigil");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", { name: "Atlas", exact: true })
  ).toBeFocused();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#run-state")).toHaveText("Exploring");

  const challenge = page.locator("#challenge-dialog");
  let expectedMoves = 0;
  let questionOrdinal = 0;
  for (const [actionIndex, action] of ringPlan.actions.entries()) {
    if (action.type === "move") {
      await page.evaluate((key) => {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true
        }));
      }, KEY_BY_DIRECTION[action.direction]);
      expectedMoves += 1;
      await expect.poll(async () => {
        const state = await page.evaluate(() => ({
          challengeVisible: document
            .querySelector("#challenge-dialog")
            ?.matches(":modal") ?? false,
          moves: Number(document.querySelector("#moves-value")?.textContent ?? -1)
        }));
        return state.moves === expectedMoves || state.challengeVisible;
      }, {
        message:
          `Region 5 action ${actionIndex} (${action.direction}) was not acknowledged`
      }).toBe(true);
      continue;
    }
    await expect(challenge).toBeVisible();
    const bundled = getBundledQuestion({
      levelId: "trail-scout",
      labyrinthNumber: 17,
      questionOrdinal,
      seed,
      wardenId: action.wardenId,
      challengeKind: action.kind === "gate-warden"
        ? "gate-warden"
        : "warden"
    });
    questionOrdinal += 1;
    await page.locator(`[data-answer="${bundled.answerId}"]`).click();
    await expect(challenge).not.toBeVisible();
  }

  const ringButton = page.getByRole("button", { name: /Ring Bell/ });
  await expect(ringButton).toBeVisible();
  await expect(ringButton).toBeEnabled();
  for (const action of await page
    .locator(".arena-actions button:visible")
    .all()) {
    const fit = await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        boxHeight: bounds.height,
        boxWidth: bounds.width,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth
      };
    });
    expect(
      fit.scrollWidth <= fit.boxWidth &&
        fit.scrollHeight <= fit.boxHeight &&
        fit.boxWidth >= 44 &&
        fit.boxHeight >= 44,
      `Region 5 action must remain readable: ${JSON.stringify(fit)}`
    ).toBe(true);
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )).toBeLessThanOrEqual(1);
  await recordEvidenceScreenshot(page, testInfo, 2, "region-5-bell-ready");

  await ringButton.focus();
  await expect(ringButton).toBeFocused();
  await ringButton.press("Enter");
  expectedMoves += 1;
  await expect(page.locator("#moves-value")).toHaveText(
    String(expectedMoves).padStart(3, "0")
  );
  await expect(ringButton).toBeHidden();
  await expect(maze).toBeFocused();
  await expect(page.locator("#warden-state")).toHaveText("Lured to Bell");
  await expect(page.locator("#field-note")).toContainText("Signal Bell rung");
  await expect(maze).toHaveAttribute("aria-label", /1 unspent visible Signal Bells/);
  await recordEvidenceScreenshot(page, testInfo, 2, "region-5-bell-rung");

  await page.locator("#seed-copy").click();
  const copied = new URL(
    await page.evaluate(() => String(Reflect.get(window, "__copiedShareLink")))
  );
  expect(copied.searchParams.get("region")).toBe("mastery");
  expect(copied.searchParams.get("rules")).toBe("warden-bells-v1");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toContainText("Atlas Region: Mastery");
  await expect(records).toContainText("Trail Twist: Warden Bells");
  await records.getByRole("button", {
    name: `Watch retained Trail for seed ${seed}`
  }).click();
  const viewer = page.getByRole("dialog", { name: "Watch Trail" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("End");
  await expect(viewer.locator("[data-run-replay-status]")).toContainText(
    `Step ${retainedReplay.actions.length} of`
  );
  await viewer.getByRole("button", { name: "Close" }).click();

  await page.goto(
    "/?seed=BELL-SHELL-18&level=trail-scout&labyrinth=18&region=mastery&rules=warden-bells-v1"
  );
  await expectGameReady(page);
  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await atlas.getByRole("button", { name: "List view" }).click();
  const retainedLandmark = atlas.locator(
    "[data-atlas-landmark='mastery-17']"
  );
  await retainedLandmark.focus();
  await retainedLandmark.press("Enter");
  await expect(atlas.getByRole("button", { name: "Watch Trail" }))
    .toBeVisible();
  await atlas.getByRole("button", { name: "Watch Trail" }).click();
  await expect(viewer).toBeVisible();
});

test("normalizes an impossible shared ruleset to safe Classic Rules", async ({
  page
}) => {
  await page.goto(
    "/?seed=RULESET-MISMATCH&level=trail-scout&labyrinth=13&region=foundation&rules=echo-hush-v1"
  );
  await expectGameReady(page);

  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 13 of 20 · Atlas Region: Advanced · Classic Rules"
  );
  await expect(page.locator("#event-ribbon")).toContainText(
    "adjusted to a safe Labyrinth"
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("echo-maze:active-run:v1") ?? "null")
      )
    )
    .toMatchObject({
      version: 3,
      atlasRegionId: "advanced",
      rulesetRevision: "classic-v1"
    });
});

test("preserves native button keyboard behavior and pause timing", async ({
  page
}) => {
  await page.goto("/?seed=BUTTON-KEYS");
  await expectGameReady(page);
  const pulseCount = page.locator("#pulse-count");
  await expect(page.getByLabel(/Interactive maze/)).toBeFocused();
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
  await expectGameReady(page);
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
  await expectGameReady(page);

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
  await expectGameReady(page);
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
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toBeNull();
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
  await expectGameReady(page);
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

test("shows an inert reviewed Echo Lens only after an answer is committed", async ({
  page
}, testInfo) => {
  await page.route("**/api/question**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: LENS_QUESTION,
        source: "database"
      })
    });
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await expect(page.locator("#echo-lens")).toBeHidden();
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  await expect(page.locator("#echo-lens")).toBeHidden();

  await page.locator(`[data-answer="${LENS_QUESTION.answerId}"]`).click();
  const lens = page.locator("#echo-lens");
  await expect(page.locator("#challenge-dialog")).not.toBeVisible();
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("open", "");
  await expect(lens).toContainText(LENS_QUESTION.echoLens?.reasoning ?? "");
  await recordEvidenceScreenshot(page, testInfo, 3, "echo-lens-after-answer");
  await expect(lens.locator("[role='img']")).toHaveAttribute(
    "aria-label",
    /2 rows by 4 columns; 7 filled/
  );

  const snapshot = async () =>
    page.evaluate(() => ({
      score: document.querySelector("#player-score")?.textContent,
      moves: document.querySelector("#moves-value")?.textContent,
      vitality: document.querySelector("#vitality-count")?.textContent,
      echoes: document.querySelector("#echo-count")?.textContent,
      storage: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      )
    }));
  const beforeToggle = await snapshot();
  const summary = lens.getByText("Why this works", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(lens).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(lens).toHaveAttribute("open", "");
  expect(await snapshot()).toEqual(beforeToggle);
  const resumedTime = await page.locator("#time-value").textContent();
  await expect
    .poll(() => page.locator("#time-value").textContent(), {
      timeout: 2_500
    })
    .not.toBe(resumedTime);
  expect(JSON.stringify(beforeToggle.storage)).not.toMatch(
    /See two groups|Four and three combine|echoLens|answeredAt/i
  );
});

test("holds a wrong-answer Echo Lens for review before loading a fresh Question", async ({
  page
}) => {
  await page.route("**/api/question**", async (route) => {
    const ordinal = questionOrdinalOf(route.request());
    const question =
      ordinal === 0
        ? LENS_QUESTION
        : normalizeQuestion({
            ...TEST_QUESTION,
            id: `scout-foundation-${ordinal}`,
            prompt: `Fresh reviewed Question ${ordinal}: What is 4 + 3?`
          });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ question, source: "database" })
    });
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  const wrongAnswer = LENS_QUESTION.choices.find(
    (choice) => choice.id !== LENS_QUESTION.answerId
  );
  if (!wrongAnswer) {
    throw new Error("Reviewed fixture needs one wrong answer.");
  }
  await page.locator(`[data-answer="${wrongAnswer.id}"]`).click();

  const panel = page.locator("#challenge-lens-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(LENS_QUESTION.echoLens?.reasoning ?? "");
  await expect(page.locator("#vitality-count")).toHaveText("2 / 3");
  const beforeToggle = await page.evaluate(() => ({
    score: document.querySelector("#player-score")?.textContent,
    moves: document.querySelector("#moves-value")?.textContent,
    time: document.querySelector("#time-value")?.textContent,
    vitality: document.querySelector("#vitality-count")?.textContent,
    storage: Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    )
  }));
  const details = page.locator("#challenge-echo-lens");
  const summary = details.getByText("Why this works", { exact: true });
  await summary.press("Enter");
  await expect(details).not.toHaveAttribute("open", "");
  await summary.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  expect(
    await page.evaluate(() => ({
      score: document.querySelector("#player-score")?.textContent,
      moves: document.querySelector("#moves-value")?.textContent,
      time: document.querySelector("#time-value")?.textContent,
      vitality: document.querySelector("#vitality-count")?.textContent,
      storage: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      )
    }))
  ).toEqual(beforeToggle);

  await page.getByRole("button", { name: "Next question" }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator("#challenge-question")).toContainText(
    "Fresh reviewed Question 1"
  );
});

test("completes a fixed three-plus-two Lantern Trail outside the Run", async ({
  page
}, testInfo) => {
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
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
  // A suggested objective is only started directly when it can supply three
  // genuinely distinct required Lanterns; otherwise the Workshop opens its
  // catalog and the Explorer chooses a Trail that can.
  const suggestedObjectiveId = listLanternTrailObjectives({
    levelId: "trail-scout",
    difficultyBand: triggeringQuestion.difficultyBand
  }).some(
    (objective) =>
      objective.learningObjectiveId === triggeringQuestion.learningObjectiveId
  )
    ? triggeringQuestion.learningObjectiveId
    : listLanternTrailObjectives({
        levelId: "trail-scout",
        difficultyBand: triggeringQuestion.difficultyBand
      })[0].learningObjectiveId;
  const expectedTrail = createLanternTrail({
    levelId: "trail-scout",
    difficultyBand: triggeringQuestion.difficultyBand,
    learningObjectiveId: suggestedObjectiveId
  });
  const runBeforePractice = await page.evaluate(() => ({
    score: document.getElementById("player-score")?.textContent,
    vitality: document.getElementById("vitality-count")?.textContent,
    moves: document.getElementById("moves-value")?.textContent,
    stage: document.getElementById("quest-stage")?.textContent,
    time: document.getElementById("time-value")?.textContent,
    nonJournalStorage: Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => !key.startsWith("echo-maze:lantern-journal"))
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    )
  }));

  await practiceButton.click();
  const practice = page.getByRole("dialog", {
    name: "Lantern Trail Workshop"
  });
  await expect(practice).toBeVisible();
  if (suggestedObjectiveId !== triggeringQuestion.learningObjectiveId) {
    await practice
      .getByRole("button", { name: expectedTrail.objectiveLabel })
      .click();
  }
  await expect(page.locator("#practice-progress")).toContainText(
    "Lantern 1 of 3 required"
  );
  await expect(page.locator("#practice-question")).toHaveText(
    expectedTrail.questions[0].prompt
  );

  await practice.getByRole("button", { name: "Show Hint" }).click();
  await expect(page.locator("#practice-hint")).toContainText(
    expectedTrail.questions[0].hint
  );
  await expect(practice.getByRole("button", { name: "Show Hint" })).toBeDisabled();

  /**
   * @param {number} questionIndex
   * @param {"correct" | "wrong" | "skip"} outcome
   */
  const answer = async (questionIndex, outcome) => {
    const question = expectedTrail.questions[questionIndex];
    if (outcome === "skip") {
      await practice.getByRole("button", { name: "Skip Lantern" }).click();
      return;
    }
    const answerId =
      outcome === "correct"
        ? question.answerId
        : question.choices.find((choice) => choice.id !== question.answerId)?.id;
    const label = question.choices.find((choice) => choice.id === answerId)?.label;
    if (!label) throw new Error("Practice answer label was missing.");
    await practice.getByRole("button", { name: label, exact: true }).click();
  };

  await answer(0, "correct");
  await expect(page.locator("#practice-feedback")).toContainText("Nice work");
  /** @type {string[]} */
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await practice
    .getByRole("button", { name: "Next Lantern" })
    .evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected the Lantern Trail advance button.");
      }
      button.click();
      button.click();
    });
  await expect(page.locator("#practice-progress")).toContainText(
    "Lantern 2 of 3 required"
  );
  expect(pageErrors).toEqual([]);

  await answer(1, "wrong");
  await expect(page.locator("#practice-feedback")).toContainText("Good try");
  await practice.getByRole("button", { name: "Next Lantern" }).click();
  await expect(page.locator("#practice-progress")).toContainText(
    "Lantern 3 of 3 required"
  );

  await answer(2, "skip");
  await expect(page.locator("#practice-feedback")).toContainText(
    expectedTrail.questions[2].explanation
  );
  await expect(page.locator("#practice-feedback")).toContainText(
    "Required Trail complete"
  );
  await recordEvidenceScreenshot(
    page,
    testInfo,
    3,
    "workshop-required-boundary"
  );
  await practice.getByRole("button", { name: "Keep Practicing" }).click();
  await expect(page.locator("#practice-progress")).toContainText(
    "Extra Lantern 1 of 2"
  );

  await answer(3, "correct");
  await practice.getByRole("button", { name: "Keep Practicing" }).click();
  await expect(page.locator("#practice-progress")).toContainText(
    "Extra Lantern 2 of 2"
  );
  await recordEvidenceScreenshot(
    page,
    testInfo,
    3,
    "workshop-optional-boundary"
  );
  await answer(4, "correct");
  await practice.getByRole("button", { name: "Finish Trail" }).click();
  await expect(practice).toContainText("Lantern Trail complete");
  await practice
    .getByRole("button", { name: "Choose another Trail" })
    .click();
  await expect(page.locator("#practice-catalog")).toBeVisible();
  await expect(page.locator("#practice-question")).toHaveText("");
  await expect(page.locator("#practice-feedback")).toHaveText("");

  expect(
    await page.evaluate(() => ({
      score: document.getElementById("player-score")?.textContent,
      vitality: document.getElementById("vitality-count")?.textContent,
      moves: document.getElementById("moves-value")?.textContent,
      stage: document.getElementById("quest-stage")?.textContent,
      time: document.getElementById("time-value")?.textContent,
      nonJournalStorage: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => !key.startsWith("echo-maze:lantern-journal"))
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      )
    }))
  ).toEqual(runBeforePractice);

  await page.getByRole("button", { name: "Back to Journal" }).click();
  await expect(journal).toBeVisible();
  // The practiced objective no longer needs Practice. When the Workshop fell
  // back to its catalog, the originally suggested objective still does.
  await expect(
    journal.locator(
      `button.journal-practice[data-objective="${suggestedObjectiveId}"]:not([hidden])`
    )
  ).toHaveCount(0);
  if (suggestedObjectiveId === triggeringQuestion.learningObjectiveId) {
    await expect(journal.getByRole("button", { name: "Practice" })).toHaveCount(
      0
    );
  }
  await expect(journal).toContainText("Hints 1");

  const storedJournal = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.startsWith("echo-maze:lantern-journal")
    );
    return key ? localStorage.getItem(key) : null;
  });
  expect(typeof storedJournal).toBe("string");
  expect(storedJournal).not.toContain("\"prompt\"");
  expect(storedJournal).not.toContain("answerId");
  expect(storedJournal).not.toMatch(/answeredAt|timestamp|selectedOption/i);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes("lantern-trail"))
    )
  ).toBe(false);

  await page.getByRole("button", { name: "Clear Journal" }).click();
  await expect(page.locator("#journal-clear-warning")).toBeVisible();
  await page.getByRole("button", { name: "Clear now" }).click();
  await expect(journal).toContainText("Your lantern is ready.");
  await expect(page.getByRole("button", { name: "Clear Journal" })).toBeDisabled();
});

test("opens Workshop catalog and transfers paused play to Journal or Atlas", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  const workshopButton = page.getByRole("button", {
    name: "Workshop",
    exact: true
  });
  await workshopButton.click();

  const workshop = page.getByRole("dialog", {
    name: "Lantern Trail Workshop"
  });
  await expect(workshop).toBeVisible();
  await expect(page.locator("#practice-title")).toBeFocused();
  await expect(page.locator("#practice-catalog")).toBeVisible();
  // Only objectives with three genuinely distinct required Lanterns are
  // offered, so the catalog is smaller than the objective list and its size
  // depends on the Level and Band the Explorer is on.
  const offeredObjectives = page.locator("[data-practice-objective]");
  expect(await offeredObjectives.count()).toBeGreaterThan(0);
  await expect(page.locator(".practice-objective span").first()).toHaveCSS(
    "font-size",
    "16px"
  );
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "32px";
    await document.fonts.ready;
  });
  const dialogOverflow = await workshop.evaluate((dialog) => ({
    pixels: dialog.scrollWidth - dialog.clientWidth,
    sources: [...dialog.querySelectorAll("*")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          dialog.getBoundingClientRect().right + 1
      )
      .slice(0, 5)
      .map((element) => element.id || element.className || element.tagName)
  }));
  expect(
    dialogOverflow.pixels,
    `Workshop overflow sources: ${dialogOverflow.sources.join(", ")}`
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
  ).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("font-size");
  });

  // Whichever Trails this Level and Band can actually offer: the catalog is
  // filtered to objectives with three genuinely distinct required Lanterns.
  await offeredObjectives.first().click();
  await expect(page.locator("#practice-progress")).toContainText(
    "Lantern 1 of 3 required"
  );
  await expect(
    workshop.getByRole("button", { name: "Open Journal" })
  ).toBeHidden();
  await expect(
    workshop.getByRole("button", { name: "Open Atlas" })
  ).toBeHidden();
  const discardedQuestion = await page.locator("#practice-question").textContent();
  await workshop.getByRole("button", { name: "Skip Lantern" }).click();
  await workshop.getByRole("button", { name: "Return to Play" }).click();
  await expect(workshop).toBeHidden();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "false");
  await expect(workshopButton).toBeFocused();

  await workshopButton.click();
  await expect(page.locator("#practice-catalog")).toBeVisible();
  await expect(page.locator("#practice-trail")).toBeHidden();
  if (!discardedQuestion) {
    throw new Error("Expected a Lantern Trail Question before closing.");
  }
  await expect(workshop).not.toContainText(discardedQuestion);
  await expect(page.locator("#practice-question")).toHaveText("");
  await expect(page.locator("#practice-choices")).toBeEmpty();
  await expect(page.locator("#practice-hint")).toHaveText("");
  await expect(page.locator("#practice-feedback")).toHaveText("");
  await expect(page.locator("#practice-feedback")).not.toHaveAttribute(
    "data-state"
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes("lantern-trail"))
    )
  ).toBe(false);

  await workshop.getByRole("button", { name: "Open Journal" }).click();
  const journal = page.getByRole("dialog", {
    name: "What you have practiced"
  });
  await expect(journal).toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "true");
  await journal.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "false");

  await workshopButton.click();
  await workshop.getByRole("button", { name: "Open Atlas" }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "true");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  await atlas.getByRole("button", { name: "Open Workshop" }).click();
  await expect(workshop).toBeVisible();
  await workshop.getByRole("button", { name: "Back to Atlas" }).click();
  await expect(atlas).toBeVisible();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "true");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#pause-run")).toHaveAttribute("aria-pressed", "false");
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
  await expectGameReady(page);
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
    "Lantern Journal is temporarily unavailable. Reload to try again."
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

test("retries the Journal view after its first chunk request fails", async ({
  page
}) => {
  let requests = 0;
  await page.route("**/assets/lantern-journal-ui-*.js", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await expect.poll(() => requests).toBe(1);

  const journalButton = page.getByRole("button", {
    name: "Journal",
    exact: true
  });
  await journalButton.click();
  await expect.poll(() => requests).toBe(2);

  await expect(
    page.getByRole("dialog", { name: "What you have practiced" })
  ).toBeVisible();
  expect(requests).toBe(2);
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
  await expectGameReady(page);
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
  await expectGameReady(page);
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
  const escapedBoundary = await page.evaluate((seed) => {
    const records =
      /** @type {Array<{
       *   seed?: string,
       *   outcome?: string,
       *   labyrinthNumber?: number,
       *   replay?: unknown
       * }>} */ (JSON.parse(
        localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
      ));
    const progress = JSON.parse(
      localStorage.getItem("echo-maze:quest-progress:v1") ?? "null"
    );
    const matching = records.find(
      (record) =>
        record.seed === seed &&
        record.outcome === "escaped" &&
        record.labyrinthNumber === 1
    );
    return {
      recovery: localStorage.getItem(
        "echo-maze:active-run-recovery:v1"
      ),
      matchingRecords: records.filter(
        (record) =>
          record.seed === seed &&
          record.outcome === "escaped" &&
          record.labyrinthNumber === 1
      ).length,
      replay: matching?.replay ?? null,
      progress
    };
  }, WINNING_SEED);
  expect(escapedBoundary).toMatchObject({
    recovery: null,
    matchingRecords: 1,
    replay: {
      version: 1,
      terminal: {
        outcome: "escaped",
        echoesCollected: 3,
        echoTotal: 3
      }
    },
    progress: {
      labyrinthNumber: 2,
      completedLabyrinths: 1
    }
  });
  expect(JSON.stringify(escapedBoundary.replay)).not.toMatch(
    /answerId|choices|question|provider|account|email|runId/i
  );

  await page.reload();
  await expectGameReady(page);
  await expect(
    page.getByRole("dialog", { name: "Continue from the Campfire?" })
  ).not.toBeVisible();
  expect(
    await page.evaluate((seed) => {
      const records =
        /** @type {Array<{
         *   seed?: string,
         *   outcome?: string,
         *   labyrinthNumber?: number
         * }>} */ (JSON.parse(
          localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
        ));
      const progress = JSON.parse(
        localStorage.getItem("echo-maze:quest-progress:v1") ?? "null"
      );
      return {
        recovery: localStorage.getItem(
          "echo-maze:active-run-recovery:v1"
        ),
        matchingRecords: records.filter(
          (record) =>
            record.seed === seed &&
            record.outcome === "escaped" &&
            record.labyrinthNumber === 1
        ).length,
        labyrinthNumber: progress?.labyrinthNumber,
        completedLabyrinths: progress?.completedLabyrinths
      };
    }, WINNING_SEED)
  ).toEqual({
    recovery: null,
    matchingRecords: 1,
    labyrinthNumber: 2,
    completedLabyrinths: 1
  });

  if (await page.getByRole("button", { name: "Continue Quest" }).isVisible()) {
  await page.getByRole("button", { name: "Continue Quest" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#seed-value")).not.toHaveText(WINNING_SEED);
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 2 of 20 · Atlas Region: Foundation · Trail Twist: Echo Hush"
  );
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#echo-count")).toHaveText("0 / 3");

  await page.reload();
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 2 of 20 · Atlas Region: Foundation · Trail Twist: Echo Hush"
  );
  await expect(
    page.getByRole("dialog", { name: "Continue from the Campfire?" })
  ).not.toBeVisible();
  expect(
    await page.evaluate((seed) => {
      const records =
        /** @type {Array<{
         *   seed?: string,
         *   outcome?: string,
         *   labyrinthNumber?: number
         * }>} */ (JSON.parse(
          localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
        ));
      const progress = JSON.parse(
        localStorage.getItem("echo-maze:quest-progress:v1") ?? "null"
      );
      return {
        recovery: localStorage.getItem(
          "echo-maze:active-run-recovery:v1"
        ),
        matchingRecords: records.filter(
          (record) =>
            record.seed === seed &&
            record.outcome === "escaped" &&
            record.labyrinthNumber === 1
        ).length,
        labyrinthNumber: progress?.labyrinthNumber,
        completedLabyrinths: progress?.completedLabyrinths
      };
    }, WINNING_SEED)
  ).toEqual({
    recovery: null,
    matchingRecords: 1,
    labyrinthNumber: 2,
    completedLabyrinths: 1
  });

  await page.getByRole("button", { name: "Atlas", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "Echo Atlas" });
  await expect(atlas).toBeVisible();
  await atlas.locator("[data-atlas-landmark='foundation-1']").click();
  await expect(atlas.getByRole("button", { name: "Watch Trail" }))
    .toBeVisible();
  await atlas.getByRole("button", { name: "Watch Trail" }).click();
  const trail = page.getByRole("dialog", { name: "Watch Trail" });
  await expect(atlas).toBeVisible();
  await expect(trail).toBeVisible();
  await trail.getByRole("button", { name: "Close" }).click();
  await expect(trail).not.toBeVisible();
  await expect(atlas).toBeVisible();
  await expect(atlas.locator("[data-atlas-landmark='foundation-1']"))
    .toBeFocused();
  expect(new URL(page.url()).searchParams.get("atlas")).toBe("foundation-1");
  await atlas.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#run-state")).toHaveText("Exploring");

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records).toBeVisible();
  await expect(records).toContainText(WINNING_SEED);
  await page.getByRole("button", { name: `Play seed ${WINNING_SEED}` }).click();
  await expect(records).not.toBeVisible();
  await expect(page.locator("#seed-value")).toHaveText(WINNING_SEED);
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 1 of 20 · Atlas Region: Foundation · Classic Rules"
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
  await page.getByRole("button", { name: `Play seed ${WINNING_SEED}` }).click();
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
  /** @type {Array<string | null>} */
  const requestedChallengeKinds = [];
  /** @type {string[]} */
  const ceremonyRequests = [];
  let atlasChunkRequested = false;
  let releaseAtlasChunk = () => {};
  const atlasChunkGate = new Promise((resolve) => {
    releaseAtlasChunk = () => resolve(undefined);
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.includes("/assets/region-ceremony-")) {
      ceremonyRequests.push(pathname);
    }
  });
  await page.route("**/assets/quest-atlas-*.js", async (route) => {
    atlasChunkRequested = true;
    await atlasChunkGate;
    await route.continue();
  });
  await page.route("**/api/question**", async (route) => {
    requestedChallengeKinds.push(
      questionRequestOf(route.request()).challengeKind ?? null
    );
    await route.fulfill({
      contentType: "application/json",
      status: 503,
      body: JSON.stringify({ error: "forced fallback" })
    });
  });
  await page.goto(
    `/?seed=${seed}&level=trail-scout&labyrinth=4` +
    "&region=foundation&rules=echo-hush-v1"
  );
  expect(ceremonyRequests).toEqual([]);
  const { gateChallenges, questionOrdinal } =
    await completeMilestonePlan(page, seed, plan, {
      checkGateStaging: true
    });

  await expect.poll(() => atlasChunkRequested).toBe(true);
  await expect(page.locator("#run-state")).toHaveText("Escaped");
  await expect(page.getByRole("button", { name: "New Quest" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Atlas", exact: true })
  ).toBeDisabled();
  releaseAtlasChunk();

  expect(gateChallenges).toBe(1);
  expect(requestedChallengeKinds.filter(
    (kind) => kind === "gate-warden"
  )).toHaveLength(1);
  await expect(page.locator("#result-seed")).toHaveText(seed);
  await expect(
    page.getByRole("group", { name: "Echo Atlas progress" })
  ).toBeVisible();
  await expect(page.locator("#result-atlas")).toContainText("Atlas 4 / 20");
  await expect(page.locator("#result-atlas")).toContainText(
    "Foundation First Echo Sigil restored"
  );
  await expect(page.locator("#result-atlas")).toContainText(
    "Gate Warden milestone completed"
  );
  await expect(page.locator("#player-score")).toHaveText(
    String(plan.finalRun.score)
  );
  await expect(page.locator("#result-kicker")).toHaveText(
    "Mosslight Grove Sigil ceremony"
  );
  await expect.poll(() => ceremonyRequests.length).toBe(1);
  await expect(page.locator("#result-title")).toHaveText(
    "The First Echo Sigil returns."
  );
  await expect(page.locator("#result-summary")).toContainText(
    "No currency, inventory, or gameplay reward"
  );
  await expect(page.locator("#replay-run")).toHaveText(
    "Skip ceremony · Continue Quest"
  );
  await page.locator("#replay-run").click();
  await expect(page.locator("#result-kicker")).toHaveText("Demo complete");
  await expect(page.locator("#replay-run")).toHaveText(
    "Create account for three Runs"
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

test("keeps a saved terminal result usable when Atlas presentation fails", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One terminal presentation fallback is sufficient."
  );
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.route("**/assets/quest-atlas-*.js", (route) => route.abort());
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
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
    if (!wrongAnswer) {
      throw new Error("Reviewed fixture needs a wrong answer.");
    }
    await page.locator(`[data-answer="${wrongAnswer.id}"]`).click();
    if (attempt < 2) {
      await expect.poll(() => getCurrentQuestion().id).not.toBe(question.id);
    }
  }

  await expect(page.locator("#run-state")).toHaveText("Light lost");
  await expect(page.locator("#result-atlas")).toHaveText(
    "Atlas summary unavailable. Quest progress is saved."
  );
  await expect(page.locator("#result-seed")).toHaveText(DEFEAT_SEED);
  await expect.poll(() =>
    page.evaluate((seed) => {
      const stored = localStorage.getItem("echo-maze:run-records:v1");
      const records = /** @type {{ seed: string, outcome: string }[]} */ (
        stored ? JSON.parse(stored) : []
      );
      return records.find((record) => record.seed === seed) ?? null;
    }, DEFEAT_SEED)
  ).toMatchObject({
    seed: DEFEAT_SEED,
    outcome: "defeated"
  });
});

test("uses a compact result after the Region Sigil ceremony was seen", async ({
  page
}) => {
  const seed = "MILESTONE-4-REPEAT";
  const questId = "quest_region_repeat";
  const plan = milestoneWinningPlan(seed);
  await installSignedInQuestPlayer(page);
  await page.goto("/");
  await page.evaluate(({ activeQuestId }) => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        questId: activeQuestId,
        levelId: "trail-scout",
        labyrinthNumber: 4,
        completedLabyrinths: 3,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: false
      })
    );
    localStorage.setItem(
      "echo-maze:region-ceremonies:v1",
      JSON.stringify({
        version: 1,
        questId: activeQuestId,
        seenRegionIds: ["foundation"]
      })
    );
  }, { activeQuestId: questId });
  await page.route("**/api/question**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 503,
      body: JSON.stringify({ error: "forced fallback" })
    });
  });
  await page.goto(
    `/?seed=${seed}&level=trail-scout&labyrinth=4` +
    "&region=foundation&rules=echo-hush-v1"
  );

  await completeMilestonePlan(page, seed, plan);

  await expect(page.locator("#result-kicker")).toHaveText(
    "Mosslight Grove milestone"
  );
  await expect(page.locator("#result-title")).toHaveText(
    "The First Echo Sigil remains restored."
  );
  await expect(page.locator("#result-summary")).toContainText(
    "Compact result"
  );
  await expect(page.locator("#replay-run")).toHaveText("Continue Quest");
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

  const heading = await page.locator(".status-deck__heading").boundingBox();
  const syncStatus = await page.locator("#quest-sync-status").boundingBox();
  const metrics = await page.locator(".run-metrics").boundingBox();
  if (!heading || !syncStatus || !metrics) {
    throw new Error("Expected status layout at 200 percent text.");
  }
  expect(syncStatus.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  expect(metrics.y).toBeGreaterThanOrEqual(syncStatus.y + syncStatus.height);
});

test("recovers the last movement and Pulse checkpoint behind an explicit Campfire choice", async ({
  page
}) => {
  await page.goto("/?seed=CAMPFIRE-17&level=trail-scout");
  await expectGameReady(page);
  await page.waitForTimeout(1100);
  await page.getByLabel(/Interactive maze/).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("q");

  await expect(page.locator("#moves-value")).toHaveText("002");
  await expect(page.locator("#pulse-count")).toHaveText("1");
  const checkpoint = await page.evaluate(() => {
    const serialized = localStorage.getItem(
      "echo-maze:active-run-recovery:v1"
    );
    return serialized ? JSON.parse(serialized).checkpoint : null;
  });
  expect(checkpoint).toMatchObject({
    moves: 2,
    pulses: 1,
    status: "active"
  });
  const checkpointTime = await page.locator("#time-value").textContent();

  await page.reload();
  await expectGameReady(page);
  const campfire = page.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await expect(
    campfire.getByRole("heading", {
      name: "Continue from the Campfire?"
    })
  ).toBeFocused();
  await expect(campfire).toContainText("Same-device recovery");
  await expect(campfire).toContainText("2 moves");
  await expect(page.locator("#run-state")).toHaveText("Paused");
  await expect(page.locator("#moves-value")).toHaveText("002");
  await expect(page.locator("#pulse-count")).toHaveText("1");
  await expect(page.locator("#time-value")).toHaveText(
    checkpointTime ?? "00:01"
  );
  await page.waitForTimeout(1100);
  await expect(page.locator("#time-value")).toHaveText(
    checkpointTime ?? "00:01"
  );

  await campfire
    .getByRole("button", { name: "Continue Run" })
    .click();
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await expect(page.getByLabel(/Interactive maze/)).toBeFocused();
  await expect
    .poll(() => page.locator("#time-value").textContent())
    .not.toBe(checkpointTime);

  await page.reload();
  await expectGameReady(page);
  await expect(campfire).toBeVisible();
  await campfire.getByRole("button", { name: "Restart Run" }).click();
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#run-state")).toHaveText("Exploring");
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#pulse-count")).toHaveText("2");
  await expect(page.locator("#seed-value")).toHaveText("CAMPFIRE-17");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toBeNull();

  await page.getByLabel(/Interactive maze/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#moves-value")).toHaveText("001");
  await page.evaluate(() => {
    localStorage.setItem(
      "echo-maze:active-run-recovery:v1",
      JSON.stringify({ version: 999 })
    );
  });
  await page.reload();
  await expectGameReady(page);
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#event-ribbon")).toContainText(
    "Campfire Resume is unavailable"
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:active-run-recovery:v1")
    )
  ).toBeNull();
});

test("continues current-tab play when recovery storage writes are denied", async ({
  page
}) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithDeniedRecovery(
      key,
      value
    ) {
      if (key === "echo-maze:active-run-recovery:v1") {
        throw new DOMException(
          "Recovery storage is denied.",
          "SecurityError"
        );
      }
      return setItem.call(this, key, value);
    };
  });

  await page.goto("/?seed=CAMPFIRE-17&level=trail-scout");
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#moves-value")).toHaveText("001");
  await expect(page.locator("#event-ribbon")).toContainText(
    "Campfire Resume is unavailable"
  );
});

test("scrubs a checkpoint when Campfire deletion is denied", async ({
  page
}) => {
  await page.goto("/?seed=CAMPFIRE-DELETE&level=trail-scout");
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#moves-value")).toHaveText("001");
  const oldIdentity = await page.evaluate(() => {
    const locator = JSON.parse(
      localStorage.getItem("echo-maze:active-run:v1") ?? "{}"
    );
    const recovery = JSON.parse(
      localStorage.getItem(
        "echo-maze:active-run-recovery:v1"
      ) ?? "{}"
    );
    return {
      locatorRunId: locator.runId,
      recoveryRunId: recovery.identity?.runId
    };
  });
  expect(oldIdentity.locatorRunId).toBe(oldIdentity.recoveryRunId);

  await page.reload();
  await expectGameReady(page);
  const campfire = page.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await page.evaluate(() => {
    const removeItem = Storage.prototype.removeItem;
    let deniedRecoveryRemovals = 2;
    Storage.prototype.removeItem =
      function removeItemWithDeniedRecovery(key) {
        if (
          key === "echo-maze:active-run-recovery:v1" &&
          deniedRecoveryRemovals > 0
        ) {
          deniedRecoveryRemovals -= 1;
          throw new DOMException(
            "Recovery deletion is denied.",
            "SecurityError"
          );
        }
        return removeItem.call(this, key);
      };
  });

  await campfire
    .getByRole("button", { name: "Restart Run" })
    .click();
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(page.locator("#event-ribbon")).not.toContainText(
    "Campfire Resume is unavailable"
  );
  const replacement = await page.evaluate(() => {
    const locator = JSON.parse(
      localStorage.getItem("echo-maze:active-run:v1") ?? "{}"
    );
    const recovery = localStorage.getItem(
      "echo-maze:active-run-recovery:v1"
    );
    return {
      locatorRunId: locator.runId,
      recovery
    };
  });
  expect(replacement.locatorRunId).not.toBe(
    oldIdentity.locatorRunId
  );
  expect(replacement.recovery).toBe("");
  expect(replacement.recovery).not.toContain(
    oldIdentity.recoveryRunId
  );

  await page.reload();
  await expectGameReady(page);
  await expect(campfire).not.toBeVisible();
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toBeNull();
});

test("waits for Campfire Continue before resolving a loading Challenge", async ({
  page
}) => {
  const questionRoute = "**/api/question**";
  let initialRequestCount = 0;
  let continuedRequestCount = 0;
  let releaseInitialQuestion = () => {};
  let settleInitialQuestion = () => {};
  const initialQuestionReleased = /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      releaseInitialQuestion = resolve;
    })
  );
  const initialQuestionSettled = /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      settleInitialQuestion = resolve;
    })
  );
  await page.route(questionRoute, async (route) => {
    initialRequestCount += 1;
    await initialQuestionReleased;
    try {
      await route.abort();
    } catch {
      // Closing the original page abandons this resolver.
    } finally {
      settleInitialQuestion();
    }
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  await expect(page.locator("#challenge-question")).toHaveText(
    /Preparing your question/
  );
  await expect.poll(() => initialRequestCount).toBe(1);
  const savedLoadingState = await page.evaluate(() => ({
    recovery: localStorage.getItem(
      "echo-maze:active-run-recovery:v1"
    ),
    quest: localStorage.getItem("echo-maze:quest-progress:v1")
  }));
  if (!savedLoadingState.recovery) {
    throw new Error("Expected a valid loading Challenge checkpoint.");
  }

  const context = page.context();
  const closePage = page.close();
  releaseInitialQuestion();
  await initialQuestionSettled;
  await closePage;
  const recoveredPage = await context.newPage();
  await recoveredPage.addInitScript(
    ({ recovery, quest }) => {
      if (recovery !== null) {
        localStorage.setItem(
          "echo-maze:active-run-recovery:v1",
          recovery
        );
      }
      if (quest === null) {
        localStorage.removeItem("echo-maze:quest-progress:v1");
      } else {
        localStorage.setItem("echo-maze:quest-progress:v1", quest);
      }
    },
    savedLoadingState
  );
  await recoveredPage.route(questionRoute, async (route) => {
    continuedRequestCount += 1;
    const ordinal = questionOrdinalOf(route.request());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: reviewedQuestionForRequest(ordinal),
        source: "bundled"
      })
    });
  });
  await recoveredPage.goto(
    `/?seed=${DEFEAT_SEED}&level=trail-scout`
  );
  await expectGameReady(recoveredPage);
  const campfire = recoveredPage.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await expect(
    recoveredPage.locator("#challenge-dialog")
  ).not.toBeVisible();
  expect(continuedRequestCount).toBe(0);
  await campfire
    .getByRole("button", { name: "Continue Run" })
    .click();

  await expect(
    recoveredPage.locator("#challenge-dialog")
  ).toBeVisible();
  await expect.poll(() => continuedRequestCount).toBe(1);
  await expect(
    recoveredPage.locator("#challenge-question")
  ).toHaveText(reviewedQuestionForRequest(0).prompt);
});

test("restores wrong-answer feedback and replacement loading without duplicate learning writes", async ({
  page
}) => {
  const questionRoute = "**/api/question**";
  let initialRequestCount = 0;
  let continuedRequestCount = 0;
  let releaseReplacement = () => {};
  let settleReplacement = () => {};
  const replacementReleased = /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      releaseReplacement = resolve;
    })
  );
  const replacementSettled = /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      settleReplacement = resolve;
    })
  );
  const firstQuestion = reviewedQuestionForRequest(0);
  await page.route(questionRoute, async (route) => {
    initialRequestCount += 1;
    const ordinal = questionOrdinalOf(route.request());
    if (initialRequestCount === 2) {
      await replacementReleased;
      try {
        await route.abort();
      } catch {
        // Closing the original page abandons this resolver.
      } finally {
        settleReplacement();
      }
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: reviewedQuestionForRequest(ordinal),
        source: "bundled"
      })
    });
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-question")).toHaveText(
    firstQuestion.prompt
  );
  const wrongChoice = firstQuestion.choices.find(
    (choice) => choice.id !== firstQuestion.answerId
  );
  if (!wrongChoice) {
    throw new Error("Expected a reviewed wrong answer.");
  }
  await page
    .locator(`[data-answer="${wrongChoice.id}"]`)
    .click();
  await expect(page.locator("#challenge-feedback")).toContainText(
    firstQuestion.explanation
  );
  await expect(page.locator("#vitality-count")).toHaveText("2 / 3");
  await expect.poll(() => initialRequestCount).toBe(2);
  await expect(page.locator("#challenge-question")).toHaveText(
    /draws a new question/
  );
  const savedLoadingState = await page.evaluate(() => ({
    recovery: localStorage.getItem(
      "echo-maze:active-run-recovery:v1"
    ),
    quest: localStorage.getItem("echo-maze:quest-progress:v1")
  }));
  if (!savedLoadingState.recovery) {
    throw new Error("Expected a valid replacement-loading checkpoint.");
  }
  expect(savedLoadingState.recovery).not.toContain(`"answerId"`);
  expect(savedLoadingState.recovery).not.toContain(
    firstQuestion.prompt
  );
  const productStateBeforeReload = await page.evaluate(() => ({
    quest: (() => {
      const stored = localStorage.getItem(
        "echo-maze:quest-progress:v1"
      );
      if (!stored) {
        return null;
      }
      const progress = JSON.parse(stored);
      delete progress.usedQuestionIds;
      delete progress.nextQuestionOrdinal;
      return progress;
    })(),
    records: localStorage.getItem("echo-maze:run-records:v1"),
    journal: Object.keys(localStorage)
      .filter((key) => key.startsWith("echo-maze:lantern-journal"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])
  }));

  const context = page.context();
  const closePage = page.close();
  releaseReplacement();
  await replacementSettled;
  await closePage;
  const recoveredPage = await context.newPage();
  await recoveredPage.addInitScript(
    ({ recovery, quest }) => {
      if (recovery !== null) {
        localStorage.setItem(
          "echo-maze:active-run-recovery:v1",
          recovery
        );
      }
      if (quest === null) {
        localStorage.removeItem("echo-maze:quest-progress:v1");
      } else {
        localStorage.setItem("echo-maze:quest-progress:v1", quest);
      }
    },
    savedLoadingState
  );
  await recoveredPage.route(questionRoute, async (route) => {
    continuedRequestCount += 1;
    const ordinal = questionOrdinalOf(route.request());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: reviewedQuestionForRequest(ordinal),
        source: "bundled"
      })
    });
  });
  await recoveredPage.goto(
    `/?seed=${DEFEAT_SEED}&level=trail-scout`
  );
  await expectGameReady(recoveredPage);
  const campfire = recoveredPage.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await expect(
    recoveredPage.locator("#challenge-dialog")
  ).not.toBeVisible();
  expect(continuedRequestCount).toBe(0);
  await campfire
    .getByRole("button", { name: "Continue Run" })
    .click();

  await expect(
    recoveredPage.locator("#challenge-dialog")
  ).toBeVisible();
  await expect(
    recoveredPage.locator("#challenge-feedback")
  ).toContainText(firstQuestion.explanation);
  await expect(
    recoveredPage.locator("#vitality-count")
  ).toHaveText("2 / 3");
  await expect.poll(() => continuedRequestCount).toBe(1);
  await expect(
    recoveredPage.locator("#challenge-question")
  ).toHaveText(reviewedQuestionForRequest(1).prompt);
  expect(
    await recoveredPage.evaluate(() => ({
      quest: (() => {
        const stored = localStorage.getItem(
          "echo-maze:quest-progress:v1"
        );
        if (!stored) {
          return null;
        }
        const progress = JSON.parse(stored);
        delete progress.usedQuestionIds;
        delete progress.nextQuestionOrdinal;
        return progress;
      })(),
      records: localStorage.getItem("echo-maze:run-records:v1"),
      journal: Object.keys(localStorage)
        .filter((key) => key.startsWith("echo-maze:lantern-journal"))
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    }))
  ).toEqual(productStateBeforeReload);
});

test("recovers the exact reviewed Question revision and revealed Hint without another provider call", async ({
  page
}) => {
  let requestCount = 0;
  let servedQuestion =
    /** @type {ReturnType<typeof getBundledQuestion> | null} */ (null);
  await page.route("**/api/question**", async (route) => {
    requestCount += 1;
    const ordinal = questionOrdinalOf(route.request());
    const reviewedQuestion = reviewedQuestionForRequest(ordinal);
    servedQuestion = normalizeQuestion({
      ...reviewedQuestion,
      prompt: `  ${reviewedQuestion.prompt}  `,
      choices: reviewedQuestion.choices.map((choice) => ({
        ...choice,
        label: ` ${choice.label} `
      })),
      providerDebug: "must-not-persist",
      userAuthoredText: "must-not-persist"
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: {
          ...reviewedQuestion,
          prompt: `  ${reviewedQuestion.prompt}  `,
          choices: reviewedQuestion.choices.map((choice) => ({
            ...choice,
            label: ` ${choice.label} `
          })),
          providerDebug: "must-not-persist",
          userAuthoredText: "must-not-persist"
        },
        source: "bundled"
      })
    });
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  if (!servedQuestion) {
    throw new Error("Expected a reviewed Question from the provider fixture.");
  }
  const expectedQuestion = servedQuestion;
  await expect(page.locator("#challenge-question")).toHaveText(
    expectedQuestion.prompt
  );
  expect(
    await page.locator("#challenge-question").textContent()
  ).toBe(expectedQuestion.prompt);
  await page.getByRole("button", { name: "Show Hint" }).click();
  await expect(page.locator("#question-hint")).toHaveText(
    expectedQuestion.hint
  );
  expect(requestCount).toBe(1);
  const productStateBeforeReload = await page.evaluate(() => ({
    quest: localStorage.getItem("echo-maze:quest-progress:v1"),
    records: localStorage.getItem("echo-maze:run-records:v1"),
    journal: Object.keys(localStorage)
      .filter((key) => key.startsWith("echo-maze:lantern-journal"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])
  }));

  await page.reload();
  await expectGameReady(page);
  const campfire = page.getByRole("dialog", {
    name: "Continue from the Campfire?"
  });
  await expect(campfire).toBeVisible();
  await expect(page.locator("#challenge-dialog")).not.toBeVisible();
  await campfire
    .getByRole("button", { name: "Continue Run" })
    .click();

  await expect(page.locator("#challenge-dialog")).toBeVisible();
  await expect(page.locator("#challenge-question")).toHaveText(
    expectedQuestion.prompt
  );
  await expect(page.locator("#question-hint")).toHaveText(
    expectedQuestion.hint
  );
  await expect(
    page.getByRole("button", { name: "Hide Hint" })
  ).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(200);
  expect(requestCount).toBe(1);
  expect(
    await page.evaluate(() => ({
      quest: localStorage.getItem("echo-maze:quest-progress:v1"),
      records: localStorage.getItem("echo-maze:run-records:v1"),
      journal: Object.keys(localStorage)
        .filter((key) => key.startsWith("echo-maze:lantern-journal"))
        .sort()
        .map((key) => [key, localStorage.getItem(key)])
    }))
  ).toEqual(productStateBeforeReload);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:active-run-recovery:v1")
    )
  ).toContain(expectedQuestion.prompt);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:active-run-recovery:v1")
    )
  ).not.toMatch(/providerDebug|userAuthoredText|must-not-persist/);
});

test("erases temporary Challenge history when the signed-in identity ends", async ({
  page
}) => {
  await installSignedInQuestPlayer(page);
  await page.addInitScript(() => {
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: 100,
      moves: 1,
      seed: "SIGNED-TRAIL",
      outcome: "defeated",
      echoesCollected: 0,
      echoTotal: 3,
      questLevelId: "trail-scout",
      labyrinthNumber: 1,
      atlasRegionId: "foundation",
      rulesetRevision: "classic-v1",
      replayOwnerId: "user_recovery_privacy",
      replay: {
        version: 1,
        actions: [{ type: "move", direction: "right", elapsedMs: 100 }],
        terminal: {
          outcome: "defeated",
          moves: 1,
          elapsedMs: 100,
          echoesCollected: 0,
          echoTotal: 3,
          wardensDefeated: 0,
          score: 0,
          vitality: 0
        }
      }
    }]));
  });
  const question = reviewedQuestionForRequest(0);
  await page.route("**/api/question**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question,
        source: "bundled"
      })
    })
  );
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await expect(page.locator("#player-name")).toHaveText("Moss Runner");
  await expect.poll(() =>
    page.evaluate(() => {
      const records = JSON.parse(
        localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
      );
      return records[0]?.replayOwnerId ?? null;
    })
  ).toBe("user_recovery_privacy");
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  await expect(page.locator("#challenge-question")).toHaveText(
    question.prompt
  );
  const wrongChoice = question.choices.find(
    (choice) => choice.id !== question.answerId
  );
  if (!wrongChoice) {
    throw new Error("Expected a reviewed wrong answer.");
  }
  await page
    .locator(`[data-answer="${wrongChoice.id}"]`)
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toContain(wrongChoice.id);

  await page.evaluate(() => {
    const signOut = document.getElementById("player-sign-out");
    if (!(signOut instanceof HTMLButtonElement)) {
      throw new Error("Expected the signed-in Player control.");
    }
    signOut.click();
  });

  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toBeNull();
  await expect.poll(() =>
    page.evaluate(() => {
      const records = JSON.parse(
        localStorage.getItem("echo-maze:run-records:v1") ?? "[]"
      );
      return {
        seed: records[0]?.seed,
        replay: records[0]?.replay ?? null
      };
    })
  ).toEqual({ seed: "SIGNED-TRAIL", replay: null });
  await expect(page.locator("#challenge-dialog")).toBeVisible();
  await expect(page.locator("#vitality-count")).toHaveText("2 / 3");
});

test("keeps a previous owner's Trail hidden when identity scrub writes fail", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The storage-denial identity boundary is viewport-independent."
  );
  await installSignedInQuestPlayer(page);
  await page.addInitScript(() => {
    localStorage.setItem("echo-maze:run-records:v1", JSON.stringify([{
      elapsedMs: 100,
      moves: 1,
      seed: "ALICE-PRIVATE-TRAIL",
      outcome: "defeated",
      echoesCollected: 0,
      echoTotal: 3,
      questLevelId: "trail-scout",
      labyrinthNumber: 1,
      atlasRegionId: "foundation",
      rulesetRevision: "classic-v1",
      replayOwnerId: "user_alice",
      replay: {
        version: 1,
        actions: [{ type: "move", direction: "right", elapsedMs: 100 }],
        terminal: {
          outcome: "defeated",
          moves: 1,
          elapsedMs: 100,
          echoesCollected: 0,
          echoTotal: 3,
          wardensDefeated: 0,
          score: 0,
          vitality: 0
        }
      }
    }]));
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function denyRunRecordWrites(key, value) {
      if (key === "echo-maze:run-records:v1") {
        throw new DOMException("Run Record storage is denied.", "SecurityError");
      }
      return setItem.call(this, key, value);
    };
  });
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await expect(page.locator("#player-name")).toHaveText("Moss Runner");
  await page.evaluate(() => {
    const signOut = document.getElementById("player-sign-out");
    if (!(signOut instanceof HTMLButtonElement)) {
      throw new Error("Expected the signed-in Player control.");
    }
    signOut.click();
  });
  await expect(page.locator("#live-region")).toContainText(
    "could not erase account-context Run Replay details"
  );

  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const question = getCurrentQuestion();
    const wrongChoice = question.choices.find(
      (choice) => choice.id !== question.answerId
    );
    if (!wrongChoice) {
      throw new Error("Expected a reviewed wrong answer.");
    }
    await page.locator(`[data-answer="${wrongChoice.id}"]`).click();
    if (attempt < 2) {
      await expect.poll(() => getCurrentQuestion().id).not.toBe(question.id);
    }
  }
  await expect(page.locator("#run-state")).toHaveText("Light lost");
  const demoGate = page.getByRole("dialog", {
    name: "Create an account for three free Runs."
  });
  await expect(demoGate).toBeVisible();
  await demoGate.getByRole("button", {
    name: "Create account for three Runs"
  }).click();
  await expect(demoGate).not.toBeVisible();

  await page.getByRole("button", { name: "Records", exact: true }).click();
  const records = page.getByRole("dialog", { name: "Run Records" });
  await expect(records.getByRole("button", {
    name: "Play seed ALICE-PRIVATE-TRAIL"
  })).toBeVisible();
  await expect(records.getByRole("button", {
    name: "Watch retained Trail for seed ALICE-PRIVATE-TRAIL"
  })).toHaveCount(0);
});

test("keeps Challenge history erased after terminal defeat and reload", async ({
  page
}) => {
  const getCurrentQuestion = await mockQuestionApi(page);
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await page.getByLabel(/Interactive maze/).focus();
  for (const direction of DEFEAT_PATH) {
    await page.keyboard.press(KEY_BY_DIRECTION[direction]);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const question = getCurrentQuestion();
    const wrongChoice = question.choices.find(
      (choice) => choice.id !== question.answerId
    );
    if (!wrongChoice) {
      throw new Error("Expected a reviewed wrong answer.");
    }
    await page
      .locator(`[data-answer="${wrongChoice.id}"]`)
      .click();
    if (attempt < 2) {
      await expect
        .poll(() => getCurrentQuestion().id)
        .not.toBe(question.id);
    }
  }

  await expect(page.locator("#run-state")).toHaveText("Light lost");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("echo-maze:active-run-recovery:v1")
      )
    )
    .toBeNull();
  const recordsBeforeReload = await page.evaluate(() =>
    localStorage.getItem("echo-maze:run-records:v1")
  );
  const defeatedReplay = JSON.parse(recordsBeforeReload ?? "[]")[0]?.replay;
  expect(defeatedReplay).toMatchObject({
    version: 1,
    terminal: {
      outcome: "defeated",
      vitality: 0
    }
  });
  expect(JSON.stringify(defeatedReplay)).not.toMatch(
    /answerId|choices|question|provider|account|email|runId/i
  );

  await page.reload();
  await expectGameReady(page);
  await expect(
    page.getByRole("dialog", {
      name: "Continue from the Campfire?"
    })
  ).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:run-records:v1")
    )
  ).toBe(recordsBeforeReload);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("echo-maze:active-run-recovery:v1")
    )
  ).toBeNull();
});

test("upgrades a locator-only device without changing its Labyrinth", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 1,
        completedLabyrinths: 0,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: false
      })
    );
    localStorage.setItem(
      "echo-maze:active-run:v1",
      JSON.stringify({
        version: 1,
        seed: "LEGACY-CAMPFIRE",
        levelId: "trail-scout",
        labyrinthNumber: 1
      })
    );
    localStorage.removeItem("echo-maze:active-run-recovery:v1");
  });

  await page.goto("/play");
  await expectGameReady(page);
  await expect(page.locator("#seed-value")).toHaveText("LEGACY-CAMPFIRE");
  await expect(page.locator("#moves-value")).toHaveText("000");
  await expect(
    page.getByRole("dialog", { name: "Continue from the Campfire?" })
  ).not.toBeVisible();
  const locator = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("echo-maze:active-run:v1") ?? "null")
  );
  expect(locator).toMatchObject({
    version: 3,
    pending: false,
    seed: "LEGACY-CAMPFIRE",
    levelId: "trail-scout",
    labyrinthNumber: 1,
    atlasRegionId: "foundation",
    rulesetRevision: "classic-v1"
  });
});

test("upgrades a version 2 locator to Classic Rules", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:quest-progress:v1",
      JSON.stringify({
        version: 1,
        levelId: "trail-scout",
        labyrinthNumber: 1,
        completedLabyrinths: 0,
        usedMapFingerprints: [],
        usedQuestionIds: [],
        nextQuestionOrdinal: 0,
        complete: false
      })
    );
    localStorage.setItem(
      "echo-maze:active-run:v1",
      JSON.stringify({
        version: 2,
        runId: "legacy_locator_v2",
        pending: false,
        seed: "LEGACY-CAMPFIRE",
        levelId: "trail-scout",
        labyrinthNumber: 1
      })
    );
    localStorage.removeItem("echo-maze:active-run-recovery:v1");
  });

  await page.goto("/play");
  await expectGameReady(page);
  await expect(page.locator("#seed-value")).toHaveText("LEGACY-CAMPFIRE");
  await expect(page.locator("#quest-stage")).toHaveText(
    "Labyrinth 1 of 20 · Atlas Region: Foundation · Classic Rules"
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("echo-maze:active-run:v1") ?? "null")
    )
  ).toMatchObject({
    version: 3,
    runId: "legacy_locator_v2",
    pending: false,
    atlasRegionId: "foundation",
    rulesetRevision: "classic-v1"
  });
});


test("plays nonvisually with Trail Compass and reveals no hidden state", async ({
  page
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "echo-maze:explorer-access-settings:v1",
      JSON.stringify({
        version: 2,
        highContrast: false,
        largeMarks: false,
        readerFriendlyQuestions: false,
        reducedEffects: false,
        trailCompassEnabled: true,
        narrationPace: "standard"
      })
    );
  });
  await page.goto(`/?seed=${WINNING_SEED}&level=trail-scout`);
  await expectGameReady(page);
  await expect(page.locator("#trail-compass")).toBeVisible();

  await page.locator("#compass-describe").click();
  const live = page.locator("#live-region");
  await expect(live).toContainText(/row \d+, column \d+/);
  const described = String(await live.textContent());
  // At the DAYLIGHT-0 start the Gate and every Echo sit in Fog: the engine
  // confirms nothing beyond the reveal radius, so the Compass must not
  // speak of them.
  expect(described).not.toMatch(/The Gate is/);
  expect(described).not.toMatch(/An Echo shimmers/);

  // Desktop hides the touch pad; document-level keyboard input is the
  // equally nonvisual path and never needs Canvas focus. Leave the Describe
  // button first — arrows are ignored while a native control has focus.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
  await page.keyboard.press(KEY_BY_DIRECTION[WINNING_PATH[0]]);
  await expect(live).toContainText("At row");

  await page.locator("#compass-listen").click();
  await expect(live).toContainText(/Listen: |Nothing revealed/);
  await recordEvidenceScreenshot(page, testInfo, 4, "trail-compass");
});

test("keeps Read Aloud honest without a local voice and shows the six-field settings", async ({
  page
}, testInfo) => {
  await page.addInitScript(() => {
    const emptySynthesis = {
      getVoices: () => [],
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      addEventListener: () => {}
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      get: () => emptySynthesis
    });
  });
  await page.goto(`/?seed=${DEFEAT_SEED}&level=trail-scout`);
  await expectGameReady(page);

  await page.getByRole("button", { name: "Workshop", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Lantern Trail Workshop" })
  ).toBeVisible();
  await page.locator("#practice-objectives button").first().click();
  const read = page.locator(".practice-support [data-narration='read']");
  await expect(read).toBeVisible();
  await expect(read).toBeDisabled();
  await expect(
    page.locator(".practice-support .narration-status")
  ).toContainText("voice stored on this device");
  await recordEvidenceScreenshot(page, testInfo, 4, "read-aloud-unavailable");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Explorer Access Settings" })
  ).toBeVisible();
  await expect(page.locator("#access-trail-compass")).toBeVisible();
  await expect(page.locator("#access-narration-pace")).toBeVisible();
  await recordEvidenceScreenshot(
    page,
    testInfo,
    4,
    "access-settings-six-fields"
  );
});

/**
 * Seeds this device's Daily record for today so the post-escape Constellation
 * is reachable. The seed is derived here, in Node, from the same contract the
 * page uses: the built e2e bundle serves no module graph to import from.
 *
 * @param {import("@playwright/test").Page} page
 * @param {boolean} escaped
 */
async function seedDailyEscape(page, escaped) {
  const daily = createDailyContract(utcDateKey());
  await page.addInitScript(
    ({ record }) => {
      localStorage.setItem(
        "echo-maze:daily-records:v1",
        JSON.stringify([record])
      );
    },
    {
      record: {
        version: 1,
        date: daily.date,
        seed: daily.seed,
        completed: escaped,
        bestElapsedMs: escaped ? 91000 : null,
        bestMoves: escaped ? 76 : null
      }
    }
  );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {boolean} [published]
 */
async function stubConstellation(page, published = true) {
  await page.route("**/api/daily/constellation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: utcDateKey(),
        published,
        markers: published
          ? [
              { kind: "cell", x: 1, y: 1, band: "bright" },
              { kind: "passage", x: 2, y: 1, band: "bright" },
              { kind: "cell", x: 3, y: 1, band: "glowing" },
              { kind: "passage", x: 3, y: 2, band: "glowing" },
              { kind: "cell", x: 3, y: 3, band: "quiet" },
              { kind: "pulse", x: 3, y: 3, band: "quiet" }
            ]
          : []
      })
    });
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").TestInfo} testInfo
 * @param {string} name
 */
async function recordConstellationScreenshot(page, testInfo, name) {
  // The Constellation sits below the Verified Daily Board, so the evidence
  // shot has to scroll to it rather than capture the dialog's first fold.
  await page.locator("#daily-constellation").scrollIntoViewIfNeeded();
  const body = await page.screenshot();
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    body,
    contentType: "image/png"
  });
  if (process.env.RECORD_MILESTONE_5_SCREENSHOTS === "true") {
    await writeFile(
      resolve(
        "docs",
        "playtests",
        "screenshots",
        `milestone-5-${name}-${testInfo.project.name}.png`
      ),
      body
    );
  }
}

/** @param {import("@playwright/test").Page} page */
async function openDailyDialog(page) {
  await page.goto("/play");
  await expectGameReady(page);
  await chooseTrailScout(page);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
}

test("shows the Constellation only after a Daily escape", async ({ page }) => {
  await seedDailyEscape(page, false);
  await stubConstellation(page);

  await openDailyDialog(page);

  await expect(page.locator("#daily-constellation")).toBeHidden();
});

test("renders the Constellation in density bands after an escape", async ({
  page
}, testInfo) => {
  await seedDailyEscape(page, true);
  await stubConstellation(page);

  await openDailyDialog(page);

  const constellation = page.locator("#daily-constellation");
  await expect(constellation).toBeVisible();
  await expect(page.locator("#daily-constellation-status")).toHaveText(
    "Today’s shared paths are showing."
  );
  await expect(page.locator("#daily-constellation-map")).toBeVisible();
  await expect(
    page.locator("#daily-constellation-map .daily-constellation__tile")
  ).toHaveCount(6);
  // Nothing countable reaches the surface: no digit, share, or identity.
  const readable = await constellation.innerText();
  expect(readable).not.toMatch(/\d/);
  expect(readable).not.toMatch(/%|contributor|Explorer/i);

  await recordConstellationScreenshot(page, testInfo, "daily-constellation");
});

test("says the Constellation is still forming below its threshold", async ({
  page
}, testInfo) => {
  await seedDailyEscape(page, true);
  await stubConstellation(page, false);

  await openDailyDialog(page);

  await expect(page.locator("#daily-constellation-status")).toHaveText(
    "Paths are still forming."
  );
  await expect(page.locator("#daily-constellation-map")).toBeHidden();

  await recordConstellationScreenshot(
    page,
    testInfo,
    "daily-constellation-forming"
  );
});

test("keeps the Constellation readable at the mobile fold and 200 percent text", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The viewport is set explicitly, so one project proves it."
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDailyEscape(page, true);
  await stubConstellation(page);

  await openDailyDialog(page);

  const constellation = page.locator("#daily-constellation");
  await constellation.scrollIntoViewIfNeeded();
  await expect(page.locator("#daily-constellation-map")).toBeVisible();
  const map = await page.locator("#daily-constellation-map").boundingBox();
  if (!map) {
    throw new Error("Expected a rendered Constellation map.");
  }
  expect(map.width).toBeLessThanOrEqual(390);

  // The retry control is the section's only interactive element, so keyboard
  // reachability is proved against it rather than against the map.
  await page.evaluate(() => {
    const retry = document.getElementById("daily-constellation-retry");
    if (retry) {
      retry.hidden = false;
    }
    document.documentElement.style.fontSize = "200%";
  });
  const retry = page.getByRole("button", { name: "Retry Constellation" });
  await retry.focus();
  await expect(retry).toBeFocused();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("#daily-constellation-status")).toBeVisible();

  await recordConstellationScreenshot(
    page,
    testInfo,
    "daily-constellation-200pct"
  );
});

test("offers an explicit retry when the Constellation chunk fails", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One optional Constellation retry proof is sufficient."
  );
  let chunkRequests = 0;
  await page.route("**/assets/daily-constellation-view-*.js", async (route) => {
    chunkRequests += 1;
    if (chunkRequests === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await seedDailyEscape(page, true);
  await stubConstellation(page);

  await openDailyDialog(page);

  await expect(page.locator("#daily-constellation-status")).toHaveText(
    "The Constellation could not be loaded. Your Daily result is unaffected."
  );
  const retry = page.getByRole("button", { name: "Retry Constellation" });
  await expect(retry).toBeVisible();

  await retry.click();
  await expect(page.locator("#daily-constellation-status")).toHaveText(
    "Today’s shared paths are showing."
  );
});
