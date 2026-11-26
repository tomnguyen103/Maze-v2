import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  getClassicRunRuleset,
  getQuestRunRuleset
} from "../src/game/run-ruleset.js";
import { QUEST_LEVELS, getLabyrinthConfig } from "../src/questions/quest-levels.js";

/** @typedef {ReturnType<typeof createRun>} TestRun */
/** @typedef {{ type: "move", direction: import("../src/game/game-session.js").Direction } | { type: "pulse" }} PlanStep */

/** @type {import("../src/game/game-session.js").Direction[]} */
const DIRECTIONS = ["up", "right", "down", "left"];
// The Gate Warden milestones, plus one Labyrinth of each Atlas Region between them.
const LABYRINTHS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

const QUESTION = {
  id: "warden-harness",
  prompt: "Warden harness",
  choices: [
    { id: "a", label: "A" },
    { id: "b", label: "B" }
  ],
  answerId: "a",
  explanation: "Warden harness.",
  hint: "Warden harness.",
  difficultyBand: "beginner",
  topicId: "warden-harness",
  learningObjectiveId: "warden-harness"
};

/** @param {TestRun} run @param {string} answerId */
function answer(run, answerId) {
  const asked = applyAction(run, { type: "provide-question", question: QUESTION });
  return applyAction(asked, { type: "answer-question", answerId });
}

/** @param {TestRun} run @returns {TestRun} */
const withoutWardens = (run) => ({ ...run, wardens: [] });

/** @param {TestRun} run */
const stateKey = (run) =>
  JSON.stringify([
    run.explorer.row,
    run.explorer.col,
    run.echoes.map((echo) => echo.collected),
    run.gate,
    run.tideDoors.map((door) => door.open),
    run.echoBridges.map((bridge) => bridge.open),
    run.status,
    run.pulses
  ]);

/**
 * The shortest action list that wins the Run with no board Wardens. A Gate
 * Warden Challenge gets a correct answer and is not a plan step.
 *
 * @param {TestRun} start
 * @returns {PlanStep[] | null}
 */
function planWithoutWardens(start) {
  /** @param {TestRun} run */
  const settle = (run) => (run.status === "challenge" ? answer(run, "a") : run);
  const first = settle(withoutWardens(start));
  /** @type {Map<string, { run: TestRun, plan: PlanStep[] }>} */
  const seen = new Map([[stateKey(first), { run: first, plan: [] }]]);
  const queue = [stateKey(first)];
  while (queue.length > 0) {
    const current = /** @type {{ run: TestRun, plan: PlanStep[] }} */ (
      seen.get(/** @type {string} */ (queue.shift()))
    );
    if (current.run.status === "won") return current.plan;
    if (current.run.status !== "active") continue;
    /** @type {PlanStep[]} */
    const steps = DIRECTIONS.map((direction) => ({ type: "move", direction }));
    if (current.run.pulses > 0 && current.run.tideDoors.length > 0) {
      steps.push({ type: "pulse" });
    }
    for (const step of steps) {
      const next = settle(applyAction(current.run, step));
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.set(key, { run: next, plan: [...current.plan, step] });
        queue.push(key);
      }
    }
  }
  return null;
}

/**
 * @param {TestRun} previous
 * @param {TestRun} run
 * @param {import("../src/game/game-session.js").Position} from
 * @param {import("../src/game/game-session.js").Position} to
 */
function isLegalWardenStep(previous, run, from, to) {
  const distance = Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
  if (distance <= 1) return true;
  // Echo Bridges open before Wardens move; Tide Doors change phase after.
  return [...run.echoBridges, ...previous.tideDoors].some(
    (shortcut) =>
      shortcut.open &&
      ((shortcut.from.row === from.row && shortcut.from.col === from.col &&
        shortcut.to.row === to.row && shortcut.to.col === to.col) ||
        (shortcut.to.row === from.row && shortcut.to.col === from.col &&
          shortcut.from.row === to.row && shortcut.from.col === to.col))
  );
}

/**
 * Every Warden rule that a single Run state must keep.
 *
 * @param {TestRun} previous
 * @param {TestRun} run
 * @returns {string[]}
 */
