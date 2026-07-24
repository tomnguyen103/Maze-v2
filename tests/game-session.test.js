import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";

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
 * @param {TestDirection[]} moves
 */
function follow(run, moves) {
  return moves.reduce(
    (current, direction) => applyAction(current, { type: "move", direction }),
    run
  );
}

describe("GameSession", () => {
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
  });

  it("creates different labyrinths from distinct known seeds", () => {
    const first = createRun("EMBER-17");
    const second = createRun("EMBER-18");
    /** @param {TestRun} run */
    const fingerprint = (run) =>
      run.labyrinth.map((row) => row.join("")).join("/");

    expect(fingerprint(first)).not.toBe(fingerprint(second));
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

    run = follow(run, pathBetween(run, run.explorer, run.gate));
    expect(run.status).toBe("won");
    expect(run.event.type).toBe("escaped");
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

  it("damages the Explorer and relocates a Warden after nonfatal contact", () => {
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

    const hurt = applyAction(staged, {
      type: "move",
      direction: direction.name
    });

    expect(hurt.status).toBe("active");
    expect(hurt.explorer.vitality).toBe(1);
    expect(tileKey(hurt.wardens[0])).not.toBe(tileKey(warden));
    expect(hurt.event.type).toBe("hurt");
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

  it("ends the run when a one-vitality Explorer enters a Warden tile", () => {
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

    const lost = applyAction(staged, {
      type: "move",
      direction: direction.name
    });

    expect(lost.explorer.vitality).toBe(0);
    expect(lost.status).toBe("lost");
    expect(lost.event.type).toBe("defeated");
  });
});
