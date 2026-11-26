// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeCompassAction,
  describeCompassState,
  describeListenTargets,
  createTrailCompass
} from "../src/game/trail-compass.js";
import { createRun, applyAction } from "../src/game/game-session.js";
import {
  getClassicRunRuleset,
  getQuestRunRuleset
} from "../src/game/run-ruleset.js";

/** @param {Record<string, unknown>} [input] */
function runFixture(input = {}) {
  return createRun("compass-seed-1", {
    size: 9,
    echoCount: 3,
    wardenCount: 2,
    ...input
  });
}

describe("Trail Compass descriptions", () => {
  it("describes the current tile, legal revealed exits, and resources", () => {
    const run = runFixture();
    const text = describeCompassState(run);
    expect(text).toContain(
      `row ${run.explorer.row + 1}, column ${run.explorer.col + 1}`
    );
    expect(text).toMatch(/Exits?:/);
    expect(text).toContain(`Vitality ${run.explorer.vitality}`);
    expect(text).toContain(`Pulses ${run.pulses}`);
  });

  it("never describes a Fog-hidden Echo, Warden, or Gate", () => {
    const run = runFixture();
    const revealed = new Set([...run.revealed, ...run.pulseVisible]);
    const hiddenEchoes = run.echoes.filter(
      (echo) => !revealed.has(`${echo.row},${echo.col}`)
    );
    const hiddenWardens = run.wardens.filter(
      (warden) => !revealed.has(`${warden.row},${warden.col}`)
    );
    const gateHidden = !revealed.has(`${run.gate.row},${run.gate.col}`);
    // The fixture must actually have hidden state for this test to bite.
    expect(hiddenEchoes.length + hiddenWardens.length).toBeGreaterThan(0);
    const text = describeCompassState(run);
    for (const echo of hiddenEchoes) {
      expect(text).not.toContain(
        `row ${echo.row + 1}, column ${echo.col + 1}`
      );
    }
    for (const warden of hiddenWardens) {
      expect(text).not.toContain(
        `row ${warden.row + 1}, column ${warden.col + 1}`
      );
    }
    if (gateHidden) {
      expect(text).not.toMatch(/Gate/);
    }
    expect(describeListenTargets(run).every((target) =>
      ["echo", "gate", "warden"].includes(target.kind)
    )).toBe(true);
    for (const target of describeListenTargets(run)) {
      expect(revealed.has(target.key)).toBe(true);
    }
  });

  it("describes each Trail Twist state without leaking hidden geometry", () => {
    for (const [atlasRegionId, revision] of [
      ["foundation", "echo-hush-v1"],
      ["developing", "windways-v2"],
      ["capable", "echo-bridges-v1"],
      ["advanced", "tide-doors-v1"],
      ["mastery", "warden-bells-v1"]
    ]) {
      const run = runFixture({
        ruleset: { atlasRegionId, revision }
      });
      const text = describeCompassState(run);
      expect(typeof text).toBe("string");
      if (revision === "tide-doors-v1" && run.tideDoors.length > 0) {
        expect(text).toMatch(/Tide Doors/);
      }
      if (revision === "echo-hush-v1") {
        expect(text).toMatch(/Echo Hush/);
      }
    }
  });

  it("summarizes one action result in one concise status", () => {
    const run = runFixture();
    const moved = applyAction(run, { type: "move", direction: "right" });
    const status = describeCompassAction(moved);
    expect(typeof status).toBe("string");
    expect(status.length).toBeGreaterThan(0);
    expect(status.length).toBeLessThan(240);
    expect(status.split("\n")).toHaveLength(1);
  });
});

describe("Trail Compass controller", () => {
  it("describes on demand, listens on demand, and dispatches no Run action", async () => {
    document.body.innerHTML = `
      <div id="trail-compass" hidden>
        <button id="compass-describe" type="button">Describe Trail</button>
        <button id="compass-listen" type="button">Listen</button>
      </div>
    `;
    let run = runFixture();
    const announce = vi.fn();
    const playCue = vi.fn();
    const compass = createTrailCompass({
      getRun: () => run,
      announce,
      playCue
    });
    expect(document.getElementById("trail-compass")?.hidden).toBe(false);

    document.getElementById("compass-describe")?.click();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(String(announce.mock.calls[0][0])).toContain("row");

    // Tones follow revealed entities and an explicit Listen press, never the
    // press alone and never automatically. Nothing is revealed in this Run, so
    // Listen says so and still plays nothing. Asserted as an exact absence:
    // `toBeGreaterThanOrEqual(0)` could not have failed either way.
    expect(playCue).not.toHaveBeenCalled();
    document.getElementById("compass-listen")?.click();
    expect(announce).toHaveBeenCalledTimes(2);
    expect(String(announce.mock.calls[1][0])).toContain("Nothing revealed");
    expect(playCue).not.toHaveBeenCalled();

    const before = JSON.stringify(run);
    compass.onTransition(run);
    expect(JSON.stringify(run)).toBe(before);
    expect(announce).toHaveBeenCalledTimes(3);
  });
});

