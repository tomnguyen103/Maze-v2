import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeKnownRunRuleset
} from "../src/game/run-ruleset.js";
import {
  QUEST_LEVELS,
  getDifficultyBand,
  getLabyrinthConfig
} from "../src/questions/quest-levels.js";

/** @typedef {ReturnType<typeof createRun>} TestRun */
/** @typedef {[row: number, col: number, mask: number, phase: number]} OracleState */

const SEEDS_PER_SIZE = 300;
const LABYRINTH_COUNT = 20;
const MOVES = /** @type {const} */ ([
  ["up", -1, 0],
  ["right", 0, 1],
  ["down", 1, 0],
  ["left", 0, -1]
]);

/**
 * Exact state oracle for US-01. A state is (position, Echo mask, Tide phase).
 * Forward search over-approximates play: a Pulse may flip the Tide phase at
 * any time. Rescue search uses Move edges only, so it under-approximates play.
 * A state that the forward search reaches and the rescue search misses is a
 * trap.
 *
 * @param {TestRun} run
 */
function exploreStates(run) {
  const revision = run.ruleset.revision;
  const width = run.labyrinth[0].length;
  const key = (/** @type {number} */ row, /** @type {number} */ col) =>
    row * width + col;
  const echoKeys = run.echoes.map((echo) => key(echo.row, echo.col));
  const fullMask = (1 << echoKeys.length) - 1;
  const windways = new Map(
    revision.startsWith("windways-")
      ? run.windways.map((windway) => [
          key(windway.source.row, windway.source.col),
          windway.destination
        ])
      : []
  );
  const bridges = revision === "echo-bridges-v1" ? run.echoBridges : [];
  const tides = revision === "tide-doors-v1" ? run.tideDoors : [];
  const isPassage = (/** @type {number} */ row, /** @type {number} */ col) =>
    run.labyrinth[row]?.[col] === 1;

  /**
   * @param {{ from: { row: number, col: number }, to: { row: number, col: number } }[]} shortcuts
   * @param {(shortcut: any) => boolean} isOpen
   * @param {number} row
   * @param {number} col
   * @param {number} wallRow
   * @param {number} wallCol
   */
  const crossing = (shortcuts, isOpen, row, col, wallRow, wallCol) => {
    for (const shortcut of shortcuts) {
      if (!isOpen(shortcut)) continue;
      const midRow = (shortcut.from.row + shortcut.to.row) / 2;
      const midCol = (shortcut.from.col + shortcut.to.col) / 2;
      if (midRow !== wallRow || midCol !== wallCol) continue;
      if (shortcut.from.row === row && shortcut.from.col === col) return shortcut.to;
      if (shortcut.to.row === row && shortcut.to.col === col) return shortcut.from;
    }
    return null;
  };

  /** @returns {OracleState | null} */
  const move = (
    /** @type {OracleState} */ [row, col, mask, phase],
    /** @type {number} */ dRow,
    /** @type {number} */ dCol
  ) => {
    const targetRow = row + dRow;
    const targetCol = col + dCol;
    const bridge = crossing(
      bridges,
      (shortcut) => ((mask >> shortcut.echoIndex) & 1) === 1,
      row,
      col,
      targetRow,
      targetCol
    );
    const tide = crossing(
      tides,
      (shortcut) => (phase === 0 ? shortcut.open : !shortcut.open),
      row,
      col,
      targetRow,
      targetCol
    );
    if (!isPassage(targetRow, targetCol) && !bridge && !tide) return null;
    const windway = windways.get(key(targetRow, targetCol));
    if (!bridge && !tide && windway && !isPassage(windway.row, windway.col)) {
      return null;
    }
    const destination = bridge ?? tide ?? windway ?? { row: targetRow, col: targetCol };
    const echoIndex = echoKeys.indexOf(key(destination.row, destination.col));
    const nextMask = echoIndex >= 0 ? mask | (1 << echoIndex) : mask;
    return [destination.row, destination.col, nextMask, tides.length > 0 ? 1 - phase : 0];
  };

  const stateKey = (/** @type {OracleState} */ [row, col, mask, phase]) =>
    (key(row, col) * 512 + mask) * 2 + phase;
  /** @type {OracleState} */
  const start = [run.explorer.row, run.explorer.col, 0, 0];
  /** @type {Map<number, { state: OracleState, parent: number | null, direction: string | null }>} */
  const seen = new Map([[stateKey(start), { state: start, parent: null, direction: null }]]);
  /** @type {Map<number, number[]>} */
  const predecessors = new Map();
  const queue = [start];
  /** @type {number[]} */
  const wins = [];

  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index];
    const current = stateKey(state);
    if (state[2] === fullMask && state[0] === run.gate.row && state[1] === run.gate.col) {
      wins.push(current);
      continue;
    }
    for (const [direction, dRow, dCol] of MOVES) {
      const next = move(state, dRow, dCol);
      if (!next) continue;
      const nextKey = stateKey(next);
      const list = predecessors.get(nextKey) ?? [];
      list.push(current);
      predecessors.set(nextKey, list);
      if (!seen.has(nextKey)) {
        seen.set(nextKey, { state: next, parent: current, direction });
        queue.push(next);
      }
    }
    if (tides.length > 0) {
      /** @type {OracleState} */
      const pulsed = [state[0], state[1], state[2], 1 - state[3]];
      const pulsedKey = stateKey(pulsed);
      if (!seen.has(pulsedKey)) {
        seen.set(pulsedKey, { state: pulsed, parent: current, direction: null });
        queue.push(pulsed);
      }
    }
  }

  const rescued = new Set(wins);
  const rescueQueue = [...wins];
  for (let index = 0; index < rescueQueue.length; index += 1) {
    for (const previous of predecessors.get(rescueQueue[index]) ?? []) {
      if (!rescued.has(previous)) {
        rescued.add(previous);
        rescueQueue.push(previous);
      }
    }
  }

  for (const [trapKey, entry] of seen) {
    if (rescued.has(trapKey)) continue;
    /** @type {string[]} */
    const path = [];
    for (let at = seen.get(trapKey); at?.parent !== null && at; at = seen.get(at.parent)) {
      path.unshift(at.direction ?? "pulse");
    }
    return { trap: entry.state, path, states: seen.size };
  }
  return { trap: null, path: [], states: seen.size };
}

