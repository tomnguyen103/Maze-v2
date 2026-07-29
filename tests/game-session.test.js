import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";

/** @typedef {ReturnType<typeof createRun>} TestRun */
/** @typedef {"up" | "right" | "down" | "left"} TestDirection */
/** @typedef {{ row: number, col: number }} TestPosition */

/** @type {{ name: TestDirection, row: number, col: number }[]} */
const MOVES = [
  { name: "up", row: -1, col: 0 },
  { name: "right", row: 0, col: 1 },
  { name: "down", row: 1, col: 0 },
  { name: "left", row: 0, col: -1 }
];

const QUESTION = Object.freeze({
  id: "math-1",
  prompt: "What is 4 + 3?",
  choices: Object.freeze([
    Object.freeze({ id: "a", label: "6" }),
    Object.freeze({ id: "b", label: "7" }),
    Object.freeze({ id: "c", label: "8" })
  ]),
  answerId: "b",
  hint: "Count on three steps from four.",
  explanation: "Four plus three equals seven.",
  difficultyBand: "foundation",
  topicId: "arithmetic",
  learningObjectiveId: "scout-equal-groups"
});

/** @param {TestPosition} position */
function tileKey(position) {
  return `${position.row},${position.col}`;
}

/**
 * @param {TestRun} run
 * @param {TestPosition} position
 */
function openNeighbors(run, position) {
  return MOVES.filter(({ row, col }) => {
    const nextRow = position.row + row;
    const nextCol = position.col + col;
    return run.labyrinth[nextRow]?.[nextCol] === 1;
  });
}

/**
 * @param {TestRun} run
 * @param {TestPosition} start
 * @param {TestPosition} goal
 * @returns {TestDirection[]}
 */
function pathBetween(run, start, goal) {
  const startKey = tileKey(start);
  const goalKey = tileKey(goal);
  const queue = [start];
  /** @type {Map<string, string | null>} */
  const previous = new Map([[startKey, null]]);
  /** @type {Map<string, TestDirection>} */
  const moveByKey = new Map();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (tileKey(current) === goalKey) {
      break;
    }

    for (const move of openNeighbors(run, current)) {
      const next = {
        row: current.row + move.row,
        col: current.col + move.col
      };
      const nextKey = tileKey(next);
      if (previous.has(nextKey)) {
        continue;
      }
      previous.set(nextKey, tileKey(current));
      moveByKey.set(nextKey, move.name);
      queue.push(next);
    }
  }

  if (!previous.has(goalKey)) {
    throw new Error(`No path from ${startKey} to ${goalKey}`);
  }

  /** @type {TestDirection[]} */
  const path = [];
  let cursor = goalKey;
  while (cursor !== startKey) {
    const move = moveByKey.get(cursor);
    const prior = previous.get(cursor);
    if (!move || typeof prior !== "string") {
      throw new Error(`Broken path at ${cursor}`);
    }
    path.unshift(move);
    cursor = prior;
  }
  return path;
}

/**
 * @param {TestRun} run
 * @param {TestPosition} start
 * @param {TestPosition} goal
 */