/** @type {readonly [string, "up" | "right" | "down" | "left", number, number][]} */
const COMPASS_DIRECTIONS = Object.freeze([
  ["north", "up", -1, 0],
  ["east", "right", 0, 1],
  ["south", "down", 1, 0],
  ["west", "left", 0, -1]
]);

/**
 * The named exit for one Compass direction, or null when the Compass names none.
 *
 * @param {string} statement
 * @param {string} name
 */
function namedExit(statement, name) {
  const exits = statement.match(/Exits: (.*?)\.(?: [A-Z]|$)/)?.[1] ?? "";
  return exits.split("; ").find((exit) => exit.startsWith(`${name} `)) ?? null;
}

/**
 * A Run with its first shortcut open and the Explorer on its `from` end.
 *
 * @param {"echo-bridges-v1" | "tide-doors-v1"} revision
 * @param {"capable" | "advanced"} atlasRegionId
 */
function openShortcutFixture(revision, atlasRegionId) {
  const run = structuredClone(
    runFixture({ ruleset: { atlasRegionId, revision } })
  );
  const shortcuts =
    revision === "echo-bridges-v1" ? run.echoBridges : run.tideDoors;
  expect(shortcuts.length).toBeGreaterThan(0);
  for (const shortcut of shortcuts) {
    shortcut.open = true;
  }
  const [shortcut] = shortcuts;
  run.explorer = { ...run.explorer, row: shortcut.from.row, col: shortcut.from.col };
  const rowStep = (shortcut.to.row - shortcut.from.row) / 2;
  const colStep = (shortcut.to.col - shortcut.from.col) / 2;
  const direction = COMPASS_DIRECTIONS.find(
    ([, , row, col]) => row === rowStep && col === colStep
  );
  if (!direction) {
    throw new Error("The fixture shortcut is not straight across one wall.");
  }
  return { run, shortcut, direction };
}