function wardenViolations(previous, run) {
  /** @type {string[]} */
  const problems = [];
  const reserved = new Set([
    `${run.gate.row},${run.gate.col}`,
    ...run.echoes
      .filter((echo) => !echo.collected)
      .map((echo) => `${echo.row},${echo.col}`)
  ]);
  const tiles = new Set();
  for (const warden of run.wardens) {
    const key = `${warden.row},${warden.col}`;
    if (run.labyrinth[warden.row]?.[warden.col] !== 1) {
      problems.push(`Warden ${warden.id} stands in a wall at ${key}`);
    }
    if (reserved.has(key)) {
      problems.push(`Warden ${warden.id} stands on the Gate or an Echo at ${key}`);
    }
    if (tiles.has(key)) problems.push(`two Wardens share ${key}`);
    tiles.add(key);
    const before = previous.wardens.find(({ id }) => id === warden.id);
    if (!before) {
      problems.push(`Warden ${warden.id} appeared from nowhere`);
    } else if (!isLegalWardenStep(previous, run, before, warden)) {
      problems.push(
        `Warden ${warden.id} jumped from ${before.row},${before.col} to ${key}`
      );
    }
  }
  if (run.status === "challenge" && run.challenge?.kind !== "gate-warden") {
    const blocker = run.wardens.find(({ id }) => id === run.challenge?.wardenId);
    if (
      !blocker ||
      blocker.row !== run.explorer.row ||
      blocker.col !== run.explorer.col
    ) {
      problems.push("a Warden Challenge started with no Warden on the Explorer tile");
    }
  }
  if (
    run.status === "active" &&
    run.wardens.some(
      (warden) =>
        warden.row === run.explorer.row && warden.col === run.explorer.col
    )
  ) {
    problems.push("a Warden shares the Explorer tile with no Warden Challenge");
  }
  return problems;
}

/**
 * Plays the warden-free plan on the real Run with every Warden live. Each
 * Warden Challenge gets one wrong answer first when Vitality allows, then the
 * correct answer.
 *
 * @param {TestRun} start
 * @param {PlanStep[]} plan
 */
function playWithWardens(start, plan) {
  const stats = { boardChallenges: 0, gateChallenges: 0 };
  /** @type {string[]} */
  const problems = [];
  let run = start;
  let shadow = withoutWardens(start);
  /** @param {TestRun} previous @param {TestRun} next */
  const check = (previous, next) => {
    problems.push(...wardenViolations(previous, next));
  };
  /** @param {TestRun} current */
  const resolveChallenge = (current) => {
    const isGate = current.challenge?.kind === "gate-warden";
    if (isGate) stats.gateChallenges += 1;
    else stats.boardChallenges += 1;
    const tile = { row: current.explorer.row, col: current.explorer.col };
    const wardenCount = current.wardens.length;
    let next = current;
    if (current.explorer.vitality > 1) {
      next = answer(current, "b");
      if (next.status !== "challenge") problems.push("a wrong answer ended the Challenge");
      if (next.explorer.vitality !== current.explorer.vitality - 1) {
        problems.push("a wrong answer did not cost 1 Vitality");
      }
    }
    const resolved = answer(next, "a");
    if (resolved.status !== "active") {
      problems.push(`a correct answer left status ${resolved.status}`);
    }
    if (resolved.explorer.row !== tile.row || resolved.explorer.col !== tile.col) {
      problems.push("a Warden Challenge moved the Explorer");
    }
    if (resolved.wardensDefeated !== current.wardensDefeated + 1) {
      problems.push("a correct answer did not count a defeated Warden");
    }
    if (isGate) {
      if (resolved.gate.sealed || !resolved.gateWarden?.defeated) {
        problems.push("a defeated Gate Warden left the Gate sealed");
      }
      if (resolved.wardens.length !== wardenCount) {
        problems.push("the Gate Warden Challenge removed a board Warden");
      }
    } else if (
      resolved.wardens.length !== wardenCount - 1 ||
      resolved.wardens.some(({ id }) => id === current.challenge?.wardenId)
    ) {
      problems.push("a defeated Warden stayed on the board");
    }
    return resolved;
  };

  for (const step of plan) {
    if (run.status !== "active") break;
    const next = applyAction(run, step);
    shadow = applyAction(shadow, step);
    if (shadow.status === "challenge") shadow = answer(shadow, "a");
    check(run, next);
    if (
      next.explorer.row !== shadow.explorer.row ||
      next.explorer.col !== shadow.explorer.col
    ) {
      problems.push(
        `a Warden changed where a Move goes: ${next.explorer.row},${next.explorer.col} not ${shadow.explorer.row},${shadow.explorer.col}`
      );
      break;
    }
    run = next;
    // A Gate Warden Challenge can follow a board Warden Challenge on one tile.
    while (run.status === "challenge") run = resolveChallenge(run);
  }
  return { run, problems, stats };
}