function canReachWithWindways(run, start, goal) {
  const queue = [start];
  const visited = new Set([tileKey(start)]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (tileKey(current) === tileKey(goal)) {
      return true;
    }
    for (const move of openNeighbors(run, current)) {
      const directTarget = {
        row: current.row + move.row,
        col: current.col + move.col
      };
      const windway = run.windways.find(
        ({ source }) => tileKey(source) === tileKey(directTarget)
      );
      const next = windway?.destination ?? directTarget;
      if (!visited.has(tileKey(next))) {
        visited.add(tileKey(next));
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * @param {TestRun} run
 * @param {TestDirection[]} moves
 */
function follow(run, moves) {
  return moves.reduce(
    (current, direction) => applyAction(current, { type: "move", direction }),
    run
  );
}

describe("GameSession", () => {
  it("keeps one immutable ruleset identity through Run restart", () => {
    const ruleset = getQuestRunRuleset(9);
    const run = createRun("BRIDGE-RULES-09", {
      ...getLabyrinthConfig("trail-scout", 9),
      ruleset
    });

    expect(run.ruleset).toEqual(ruleset);
    expect(applyAction(run, { type: "restart" }).ruleset).toEqual(ruleset);
    expect(() =>
      createRun("BROKEN-RULES-09", {
        ...getLabyrinthConfig("trail-scout", 9),
        ruleset: {
          atlasRegionId: "capable",
          revision: "unknown-v1"
        }
      })
    ).toThrow("Run ruleset identity is invalid.");
  });

  it("creates the same run from the same seed", () => {
    const first = createRun("EMBER-17");
    const second = createRun("EMBER-17");
    const fingerprint = first.labyrinth.map((row) => row.join("")).join("/");

    expect(first.labyrinth).toEqual(second.labyrinth);
    expect(first.explorer).toEqual(second.explorer);
    expect(first.echoes).toEqual(second.echoes);
    expect(first.gate).toEqual(second.gate);
    expect(first.wardens).toEqual(second.wardens);
    expect(fingerprint).toBe(
      "000000000000000/011111110111110/000100010100010/011111010111010/010101010001010/010101011111010/010101000000010/010101110111110/010100010100000/010111110101110/010100000100010/010101110101110/010101010101010/011111011111010/000000000000000"
    );
    expect(first.gate).toEqual({ row: 9, col: 11, open: false });
    expect(first.echoes).toEqual([
      { row: 13, col: 5, collected: false },
      { row: 13, col: 1, collected: false },
      { row: 7, col: 7, collected: false }
    ]);
    expect(first.wardens).toEqual([
      { row: 5, col: 8, id: 0, mode: "patrol" },
      { row: 11, col: 7, id: 1, mode: "patrol" }
    ]);
    expect(first.lastDirection).toBeNull();
    expect(first.score).toBe(0);
    expect(first.wardensDefeated).toBe(0);
  });

  it("creates different labyrinths from distinct known seeds", () => {
    const first = createRun("EMBER-17");
    const second = createRun("EMBER-18");
    /** @param {TestRun} run */
    const fingerprint = (run) =>
      run.labyrinth.map((row) => row.join("")).join("/");

    expect(fingerprint(first)).not.toBe(fingerprint(second));
  });

  it("places deterministic Region 2 Windways off protected starting tiles", () => {
    const config = {
      ...getLabyrinthConfig("trail-scout", 5),
      ruleset: getQuestRunRuleset(5)
    };
    const first = createRun("WINDWAYS-05", config);
    const second = createRun("WINDWAYS-05", config);
    const protectedTiles = new Set([
      tileKey(first.explorer),
      tileKey(first.gate),
      ...first.echoes.map(tileKey),
      ...first.wardens.map(tileKey)
    ]);

    expect(first.windways).toEqual(second.windways);
    expect(first.windways).toHaveLength(2);
    const windwayTiles = first.windways.flatMap((windway) => [
      tileKey(windway.source),
      tileKey(windway.destination)
    ]);
    expect(new Set(windwayTiles).size).toBe(windwayTiles.length);
    for (const windway of first.windways) {
      expect(protectedTiles.has(tileKey(windway.source))).toBe(false);
      expect(protectedTiles.has(tileKey(windway.destination))).toBe(false);
      expect(first.labyrinth[windway.source.row][windway.source.col]).toBe(1);
      expect(
        first.labyrinth[windway.destination.row][windway.destination.col]
      ).toBe(1);
      expect(
        Math.abs(windway.source.row - windway.destination.row) +
          Math.abs(windway.source.col - windway.destination.col)
      ).toBe(1);
    }

    expect(createRun("WINDWAYS-05").windways).toEqual([]);
  });

  it("keeps every protected objective mutually reachable through Windways", () => {
    for (const seed of ["WIND-TRAIL-5", "WINDWAYS-05", "WIND-REPLAY-5"]) {
      const run = createRun(seed, {
        ...getLabyrinthConfig("trail-scout", 5),
        ruleset: getQuestRunRuleset(5)
      });
      const protectedPositions = [
        run.explorer,
        run.gate,
        ...run.echoes,
        ...run.wardens
      ];

      for (const start of protectedPositions) {
        for (const goal of protectedPositions) {
          expect(
            canReachWithWindways(run, start, goal),
            `${seed}: ${tileKey(start)} cannot reach ${tileKey(goal)}`
          ).toBe(true);
        }
      }
    }
  });

  it("pairs every Region 3 Echo with one deterministic sealed Bridge", () => {
    const config = {
      ...getLabyrinthConfig("trail-scout", 9),
      ruleset: getQuestRunRuleset(9)
    };
    const first = createRun("ECHO-BRIDGES-09", config);
    const second = createRun("ECHO-BRIDGES-09", config);
    const protectedTiles = new Set([
      tileKey(first.explorer),
      tileKey(first.gate),
      ...first.echoes.map(tileKey),
      ...first.wardens.map(tileKey)
    ]);

    expect(first.echoBridges).toEqual(second.echoBridges);
    expect(first.echoBridges).toHaveLength(first.echoes.length);
    expect(first.echoBridges.map((bridge) => bridge.echoIndex)).toEqual(
      first.echoes.map((_, index) => index)
    );
    expect(
      new Set(
        first.echoBridges.map((bridge) =>
          [tileKey(bridge.from), tileKey(bridge.to)].sort().join("|")
        )
      ).size
    ).toBe(first.echoBridges.length);
    for (const bridge of first.echoBridges) {
      const midpoint = {
        row: (bridge.from.row + bridge.to.row) / 2,
        col: (bridge.from.col + bridge.to.col) / 2
      };
      expect(bridge.open).toBe(false);
      expect(protectedTiles.has(tileKey(bridge.from))).toBe(false);
      expect(protectedTiles.has(tileKey(bridge.to))).toBe(false);
      expect(first.labyrinth[bridge.from.row][bridge.from.col]).toBe(1);
      expect(first.labyrinth[bridge.to.row][bridge.to.col]).toBe(1);
      expect(first.labyrinth[midpoint.row][midpoint.col]).toBe(0);
      expect(
        Math.abs(bridge.from.row - bridge.to.row) +
          Math.abs(bridge.from.col - bridge.to.col)
      ).toBe(2);
    }

    expect(createRun("ECHO-BRIDGES-09").echoBridges).toEqual([]);
  });

  it("creates one Echo Bridge per Echo across 2,000 Region 3 seeds", () => {
    const levels = ["bright-start", "trail-scout", "maze-master"];
    for (let index = 0; index < 2_000; index += 1) {
      const levelId = levels[index % levels.length];
      const labyrinthNumber = 9 + (index % 4);
      const run = createRun(`BRIDGE-STRESS-${index}`, {
        ...getLabyrinthConfig(levelId, labyrinthNumber),
        ruleset: getQuestRunRuleset(labyrinthNumber)
      });
      expect(
        run.echoBridges.length,
        `${levelId} seed ${index}`
      ).toBe(run.echoes.length);
    }
  });

  it("opens only the Bridge paired with a recovered Echo", () => {
    const run = createRun("BRIDGE-OPEN", {
      echoCount: 2,
      size: 9,
      wardenCount: 0,
      ruleset: getQuestRunRuleset(9)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    openLabyrinth[4][4] = 0;
    openLabyrinth[6][4] = 0;
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 2, col: 2 },
      echoes: [
        { row: 2, col: 3, collected: false },
        { row: 6, col: 6, collected: false }
      ],
      gate: { row: 7, col: 7, open: false },
      echoBridges: [
        {
          echoIndex: 0,
          from: { row: 4, col: 3 },
          to: { row: 4, col: 5 },
          open: false
        },
        {
          echoIndex: 1,
          from: { row: 6, col: 3 },
          to: { row: 6, col: 5 },
          open: false
        }
      ]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.echoBridges).toEqual([
      expect.objectContaining({ echoIndex: 0, open: true }),
      expect.objectContaining({ echoIndex: 1, open: false })
    ]);
    expect(next.event).toMatchObject({
      type: "echo-collected",
      message: expect.stringContaining("Bridge opened")
    });
    expect(staged.echoBridges.every((bridge) => !bridge.open)).toBe(true);
  });

  it("crosses an open Echo Bridge in one Move and blocks its sealed form", () => {
    const run = createRun("BRIDGE-TRAVEL", {
      echoCount: 0,
      size: 9,
      wardenCount: 0,
      ruleset: getQuestRunRuleset(9)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    openLabyrinth[4][4] = 0;
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 3 },
      gate: { row: 7, col: 7, open: true },
      echoBridges: [{
        echoIndex: 0,
        from: { row: 4, col: 3 },
        to: { row: 4, col: 5 },
        open: false
      }]
    };

    const sealed = applyAction(staged, { type: "move", direction: "right" });
    expect(sealed.explorer).toEqual(staged.explorer);
    expect(sealed.moves).toBe(staged.moves);

    const opened = applyAction(
      {
        ...staged,
        echoBridges: [{ ...staged.echoBridges[0], open: true }]
      },
      { type: "move", direction: "right" }
    );
    expect(opened.explorer).toMatchObject({ row: 4, col: 5 });
    expect(opened.moves).toBe(staged.moves + 1);
    expect(opened.event).toMatchObject({
      type: "echo-bridge-travel",
      message: expect.stringContaining("Echo Bridge")
    });
    expect(opened.labyrinth).toEqual(staged.labyrinth);
  });

  it("uses open Echo Bridges for Warden movement", () => {
    const run = createRun("BRIDGE-WARDEN", {
      echoCount: 0,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(9)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    openLabyrinth[4][4] = 0;
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 2 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 4, col: 5, id: 0, mode: /** @type {const} */ ("patrol") }],
      echoBridges: [{
        echoIndex: 0,
        from: { row: 4, col: 3 },
        to: { row: 4, col: 5 },
        open: true
      }]
    };

    const next = applyAction(staged, { type: "move", direction: "up" });

    expect(next.wardens).toEqual([
      { row: 4, col: 3, id: 0, mode: "hunt" }
    ]);
  });

  it("creates two deterministic visible Tide Doors without changing the sealed base maze", () => {
    const config = {
      ...getLabyrinthConfig("trail-scout", 13),
      ruleset: getQuestRunRuleset(13)
    };
    const first = createRun("TIDE-DOORS-13", config);
    const second = createRun("TIDE-DOORS-13", config);
    const protectedTiles = new Set([
      tileKey(first.explorer),
      tileKey(first.gate),
      ...first.echoes.map(tileKey),
      ...first.wardens.map(tileKey)
    ]);

    expect(first.tideDoors).toEqual(second.tideDoors);
    expect(first.tideDoors).toHaveLength(2);
    expect(first.tideDoors.every((door) => door.open)).toBe(true);
    expect(first.labyrinth).toEqual(second.labyrinth);
    for (const door of first.tideDoors) {
      const midpoint = {
        row: (door.from.row + door.to.row) / 2,
        col: (door.from.col + door.to.col) / 2
      };
      expect(protectedTiles.has(tileKey(door.from))).toBe(false);
      expect(protectedTiles.has(tileKey(door.to))).toBe(false);
      expect(first.labyrinth[door.from.row][door.from.col]).toBe(1);
      expect(first.labyrinth[door.to.row][door.to.col]).toBe(1);
      expect(first.labyrinth[midpoint.row][midpoint.col]).toBe(0);
    }

    expect(createRun("TIDE-DOORS-13").tideDoors).toEqual([]);
  });

  it("creates both Tide Doors across 2,000 Region 4 seeds", () => {
    const levels = ["bright-start", "trail-scout", "maze-master"];
    for (let index = 0; index < 2_000; index += 1) {
      const labyrinthNumber = 13 + (index % 4);
      const run = createRun(`TIDE-STRESS-${index}`, {
        ...getLabyrinthConfig(levels[index % levels.length], labyrinthNumber),
        ruleset: getQuestRunRuleset(labyrinthNumber)
      });
      expect(run.tideDoors, `seed ${index}`).toHaveLength(2);
    }
  });

  it("crosses an open Tide Door, resolves Wardens in that phase, then seals every Door", () => {
    const run = createRun("TIDE-SHARED-PHASE", {
      echoCount: 0,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(13)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    openLabyrinth[4][4] = 0;
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 3 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 4, col: 6, id: 0, mode: /** @type {const} */ ("patrol") }],
      tideDoors: [
        {
          id: 0,
          from: { row: 4, col: 3 },
          to: { row: 4, col: 5 },
          open: true
        },
        {
          id: 1,
          from: { row: 2, col: 3 },
          to: { row: 2, col: 5 },
          open: true
        }
      ]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.explorer).toMatchObject({ row: 4, col: 5 });
    expect(next.wardens[0]).toMatchObject({ row: 4, col: 5 });
    expect(next.status).toBe("challenge");
    expect(next.tideDoors.every((door) => !door.open)).toBe(true);
    expect(next.moves).toBe(staged.moves + 1);
    expect(staged.tideDoors.every((door) => door.open)).toBe(true);
  });

  it("toggles Tide Doors only after successful Moves and Pulses", () => {
    const run = createRun("TIDE-TOGGLE", {
      echoCount: 0,
      size: 9,
      wardenCount: 0,
      pulses: 1,
      ruleset: getQuestRunRuleset(13)
    });
    const door = run.tideDoors[0];
    const blockedDirection = MOVES.find(({ row, col }) =>
      run.labyrinth[run.explorer.row + row]?.[run.explorer.col + col] !== 1
    );
    expect(blockedDirection).toBeDefined();

    const blocked = applyAction(run, {
      type: "move",
      direction: blockedDirection?.name ?? "up"
    });
    expect(blocked.tideDoors).toEqual(run.tideDoors);

    const paused = applyAction(run, { type: "pause" });
    expect(paused.tideDoors).toEqual(run.tideDoors);
    expect(applyAction(paused, { type: "pause" }).tideDoors).toEqual(run.tideDoors);

    const pulsed = applyAction(run, { type: "pulse" });
    expect(pulsed.tideDoors).toEqual(
      run.tideDoors.map((candidate) => ({ ...candidate, open: !candidate.open }))
    );
    const emptyPulse = applyAction(
      { ...pulsed, pulses: 0 },
      { type: "pulse" }
    );
    expect(emptyPulse.tideDoors).toEqual(pulsed.tideDoors);
    expect(door).toBeDefined();
  });

  it("keeps Tide Door phase fixed throughout a Question exchange", () => {
    const run = createRun("TIDE-QUESTION", {
      echoCount: 0,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(13)
    });
    const challenge = {
      ...run,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: run.wardens[0].id,
        question: null,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };
    const questioned = applyAction(challenge, {
      type: "provide-question",
      question: QUESTION
    });
    const hinted = applyAction(questioned, { type: "reveal-hint" });
    const answered = applyAction(hinted, {
      type: "answer-question",
      answerId: QUESTION.answerId
    });

    expect(questioned.tideDoors).toEqual(run.tideDoors);
    expect(hinted.tideDoors).toEqual(run.tideDoors);
    expect(answered.tideDoors).toEqual(run.tideDoors);
  });

  it("places every entity on a unique reachable passage", () => {
    const run = createRun("REACHABLE-31");
    const reachable = new Set(
      pathBetween(run, run.explorer, run.gate).map((_, index) => index)
    );
    const occupied = [
      run.explorer,
      run.gate,
      ...run.echoes,
      ...run.wardens
    ].map(tileKey);

    expect(new Set(occupied).size).toBe(occupied.length);
    expect(run.labyrinth[run.gate.row][run.gate.col]).toBe(1);
    expect(run.echoes.every((echo) => pathBetween(run, run.explorer, echo).length > 0)).toBe(true);
    expect(run.wardens.every((warden) => pathBetween(run, run.explorer, warden).length > 0)).toBe(true);
    expect(reachable.size).toBeGreaterThan(0);
  });

  it("preserves the largest Quest progression entity counts", () => {
    const run = createRun("MAZE-MASTER-20", {
      size: 23,
      echoCount: 8,
      wardenCount: 6
    });

    expect(run.echoes).toHaveLength(8);
    expect(run.wardens).toHaveLength(6);
  });

  it("reserves one configured Warden for a deterministic milestone Gate encounter", () => {
    const config = getLabyrinthConfig("trail-scout", 4);
    const first = createRun("TRAIL-SCOUT-4", config);
    const second = createRun("TRAIL-SCOUT-4", config);

    expect(first).toEqual(second);
    expect(first.config.wardenCount).toBe(2);
    expect(first.wardens).toHaveLength(1);
    expect(first.gateWarden).toEqual({ id: 1, defeated: false });
    expect(first.gate).toMatchObject({ open: false, sealed: true });
    expect(first.wardens.length + Number(Boolean(first.gateWarden))).toBe(2);

    const ordinary = createRun(
      "TRAIL-SCOUT-3",
      getLabyrinthConfig("trail-scout", 3)
    );
    expect(ordinary).not.toHaveProperty("gateWarden");
    expect(ordinary.gate).not.toHaveProperty("sealed");
  });

  it("rejects a wall without spending a turn", () => {
    const run = createRun("WALL-11");
    const blocked = MOVES.find(({ row, col }) => {
      const nextRow = run.explorer.row + row;
      const nextCol = run.explorer.col + col;
      return run.labyrinth[nextRow]?.[nextCol] !== 1;
    });

    if (!blocked) {
      throw new Error("Expected the Explorer to start beside a wall");
    }
    const next = applyAction(run, { type: "move", direction: blocked.name });

    expect(next.explorer).toEqual(run.explorer);
    expect(next.wardens).toEqual(run.wardens);
    expect(next.moves).toBe(0);
    expect(next.lastDirection).toBeNull();
    expect(next.event.type).toBe("blocked");
  });

  it("moves through a passage and advances Wardens once", () => {
    const run = createRun("WARDEN-STEP-1");
    const next = applyAction(run, { type: "move", direction: "right" });
    const repeated = applyAction(run, { type: "move", direction: "right" });

    expect(next.explorer).toEqual({
      row: 1,
      col: 2,
      vitality: 3,
      maxVitality: 3
    });
    expect(next.moves).toBe(1);
    expect(next.lastDirection).toBe("right");
    expect(next.wardens).toEqual([
      { row: 9, col: 11, id: 0, mode: "patrol" },
      { row: 1, col: 6, id: 1, mode: "patrol" }
    ]);
    expect(repeated.wardens).toEqual(next.wardens);
  });

  it("makes a nearby Warden Hunt along the shortest passage path", () => {
    const run = createRun("HUNT-1", {
      echoCount: 0,
      size: 9,
      wardenCount: 1
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    /** @type {ReturnType<typeof createRun>} */
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 2 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 4, col: 6, id: 0, mode: "patrol" }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.explorer).toMatchObject({ row: 4, col: 3 });
    expect(next.wardens).toEqual([
      { row: 4, col: 5, id: 0, mode: "hunt" }
    ]);
  });

  it("makes an Intercept Warden anticipate the Explorer's direction", () => {
    const run = createRun("INTERCEPT-1", {
      echoCount: 0,
      size: 9,
      wardenCount: 1
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    /** @type {ReturnType<typeof createRun>} */
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 2 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 4, col: 7, id: 1, mode: "patrol" }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.lastDirection).toBe("right");
    expect(next.wardens).toEqual([
      { row: 4, col: 6, id: 1, mode: "intercept" }
    ]);
  });

  it("makes a distant Warden Patrol toward an uncollected Echo", () => {
    const run = createRun("PATROL-1", {
      echoCount: 1,
      size: 9,
      wardenCount: 1
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    /** @type {ReturnType<typeof createRun>} */
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 1, col: 1 },
      echoes: [{ row: 6, col: 2, collected: false }],
      gate: { row: 7, col: 7, open: false },
      wardens: [{ row: 6, col: 6, id: 0, mode: "patrol" }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.wardens).toEqual([
      { row: 6, col: 5, id: 0, mode: "patrol" }
    ]);
  });

  it("applies Echo Hush only to the Echo-collecting action", () => {
    const run = createRun("ECHO-HUSH-01", {
      echoCount: 1,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(1)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 1, col: 1 },
      echoes: [{ row: 1, col: 2, collected: false }],
      gate: { row: 7, col: 7, open: false },
      wardens: [{ row: 6, col: 6, id: 0, mode: /** @type {const} */ ("patrol") }]
    };

    const hush = applyAction(staged, { type: "move", direction: "right" });
    expect(hush.wardens).toEqual(staged.wardens);
    expect(hush.event).toMatchObject({
      type: "echo-collected",
      message: expect.stringContaining("Echo Hush")
    });

    const restored = applyAction(hush, { type: "move", direction: "right" });
    expect(restored.wardens).not.toEqual(hush.wardens);

    const classic = applyAction(
      {
        ...staged,
        ruleset: {
          atlasRegionId: "foundation",
          revision: "classic-v1",
          label: "Classic Rules"
        }
      },
      { type: "move", direction: "right" }
    );
    expect(classic.wardens).not.toEqual(staged.wardens);
  });

  it("travels one Windway as one Move before one Warden phase", () => {
    const run = createRun("WINDWAY-TRAVEL", {
      echoCount: 0,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(5)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 2 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 4, col: 7, id: 0, mode: /** @type {const} */ ("patrol") }],
      windways: [{
        source: { row: 4, col: 3 },
        destination: { row: 4, col: 4 },
        direction: /** @type {const} */ ("right")
      }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.explorer).toMatchObject({ row: 4, col: 4 });
    expect(next.moves).toBe(1);
    expect(next.event).toMatchObject({
      type: "windway-travel",
      message: expect.stringContaining("Windway")
    });
    expect(next.wardens).toEqual([
      { row: 4, col: 6, id: 0, mode: "hunt" }
    ]);
  });

  it("never chains Windways and rejects an invalid destination atomically", () => {
    const run = createRun("WINDWAY-ATOMIC", {
      echoCount: 0,
      size: 9,
      wardenCount: 1,
      ruleset: getQuestRunRuleset(5)
    });
    const openLabyrinth = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) =>
        row > 0 && row < 8 && col > 0 && col < 8 ? 1 : 0
      )
    );
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 4, col: 2 },
      gate: { row: 7, col: 7, open: true },
      wardens: [{ row: 6, col: 6, id: 0, mode: /** @type {const} */ ("patrol") }],
      windways: [
        {
          source: { row: 4, col: 3 },
          destination: { row: 4, col: 4 },
          direction: /** @type {const} */ ("right")
        },
        {
          source: { row: 4, col: 4 },
          destination: { row: 4, col: 5 },
          direction: /** @type {const} */ ("right")
        }
      ]
    };

    const traveled = applyAction(staged, {
      type: "move",
      direction: "right"
    });
    expect(traveled.explorer).toMatchObject({ row: 4, col: 4 });
    expect(traveled.moves).toBe(1);

    const invalid = applyAction(
      {
        ...staged,
        windways: [{
          source: { row: 4, col: 3 },
          destination: { row: 0, col: 0 },
          direction: /** @type {const} */ ("up")
        }]
      },
      { type: "move", direction: "right" }
    );
    expect(invalid.explorer).toEqual(staged.explorer);
    expect(invalid.moves).toBe(staged.moves);
    expect(invalid.wardens).toEqual(staged.wardens);
    expect(invalid.event).toMatchObject({
      type: "blocked",
      message: expect.stringContaining("Windway")
    });
  });

  it("keeps a Patrol Warden off a reserved Echo tile", () => {
    const run = createRun("PATROL-RESERVED", {
      echoCount: 1,
      size: 11,
      wardenCount: 1
    });
    const openLabyrinth = Array.from({ length: 11 }, (_, row) =>
      Array.from({ length: 11 }, (_, col) =>
        row > 0 && row < 10 && col > 0 && col < 10 ? 1 : 0
      )
    );
    /** @type {ReturnType<typeof createRun>} */
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 1, col: 1 },
      echoes: [{ row: 8, col: 2, collected: false }],
      gate: { row: 9, col: 9, open: false },
      wardens: [{ row: 8, col: 3, id: 0, mode: "patrol" }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.wardens[0].mode).toBe("patrol");
    expect(next.wardens[0]).toMatchObject({ row: 8, col: 3 });
    expect(next.wardens[0]).not.toMatchObject({ row: 8, col: 2 });
    expect(next.wardens[0]).not.toMatchObject({ row: 9, col: 9 });
  });

  it("keeps a Patrol Warden off the reserved Gate tile", () => {
    const run = createRun("PATROL-GATE", {
      echoCount: 0,
      size: 11,
      wardenCount: 1
    });
    const openLabyrinth = Array.from({ length: 11 }, (_, row) =>
      Array.from({ length: 11 }, (_, col) =>
        row > 0 && row < 10 && col > 0 && col < 10 ? 1 : 0
      )
    );
    /** @type {ReturnType<typeof createRun>} */
    const staged = {
      ...run,
      labyrinth: openLabyrinth,
      explorer: { ...run.explorer, row: 1, col: 1 },
      echoes: [],
      gate: { row: 8, col: 2, open: true },
      wardens: [{ row: 8, col: 3, id: 0, mode: "patrol" }]
    };

    const next = applyAction(staged, { type: "move", direction: "right" });

    expect(next.wardens).toEqual([
      { row: 8, col: 3, id: 0, mode: "patrol" }
    ]);
  });

  it("keeps previously revealed Fog visible after normal movement", () => {
    const run = createRun("FOG-19", { wardenCount: 0 });
    const revealedBefore = new Set(run.revealed);
    const move = openNeighbors(run, run.explorer)[0];
    const next = applyAction(run, { type: "move", direction: move.name });

    expect([...revealedBefore].every((key) => next.revealed.includes(key))).toBe(true);
    expect(next.revealed.length).toBeGreaterThanOrEqual(run.revealed.length);
  });

  it("uses Pulse once and reveals a temporary wider area", () => {
    const run = createRun("PULSE-05", {
      pulses: 1,
      wardenCount: 0
    });
    const next = applyAction(run, { type: "pulse" });

    expect(next.pulses).toBe(0);
    expect(next.moves).toBe(1);
    expect(next.pulseVisible.length).toBeGreaterThan(0);
    expect(next.event.type).toBe("pulse");
  });

  it("keeps the Gate locked until every Echo is recovered", () => {
    let run = createRun("ONE-ECHO-9", {
      echoCount: 1,
      size: 9,
      wardenCount: 0
    });
    const pathToGate = pathBetween(run, run.explorer, run.gate);
    const gateDirection = pathToGate.at(-1);
    const gateMove = MOVES.find((move) => move.name === gateDirection);
    if (!gateDirection || !gateMove) {
      throw new Error("Expected a final move into the Gate");
    }
    const stagedAtGate = {
      ...run,
      explorer: {
        ...run.explorer,
        row: run.gate.row - gateMove.row,
        col: run.gate.col - gateMove.col
      }
    };
    const lockedVisit = applyAction(stagedAtGate, {
      type: "move",
      direction: gateDirection
    });

    expect(lockedVisit.status).toBe("active");
    expect(lockedVisit.gate.open).toBe(false);

    run = createRun("ONE-ECHO-9", {
      echoCount: 1,
      size: 9,
      wardenCount: 0
    });
    run = follow(run, pathBetween(run, run.explorer, run.echoes[0]));
    expect(run.echoes[0].collected).toBe(true);
    expect(run.gate.open).toBe(true);
    expect(run.score).toBe(50);

    run = follow(run, pathBetween(run, run.explorer, run.gate));
    expect(run.status).toBe("won");
    expect(run.event.type).toBe("escaped");
    expect(run.score).toBe(550);
  });

  it("announces that the milestone Gate is open but sealed after the final Echo", () => {
    let run = createRun("SEALED-ECHO-4", {
      echoCount: 1,
      gateWarden: true,
      size: 9,
      wardenCount: 1
    });

    run = follow(run, pathBetween(run, run.explorer, run.echoes[0]));

    expect(run.gate).toMatchObject({ open: true, sealed: true });
    expect(run.event.message).toContain("Gate is open but sealed");
    expect(run.event.message).toContain("Gate Warden");
  });

  it("starts a paused Gate Warden Challenge when a sealed open Gate is attempted", () => {
    const run = createRun("SEALED-GATE-4", {
      echoCount: 0,
      gateWarden: true,
      size: 9,
      wardenCount: 2
    });
    const pathToGate = pathBetween(run, run.explorer, run.gate);
    const gateDirection = pathToGate.at(-1);
    const gateMove = MOVES.find((move) => move.name === gateDirection);
    if (!gateDirection || !gateMove) {
      throw new Error("Expected a final move into the sealed Gate");
    }
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: run.gate.row - gateMove.row,
        col: run.gate.col - gateMove.col
      }
    };

    const challenged = applyAction(staged, {
      type: "move",
      direction: gateDirection
    });

    expect(challenged.status).toBe("challenge");
    expect(challenged.explorer).toEqual(staged.explorer);
    expect(challenged.moves).toBe(staged.moves + 1);
    expect(challenged.wardens).toEqual(staged.wardens);
    expect(challenged.challenge).toEqual({
      kind: "gate-warden",
      wardenId: staged.gateWarden?.id,
      question: null,
      attempt: 0,
      feedback: null,
      hintRevealed: false
    });
    expect(challenged.event.type).toBe("gate-warden-challenge");
  });

  it("keeps the milestone Gate locked without starting its Warden before all Echoes", () => {
    const run = createRun("LOCKED-MILESTONE-4", {
      echoCount: 1,
      gateWarden: true,
      size: 9,
      wardenCount: 1
    });
    const gateDirection = pathBetween(run, run.explorer, run.gate).at(-1);
    const gateMove = MOVES.find((move) => move.name === gateDirection);
    if (!gateDirection || !gateMove) {
      throw new Error("Expected a final move toward the locked Gate");
    }
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: run.gate.row - gateMove.row,
        col: run.gate.col - gateMove.col
      }
    };

    const visited = applyAction(staged, {
      type: "move",
      direction: gateDirection
    });

    expect(visited.status).toBe("active");
    expect(visited.challenge).toBeNull();
    expect(visited.gate).toMatchObject({ open: false, sealed: true });
    expect(visited.event.type).toBe("gate-locked");
  });

  it("unseals the Gate after the Gate Warden is answered, then escapes on the next move", () => {
    const run = createRun("UNSEAL-GATE-4", {
      echoCount: 0,
      gateWarden: true,
      size: 9,
      wardenCount: 2
    });
    const gateDirection = pathBetween(run, run.explorer, run.gate).at(-1);
    const gateMove = MOVES.find((move) => move.name === gateDirection);
    if (!gateDirection || !gateMove) {
      throw new Error("Expected a final move into the sealed Gate");
    }
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: run.gate.row - gateMove.row,
        col: run.gate.col - gateMove.col
      }
    };
    let challenged = applyAction(staged, {
      type: "move",
      direction: gateDirection
    });
    challenged = applyAction(challenged, {
      type: "provide-question",
      question: QUESTION
    });

    const answered = applyAction(challenged, {
      type: "answer-question",
      answerId: QUESTION.answerId
    });

    expect(answered.status).toBe("active");
    expect(answered.challenge).toBeNull();
    expect(answered.gate).toMatchObject({ open: true, sealed: false });
    expect(answered.gateWarden).toEqual({ id: 1, defeated: true });
    expect(answered.wardens).toEqual(staged.wardens);
    expect(answered.pulses).toBe(staged.pulses + 1);
    expect(answered.score).toBe(100);
    expect(answered.wardensDefeated).toBe(1);
    expect(answered.event.type).toBe("gate-warden-defeated");

    const escaped = applyAction(answered, {
      type: "move",
      direction: gateDirection
    });
    expect(escaped.status).toBe("won");
    expect(escaped.score).toBe(600);
  });

  it("keeps the Gate sealed while wrong answers, Hints, and Skips use normal rules", () => {
    const run = createRun("GATE-RETRY-4", {
      echoCount: 0,
      gateWarden: true,
      vitality: 3,
      wardenCount: 2
    });
    const challenged = {
      ...run,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        kind: /** @type {const} */ ("gate-warden"),
        wardenId: run.gateWarden?.id ?? -1,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    const wrong = applyAction(challenged, {
      type: "answer-question",
      answerId: "a"
    });
    expect(wrong.status).toBe("challenge");
    expect(wrong.challenge?.kind).toBe("gate-warden");
    expect(wrong.explorer.vitality).toBe(2);
    expect(wrong.gate.sealed).toBe(true);

    let retried = applyAction(wrong, {
      type: "provide-question",
      question: QUESTION
    });
    retried = applyAction(retried, { type: "reveal-hint" });
    expect(retried.challenge?.kind).toBe("gate-warden");
    expect(retried.challenge?.hintRevealed).toBe(true);
    expect(retried.explorer.vitality).toBe(2);

    const skipped = applyAction(retried, { type: "skip-question" });
    expect(skipped.challenge?.kind).toBe("gate-warden");
    expect(skipped.challenge?.question).toBeNull();
    expect(skipped.freeQuestionSkipAvailable).toBe(false);
    expect(skipped.explorer.vitality).toBe(2);
    expect(skipped.gate.sealed).toBe(true);
  });

  it("ends the Run with the milestone Gate still sealed after final Vitality", () => {
    const run = createRun("GATE-LAST-LIGHT-4", {
      echoCount: 0,
      gateWarden: true,
      vitality: 1,
      wardenCount: 1
    });
    const challenged = {
      ...run,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        kind: /** @type {const} */ ("gate-warden"),
        wardenId: run.gateWarden?.id ?? -1,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    const lost = applyAction(challenged, {
      type: "answer-question",
      answerId: "a"
    });

    expect(lost.status).toBe("lost");
    expect(lost.explorer.vitality).toBe(0);
    expect(lost.gate.sealed).toBe(true);
    expect(lost.gateWarden?.defeated).toBe(false);
  });

  it("freezes elapsed time while paused", () => {
    let run = createRun("PAUSE-13");
    run = applyAction(run, { type: "pause" });
    run = applyAction(run, { type: "tick", deltaMs: 800 });
    expect(run.elapsedMs).toBe(0);

    run = applyAction(run, { type: "pause" });
    run = applyAction(run, { type: "tick", deltaMs: 800 });
    expect(run.elapsedMs).toBe(800);
  });

  it("restarts the same seed through the public action interface", () => {
    const original = createRun("RETURN-41", { wardenCount: 0 });
    const move = openNeighbors(original, original.explorer)[0];
    let changed = applyAction(original, { type: "move", direction: move.name });
    changed = applyAction(changed, { type: "pulse" });
    changed = applyAction(changed, { type: "tick", deltaMs: 1500 });

    expect(applyAction(changed, { type: "restart" })).toEqual(original);
  });

  it("starts a Warden Challenge without immediate damage or relocation", () => {
    const run = createRun("BRUISED-17", {
      vitality: 2,
      wardenCount: 1
    });
    const warden = run.wardens[0];
    const approach = openNeighbors(run, warden)[0];
    const direction = MOVES.find(
      (move) => move.row === -approach.row && move.col === -approach.col
    );
    if (!direction) {
      throw new Error("Expected an approach direction toward the Warden");
    }
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: warden.row + approach.row,
        col: warden.col + approach.col
      }
    };

    const challenged = applyAction(staged, {
      type: "move",
      direction: direction.name
    });

    expect(challenged.status).toBe("challenge");
    expect(challenged.explorer.vitality).toBe(2);
    expect(challenged.wardens[0]).toEqual(warden);
    expect(challenged.challenge).toEqual({
      wardenId: warden.id,
      question: null,
      attempt: 0,
      feedback: null,
      hintRevealed: false
    });
    expect(challenged.event.type).toBe("challenge-started");
  });

  it("defeats the encountered Warden after a correct answer", () => {
    const run = createRun("KNOWLEDGE-WINS", {
      vitality: 2,
      wardenCount: 1
    });
    const warden = run.wardens[0];
    const approach = openNeighbors(run, warden)[0];
    const direction = MOVES.find(
      (move) => move.row === -approach.row && move.col === -approach.col
    );
    if (!direction) {
      throw new Error("Expected an approach direction toward the Warden");
    }
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: warden.row + approach.row,
        col: warden.col + approach.col
      }
    };
    let challenged = applyAction(staged, {
      type: "move",
      direction: direction.name
    });

    challenged = applyAction(challenged, {
      type: "provide-question",
      question: QUESTION
    });
    const answered = applyAction(challenged, {
      type: "answer-question",
      answerId: "b"
    });

    expect(answered.status).toBe("active");
    expect(answered.challenge).toBeNull();
    expect(answered.wardens).toEqual([]);
    expect(answered.explorer.vitality).toBe(2);
    expect(answered.pulses).toBe(run.pulses + 1);
    expect(answered.score).toBe(100);
    expect(answered.wardensDefeated).toBe(1);
    expect(answered.event.type).toBe("warden-defeated");
    expect(answered.event.message).toContain(QUESTION.explanation);
    expect(answered.event.message).toContain("1 Pulse");
    expect(answered.event.message).toContain("100 score");
  });

  it("keeps the Warden Challenge open with a fresh question after a wrong answer", () => {
    const run = createRun("TRY-AGAIN-12", {
      vitality: 3,
      wardenCount: 1
    });
    /** @type {ReturnType<typeof createRun>} */
    const challenged = {
      ...run,
      status: "challenge",
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    const answered = applyAction(challenged, {
      type: "answer-question",
      answerId: "a"
    });

    expect(answered.status).toBe("challenge");
    expect(answered.explorer.vitality).toBe(2);
    expect(answered.wardens).toEqual(run.wardens);
    expect(answered.challenge).toMatchObject({
      wardenId: run.wardens[0].id,
      question: null,
      attempt: 1,
      feedback: {
        kind: "wrong",
        explanation: QUESTION.explanation
      }
    });
    expect(answered.event.type).toBe("wrong-answer");

    const retried = applyAction(answered, {
      type: "provide-question",
      question: QUESTION
    });
    expect(retried.challenge?.feedback).toEqual(answered.challenge?.feedback);
  });

  it("locks movement, Pulse, and elapsed time during a Warden Challenge", () => {
    const run = createRun("CHALLENGE-LOCK-4", { wardenCount: 1 });
    /** @type {ReturnType<typeof createRun>} */
    const challenged = {
      ...run,
      status: "challenge",
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    expect(
      applyAction(challenged, { type: "move", direction: "right" })
    ).toEqual(challenged);
    expect(applyAction(challenged, { type: "pulse" })).toEqual(challenged);
    expect(
      applyAction(challenged, { type: "tick", deltaMs: 1500 })
    ).toEqual(challenged);
  });

  it("never lets Wardens occupy the same tile", () => {
    let run = createRun("S-7", {
      vitality: 999,
      wardenCount: 2
    });

    for (let turn = 0; turn < 240; turn += 1) {
      const moves = openNeighbors(run, run.explorer);
      run = applyAction(run, {
        type: "move",
        direction: moves[turn % moves.length].name
      });
      const occupied = run.wardens.map(tileKey);
      expect(new Set(occupied).size).toBe(occupied.length);
    }
  });

  it("ends the Run after a one-vitality Explorer answers incorrectly", () => {
    const run = createRun("LAST-LIGHT-27", {
      vitality: 1,
      wardenCount: 1
    });
    const warden = run.wardens[0];
    const approach = openNeighbors(run, warden)[0];
    const staged = {
      ...run,
      explorer: {
        ...run.explorer,
        row: warden.row + approach.row,
        col: warden.col + approach.col
      }
    };
    const direction = MOVES.find(
      (move) => move.row === -approach.row && move.col === -approach.col
    );
    if (!direction) {
      throw new Error("Expected an approach direction toward the Warden");
    }

    let challenged = applyAction(staged, {
      type: "move",
      direction: direction.name
    });
    challenged = applyAction(challenged, {
      type: "provide-question",
      question: QUESTION
    });
    const lost = applyAction(challenged, {
      type: "answer-question",
      answerId: "a"
    });

    expect(lost.explorer.vitality).toBe(0);
    expect(lost.status).toBe("lost");
    expect(lost.event.type).toBe("defeated");
  });

  it("reveals one free Hint without changing the Question or Vitality", () => {
    const run = createRun("HINT-17", { vitality: 3, wardenCount: 1 });
    const challenged = {
      ...run,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    const revealed = applyAction(challenged, { type: "reveal-hint" });

    expect(revealed.challenge?.hintRevealed).toBe(true);
    expect(revealed.challenge?.question).toEqual(QUESTION);
    expect(revealed.explorer.vitality).toBe(3);
    expect(applyAction(revealed, { type: "reveal-hint" })).toEqual(revealed);
  });

  it("grants one free Question Skip per Labyrinth", () => {
    const run = createRun("FREE-SKIP-17", { vitality: 3, wardenCount: 1 });
    const challenged = {
      ...run,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      }
    };

    const skipped = applyAction(challenged, { type: "skip-question" });

    expect(skipped.explorer.vitality).toBe(3);
    expect(skipped.freeQuestionSkipAvailable).toBe(false);
    expect(skipped.challenge).toMatchObject({
      question: null,
      attempt: 1,
      feedback: { kind: "skipped" },
      hintRevealed: false
    });
    expect(skipped.event.type).toBe("question-skipped-free");
  });

  it("charges Vitality for later Question Skips", () => {
    const run = createRun("PAID-SKIP-17", { vitality: 3, wardenCount: 1 });
    const challenged = {
      ...run,
      freeQuestionSkipAvailable: false,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 2,
        feedback: null,
        hintRevealed: false
      }
    };

    const skipped = applyAction(challenged, { type: "skip-question" });

    expect(skipped.explorer.vitality).toBe(2);
    expect(skipped.status).toBe("challenge");
    expect(skipped.challenge).toMatchObject({
      question: null,
      attempt: 3,
      feedback: { kind: "skipped" }
    });
    expect(skipped.event.type).toBe("question-skipped-paid");
  });

  it("loses when a paid Question Skip spends the final Vitality", () => {
    const run = createRun("FINAL-SKIP-17", { vitality: 1, wardenCount: 1 });
    const challenged = {
      ...run,
      freeQuestionSkipAvailable: false,
      status: /** @type {const} */ ("challenge"),
      challenge: {
        wardenId: run.wardens[0].id,
        question: QUESTION,
        attempt: 3,
        feedback: null,
        hintRevealed: false
      }
    };

    const lost = applyAction(challenged, { type: "skip-question" });

    expect(lost.explorer.vitality).toBe(0);
    expect(lost.status).toBe("lost");
    expect(lost.challenge).toBeNull();
    expect(lost.event.type).toBe("defeated");
  });
});