describe("Trail Compass exits match the engine", () => {
  it("names an open shortcut as an exit", () => {
    for (const [revision, atlasRegionId, eventType] of /** @type {const} */ ([
      ["echo-bridges-v1", "capable", "echo-bridge-travel"],
      ["tide-doors-v1", "advanced", "tide-door-travel"]
    ])) {
      const { run, shortcut, direction } = openShortcutFixture(
        revision,
        atlasRegionId
      );
      const [name, engineDirection] = direction;
      expect(namedExit(describeCompassState(run), name)).toBe(
        `${name} open through a shortcut`
      );
      expect(describeCompassAction(run)).toContain(name);
      const moved = applyAction(run, {
        type: "move",
        direction: engineDirection
      });
      expect(moved.event.type).toBe(eventType);
      expect({ row: moved.explorer.row, col: moved.explorer.col }).toEqual({
        row: shortcut.to.row,
        col: shortcut.to.col
      });
    }
  });

  it("every named exit agrees with the engine", () => {
    const rulesets = [
      getClassicRunRuleset(1),
      ...[1, 5, 9, 13, 17].map((labyrinthNumber) =>
        getQuestRunRuleset(labyrinthNumber)
      )
    ];
    expect(new Set(rulesets.map((ruleset) => ruleset.revision)).size).toBe(6);
    /** @type {Record<string, number>} */
    const shortcutMoves = { "echo-bridges-v1": 0, "tide-doors-v1": 0 };
    let windwayBackHere = 0;
    let windwayCarries = 0;
    for (const ruleset of rulesets) {
      for (const size of [9, 13]) {
        for (let seed = 0; seed < 20; seed += 1) {
          // Wardens never change which tiles a Move reaches, so the sweep
          // removes them and no Warden challenge ends the walk early.
          /** @type {import("../src/game/game-session.js").GameRun} */
          let run = structuredClone({
            ...createRun(`compass-sweep-${seed}`, {
              size,
              echoCount: 3,
              wardenCount: 2,
              ruleset
            }),
            wardens: []
          });
          // Open every shortcut on the Run copy, as US-01.1 does, so the
          // walk meets open Echo Bridges and Tide Doors.
          for (const shortcut of [...run.echoBridges, ...run.tideDoors]) {
            shortcut.open = true;
          }
          /** @type {Map<string, number>} */
          const visits = new Map([[`${run.explorer.row},${run.explorer.col}`, 1]]);
          for (let step = 0; step < 60 && run.status === "active"; step += 1) {
            const statement = describeCompassState(run);
            const legal = [];
            for (const [name, engineDirection] of COMPASS_DIRECTIONS) {
              const exit = namedExit(statement, name);
              const moved = applyAction(run, {
                type: "move",
                direction: engineDirection
              });
              const blocked = moved.event.type === "blocked";
              const context = `${ruleset.revision} size ${size} seed ${seed} step ${step} ${name}: ${exit}`;
              if (exit === null) {
                expect(blocked, context).toBe(true);
              } else if (!exit.endsWith("unexplored")) {
                expect(blocked, context).toBe(false);
              }
              if (
                moved.event.type === "echo-bridge-travel" ||
                moved.event.type === "tide-door-travel"
              ) {
                shortcutMoves[ruleset.revision] += 1;
                expect(exit, context).toBe(`${name} open through a shortcut`);
              }
              if (exit?.includes("Windway")) {
                expect(exit, context).not.toContain(
                  `row ${run.explorer.row + 1}, column ${run.explorer.col + 1}`
                );
                if (exit.includes("back here")) {
                  windwayBackHere += 1;
                  expect(moved.explorer.row, context).toBe(run.explorer.row);
                  expect(moved.explorer.col, context).toBe(run.explorer.col);
                } else {
                  const target = exit.match(/row (\d+), column (\d+)$/);
                  expect(target, context).not.toBeNull();
                  windwayCarries += 1;
                  expect(
                    { row: moved.explorer.row + 1, col: moved.explorer.col + 1 },
                    context
                  ).toEqual({ row: Number(target?.[1]), col: Number(target?.[2]) });
                }
              }
              if (!blocked) {
                legal.push(moved);
              }
            }
            if (legal.length === 0) {
              break;
            }
            // Take the least visited destination, so the walk covers the board.
            const visitCount = (/** @type {import("../src/game/game-session.js").GameRun} */ next) =>
              visits.get(`${next.explorer.row},${next.explorer.col}`) ?? 0;
            const fewest = Math.min(...legal.map(visitCount));
            const choices = legal.filter((next) => visitCount(next) === fewest);
            run = choices[(step + seed) % choices.length];
            const key = `${run.explorer.row},${run.explorer.col}`;
            visits.set(key, (visits.get(key) ?? 0) + 1);
          }
        }
      }
    }
    expect(shortcutMoves["echo-bridges-v1"]).toBeGreaterThan(0);
    expect(shortcutMoves["tide-doors-v1"]).toBeGreaterThan(0);
    expect(windwayCarries).toBeGreaterThan(0);
    expect(windwayBackHere).toBeGreaterThan(0);
  });
});

/**
 * A classic Run with fixed target positions around the Explorer at row 5,
 * column 5. Echoes come first in Run order and sit nearer than the Wardens.
 *
 * @param {string[] | null} revealedKeys every tile when null
 */
function listenFixture(revealedKeys) {
  const run = structuredClone(runFixture({ echoCount: 5, wardenCount: 2 }));
  run.explorer = { ...run.explorer, row: 4, col: 4 };
  const echoTiles = [[2, 4], [4, 5], [3, 4], [5, 4], [4, 3]];
  run.echoes = run.echoes.map((echo, index) => ({
    ...echo,
    row: echoTiles[index][0],
    col: echoTiles[index][1],
    collected: false
  }));
  run.gate = { ...run.gate, row: 0, col: 0 };
  // Run order puts the far Warden first, so nearest first must reorder them.
  run.wardens = [
    { ...run.wardens[0], row: 8, col: 8 },
    { ...run.wardens[1], row: 4, col: 7 }
  ];
  const size = run.labyrinth.length;
  run.revealed =
    revealedKeys ??
    Array.from({ length: size * size }, (_, index) =>
      `${Math.floor(index / size)},${index % size}`
    );
  run.pulseVisible = [];
  return run;
}

/** @param {() => import("../src/game/game-session.js").GameRun} getRun */
function compassController(getRun) {
  document.body.innerHTML = `
    <div id="trail-compass" hidden>
      <button id="compass-listen" type="button">Listen</button>
    </div>
  `;
  const announce = vi.fn();
  const playCue = vi.fn();
  const compass = createTrailCompass({ getRun, announce, playCue });
  return { compass, announce, playCue };
}