/**
 * @param {(labyrinthNumber: number) => { atlasRegionId: string, revision: string, label: string }} rulesetFor
 */
function cases(rulesetFor) {
  return LABYRINTHS.flatMap((labyrinthNumber) =>
    QUEST_LEVELS.map((level) => ({
      levelId: level.id,
      labyrinthNumber,
      config: { ...getLabyrinthConfig(level.id, labyrinthNumber), ruleset: rulesetFor(labyrinthNumber) }
    }))
  );
}

describe("Warden behavior harness", () => {
  it.each([
    ["Quest", getQuestRunRuleset],
    ["Classic", getClassicRunRuleset]
  ])(
    "%s Runs: live Wardens keep every rule and never stop a correct Explorer",
    (_name, rulesetFor) => {
      /** @type {string[]} */
      const failures = [];
      const totals = { boardChallenges: 0, gateChallenges: 0, gateRuns: 0 };
      for (const { levelId, labyrinthNumber, config } of cases(rulesetFor)) {
        for (const suffix of ["A", "B"]) {
          const seed = `WARDEN-${levelId}-${labyrinthNumber}-${suffix}`;
          const start = createRun(seed, config);
          const label = `${seed} ${start.ruleset.revision}`;
          const plan = planWithoutWardens(start);
          if (!plan) {
            failures.push(`${label}: no winning plan`);
            continue;
          }
          const { run, problems, stats } = playWithWardens(start, plan);
          failures.push(...problems.map((problem) => `${label}: ${problem}`));
          if (run.status !== "won") failures.push(`${label}: ended ${run.status}`);
          totals.boardChallenges += stats.boardChallenges;
          totals.gateChallenges += stats.gateChallenges;
          if (start.gateWarden) {
            totals.gateRuns += 1;
            if (stats.gateChallenges !== 1) {
              failures.push(`${label}: Gate Warden Challenge count ${stats.gateChallenges}`);
            }
          }
        }
      }
      expect(failures).toEqual([]);
      // The harness must exercise both Challenge kinds to prove anything.
      expect(totals.boardChallenges).toBeGreaterThan(0);
      expect(totals.gateRuns).toBeGreaterThan(0);
      expect(totals.gateChallenges).toBe(totals.gateRuns);
    },
    120_000
  );

  it("a Gate Warden holds the open Gate until its Challenge is won", () => {
    const start = createRun("WARDEN-GATE-8", {
      ...getLabyrinthConfig("bright-start", 8),
      ruleset: getQuestRunRuleset(8)
    });
    expect(start.gateWarden?.defeated).toBe(false);
    expect(start.gate.sealed).toBe(true);
    const plan = planWithoutWardens(start);
    expect(plan).not.toBeNull();
    let run = withoutWardens(start);
    for (const step of /** @type {PlanStep[]} */ (plan)) {
      run = applyAction(run, step);
      if (run.status === "challenge") break;
    }
    expect(run.status).toBe("challenge");
    expect(run.challenge?.kind).toBe("gate-warden");
    expect(run.gate.open).toBe(true);
    // The Explorer waits beside the Gate, not on it.
    expect(run.explorer.row === run.gate.row && run.explorer.col === run.gate.col).toBe(false);

    const resolved = answer(run, "a");
    expect(resolved.gate.sealed).toBe(false);
    expect(resolved.status).toBe("active");
    const lastStep = /** @type {PlanStep[]} */ (plan).at(-1);
    expect(applyAction(resolved, /** @type {PlanStep} */ (lastStep)).status).toBe("won");
  });
});