const WINDWAYS_V1 = normalizeKnownRunRuleset({
  atlasRegionId: "developing",
  revision: "windways-v1"
});

/**
 * Every shipped Labyrinth configuration, grouped by ruleset and board size.
 *
 * @param {(labyrinthNumber: number) => { atlasRegionId: string, revision: string, label: string }} rulesetFor
 */
function shippedConfigsBySize(rulesetFor) {
  /** @type {Map<string, { ruleset: any, size: number, configs: { levelId: string, labyrinthNumber: number, config: any }[] }>} */
  const groups = new Map();
  for (let labyrinthNumber = 1; labyrinthNumber <= LABYRINTH_COUNT; labyrinthNumber += 1) {
    const ruleset = rulesetFor(labyrinthNumber);
    for (const level of QUEST_LEVELS) {
      const config = getLabyrinthConfig(level.id, labyrinthNumber);
      const groupKey = `${ruleset.revision}|${ruleset.atlasRegionId}|${config.size}`;
      const group = groups.get(groupKey) ?? { ruleset, size: config.size, configs: [] };
      group.configs.push({ levelId: level.id, labyrinthNumber, config });
      groups.set(groupKey, group);
    }
  }
  return [...groups.values()];
}

/** @param {ReturnType<typeof shippedConfigsBySize>} groups */
function sweep(groups) {
  /** @type {string[]} */
  const traps = [];
  let runs = 0;
  for (const group of groups) {
    for (let seedIndex = 0; seedIndex < SEEDS_PER_SIZE; seedIndex += 1) {
      const { levelId, labyrinthNumber, config } =
        group.configs[seedIndex % group.configs.length];
      const seed = `NSL-${levelId}-${labyrinthNumber}-${seedIndex}`;
      const run = createRun(seed, { ...config, ruleset: group.ruleset });
      runs += 1;
      const { trap } = exploreStates(run);
      if (trap) {
        traps.push(
          `${group.ruleset.revision} size ${group.size} seed ${seed} trap ${JSON.stringify(trap)}`
        );
      }
    }
  }
  return { traps, runs };
}

describe("US-01 no trapped Labyrinth", () => {
  const questGroups = shippedConfigsBySize(getQuestRunRuleset);
  const questRevisions = [...new Set(questGroups.map((group) => group.ruleset.revision))];

  it.each(questRevisions)(
    "US-01.1/US-01.2: every reachable state of %s reaches the Gate with every Echo",
    (revision) => {
      const groups = questGroups.filter((group) => group.ruleset.revision === revision);
      const { traps, runs } = sweep(groups);
      expect(runs).toBe(groups.length * SEEDS_PER_SIZE);
      expect(traps).toEqual([]);
    },
    120_000
  );

  it(
    "US-01.1/US-01.2: every reachable state of classic-v1 reaches the Gate with every Echo",
    () => {
      const groups = shippedConfigsBySize(getClassicRunRuleset);
      const sizes = new Set(groups.map((group) => group.size));
      const { traps } = sweep(groups);
      expect([...sizes].sort((a, b) => a - b)).toEqual([11, 13, 15, 17, 19, 21, 23]);
      expect(traps).toEqual([]);
    },
    120_000
  );

  it("US-01.2: the sweep covers every Atlas Region at its shipped sizes", () => {
    for (let labyrinthNumber = 1; labyrinthNumber <= LABYRINTH_COUNT; labyrinthNumber += 1) {
      const band = getDifficultyBand(labyrinthNumber);
      expect(questGroups.some((group) => group.ruleset.atlasRegionId === band.id)).toBe(true);
    }
    expect(questRevisions).toHaveLength(5);
  });

  it("US-01.3: the pinned seed traps under windways-v1 and not under the current ruleset", () => {
    const seed = "WINDWAY-TRAP-7";
    const config = getLabyrinthConfig("bright-start", 5);
    expect(WINDWAYS_V1).not.toBeNull();
    if (!WINDWAYS_V1) throw new Error("windways-v1 must stay known");

    const legacy = createRun(seed, { ...config, ruleset: WINDWAYS_V1 });
    const legacyResult = exploreStates(legacy);
    expect(legacyResult.trap).toEqual([1, 3, 2, 0]);

    // Wardens never change which tiles a Move reaches, so the walk removes them.
    /** @type {TestRun} */
    let walked = { ...legacy, wardens: [] };
    for (const direction of legacyResult.path) {
      walked = applyAction(walked, {
        type: "move",
        direction: /** @type {import("../src/game/game-session.js").Direction} */ (direction)
      });
    }
    expect(walked.status).toBe("active");
    expect({ row: walked.explorer.row, col: walked.explorer.col }).toEqual({ row: 1, col: 3 });

    const current = createRun(seed, { ...config, ruleset: getQuestRunRuleset(5) });
    expect(exploreStates(current).trap).toBeNull();
  });
});