describe("Trail Compass Listen and Bell status", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Listen names revealed Wardens first, inside the cap", () => {
    // US-01.1: one revealed Warden and two revealed Echoes.
    const small = listenFixture(["4,4", "4,5", "3,4", "4,7"]);
    vi.useFakeTimers();
    const first = compassController(() => small);
    document.getElementById("compass-listen")?.click();
    vi.advanceTimersByTime(0);
    expect(first.playCue.mock.calls.map(([cue]) => cue)).toEqual(["compass-warden"]);
    vi.advanceTimersByTime(159);
    expect(first.playCue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(first.playCue).toHaveBeenCalledTimes(2);
    expect(String(first.announce.mock.calls[0][0])).toMatch(/^Listen: warden/);

    // US-01.2: more than 6 revealed targets, Echoes first in Run order.
    const run = listenFixture(null);
    expect(describeListenTargets(run).length).toBeGreaterThan(6);
    const { announce, playCue } = compassController(() => run);
    document.getElementById("compass-listen")?.click();
    vi.runAllTimers();
    expect(playCue.mock.calls.map(([cue]) => cue)).toEqual([
      "compass-warden",
      "compass-warden",
      "compass-gate",
      "compass-echo",
      "compass-echo",
      "compass-echo"
    ]);
    expect(announce).toHaveBeenCalledWith(
      "Listen: warden 3 east; warden 4 south and 4 east; " +
        "gate 4 north and 4 west; echo 1 east; echo 1 north; echo 1 south."
    );
  });

  it("a new Listen, a Run change, or hide cancels queued tones", () => {
    vi.useFakeTimers();
    const run = listenFixture(null);
    const { compass, playCue } = compassController(() => run);
    const listen = () => document.getElementById("compass-listen")?.click();

    listen();
    vi.advanceTimersByTime(200);
    expect(playCue).toHaveBeenCalledTimes(2);
    listen();
    vi.runAllTimers();
    // 2 tones from the first press, then all 6 from the second press only.
    expect(playCue).toHaveBeenCalledTimes(8);
    expect(playCue.mock.calls[2][0]).toBe("compass-warden");

    playCue.mockClear();
    listen();
    vi.advanceTimersByTime(0);
    compass.onTransition(run);
    vi.runAllTimers();
    expect(playCue).toHaveBeenCalledTimes(1);

    playCue.mockClear();
    listen();
    vi.advanceTimersByTime(0);
    compass.hide();
    vi.runAllTimers();
    expect(playCue).toHaveBeenCalledTimes(1);
  });

  it("says every Signal Bell has rung", () => {
    const run = structuredClone(
      runFixture({ ruleset: { atlasRegionId: "mastery", revision: "warden-bells-v1" } })
    );
    expect(run.signalBells.length).toBeGreaterThan(0);
    run.signalBells = run.signalBells.map((bell) => ({ ...bell, spent: true }));
    const text = describeCompassState(run);
    expect(text).toContain("Every Signal Bell has rung.");
    expect(text).not.toContain("wait elsewhere");

    // One unspent Bell, three steps from the Explorer, is not beside it.
    run.signalBells[0] = {
      ...run.signalBells[0],
      row: run.explorer.row + 3,
      col: run.explorer.col,
      spent: false
    };
    expect(describeCompassState(run)).toContain("Signal Bells wait elsewhere");

    run.signalBells = [];
    expect(describeCompassState(run)).not.toContain("Every Signal Bell has rung.");
  });

  it("a Ring Bell with no Bell says so", () => {
    const action = /** @type {const} */ ({ type: "ring-bell" });
    const bellRun = structuredClone(
      runFixture({ ruleset: { atlasRegionId: "mastery", revision: "warden-bells-v1" } })
    );
    const spentBells = structuredClone(bellRun);
    spentBells.signalBells = spentBells.signalBells.map((bell) => ({
      ...bell,
      spent: true
    }));
    for (const previous of [spentBells, structuredClone(runFixture())]) {
      previous.event = { type: "echo-collected", message: "Echo recovered. 2 remain." };
      const next = applyAction(previous, action);
      const { compass, announce } = compassController(() => next);
      compass.onTransition(next, previous, action);
      expect(announce).toHaveBeenCalledWith("No Signal Bell is beside you.");
      expect(String(announce.mock.calls[0][0])).not.toContain("Echo recovered");
    }

    // A real ring still announces the engine event.
    const ready = structuredClone(bellRun);
    const beside = ready.explorer.row > 0
      ? { row: ready.explorer.row - 1, col: ready.explorer.col }
      : { row: ready.explorer.row + 1, col: ready.explorer.col };
    ready.signalBells[0] = { ...ready.signalBells[0], ...beside, spent: false };
    const rung = applyAction(ready, action);
    expect(rung.event.type).toBe("signal-bell-rung");
    const { compass, announce } = compassController(() => rung);
    compass.onTransition(rung, ready, action);
    expect(String(announce.mock.calls[0][0])).toContain(rung.event.message);
  });
});
