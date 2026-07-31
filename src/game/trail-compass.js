/**
 * Revealed Path Compass (player label: Trail Compass) — a presentation-only
 * nonvisual description layer over the canonical Run state. It reads exactly
 * what the canvas renderer draws: the revealed and pulse-visible tiles, the
 * windway pair rule, and the always-visible Trail Twist fixtures. It never
 * touches deterministic Run state and never describes Fog-hidden entities,
 * shortcuts, timing, or pathfinding.
 *
 * @typedef {import("./game-session.js").GameRun} GameRun
 */

const DIRECTIONS = Object.freeze([
  Object.freeze({ name: "north", row: -1, col: 0 }),
  Object.freeze({ name: "east", row: 0, col: 1 }),
  Object.freeze({ name: "south", row: 1, col: 0 }),
  Object.freeze({ name: "west", row: 0, col: -1 })
]);

/** @param {GameRun} run */
function revealedTiles(run) {
  const revealed = new Set([...run.revealed, ...run.pulseVisible]);
  // Renderer parity: a windway pair reveals as one unit.
  for (const windway of run.windways) {
    const sourceKey = `${windway.source.row},${windway.source.col}`;
    const destinationKey =
      `${windway.destination.row},${windway.destination.col}`;
    if (revealed.has(sourceKey) || revealed.has(destinationKey)) {
      revealed.add(sourceKey);
      revealed.add(destinationKey);
    }
  }
  return revealed;
}

/**
 * @param {GameRun} run
 * @param {{ row: number, col: number }} from
 * @param {{ row: number, col: number }} to
 */
function openShortcut(run, from, to) {
  const matches = (
    /** @type {{ from: { row: number, col: number }, to: { row: number, col: number }, open: boolean }} */ edge
  ) =>
    edge.open &&
    ((edge.from.row === from.row &&
      edge.from.col === from.col &&
      edge.to.row === to.row &&
      edge.to.col === to.col) ||
      (edge.to.row === from.row &&
        edge.to.col === from.col &&
        edge.from.row === to.row &&
        edge.from.col === to.col));
  return (
    run.echoBridges.some((bridge) => matches(bridge)) ||
    run.tideDoors.some((door) => matches(door))
  );
}

/**
 * Describe one adjacent direction from what the Explorer can already see.
 *
 * @param {GameRun} run
 * @param {Set<string>} revealed
 * @param {{ name: string, row: number, col: number }} direction
 */
function describeExit(run, revealed, direction) {
  const size = run.labyrinth.length;
  const row = run.explorer.row + direction.row;
  const col = run.explorer.col + direction.col;
  if (row < 0 || col < 0 || row >= size || col >= size) {
    return null;
  }
  const key = `${row},${col}`;
  const shortcut = openShortcut(run, run.explorer, { row, col });
  if (!revealed.has(key) && !shortcut) {
    return `${direction.name} unexplored`;
  }
  if (run.labyrinth[row][col] !== 1 && !shortcut) {
    return null;
  }
  const windway = run.windways.find(
    (candidate) =>
      candidate.source.row === row && candidate.source.col === col
  );
  if (windway) {
    return (
      `${direction.name} onto a Windway carrying you to ` +
      `row ${windway.destination.row + 1}, column ${windway.destination.col + 1}`
    );
  }
  return `${direction.name} open${shortcut ? " through a shortcut" : ""}`;
}

/**
 * @param {GameRun} run
 * @param {{ row: number, col: number }} target
 */
function directionAndDistance(run, target) {
  const rowDelta = target.row - run.explorer.row;
  const colDelta = target.col - run.explorer.col;
  const parts = [];
  if (rowDelta !== 0) {
    parts.push(`${Math.abs(rowDelta)} ${rowDelta > 0 ? "south" : "north"}`);
  }
  if (colDelta !== 0) {
    parts.push(`${Math.abs(colDelta)} ${colDelta > 0 ? "east" : "west"}`);
  }
  return parts.length === 0 ? "here" : parts.join(" and ");
}

/**
 * Everything the Listen tones may indicate: only already-revealed Echoes,
 * the Gate, and Wardens, each with its revealed direction.
 *
 * @param {GameRun} run
 */
export function describeListenTargets(run) {
  const revealed = revealedTiles(run);
  /** @type {{ kind: "echo" | "gate" | "warden", key: string, where: string }[]} */
  const targets = [];
  for (const echo of run.echoes) {
    const key = `${echo.row},${echo.col}`;
    if (!echo.collected && revealed.has(key)) {
      targets.push({ kind: "echo", key, where: directionAndDistance(run, echo) });
    }
  }
  const gateKey = `${run.gate.row},${run.gate.col}`;
  if (revealed.has(gateKey)) {
    targets.push({
      kind: "gate",
      key: gateKey,
      where: directionAndDistance(run, run.gate)
    });
  }
  for (const warden of run.wardens) {
    const key = `${warden.row},${warden.col}`;
    if (revealed.has(key)) {
      targets.push({
        kind: "warden",
        key,
        where: directionAndDistance(run, warden)
      });
    }
  }
  return targets;
}

/**
 * The full Describe Trail statement: current tile, resources, legal revealed
 * exits, revealed entities, and the active Trail Twist state.
 *
 * @param {GameRun} run
 */
export function describeCompassState(run) {
  const revealed = revealedTiles(run);
  const sentences = [];
  sentences.push(
    `You are at row ${run.explorer.row + 1}, column ${run.explorer.col + 1}.`
  );
  const remainingEchoes = run.echoes.filter((echo) => !echo.collected).length;
  sentences.push(
    `Vitality ${run.explorer.vitality} of ${run.explorer.maxVitality}, ` +
      `Pulses ${run.pulses}, ${remainingEchoes} Echoes remain.`
  );
  const exits = DIRECTIONS.map((direction) =>
    describeExit(run, revealed, direction)
  ).filter((exit) => exit !== null);
  sentences.push(exits.length ? `Exits: ${exits.join("; ")}.` : "No open exits.");

  const visibleEchoes = run.echoes.filter(
    (echo) => !echo.collected && revealed.has(`${echo.row},${echo.col}`)
  );
  for (const echo of visibleEchoes) {
    sentences.push(`An Echo shimmers ${directionAndDistance(run, echo)}.`);
  }
  if (revealed.has(`${run.gate.row},${run.gate.col}`)) {
    const state = run.gate.sealed
      ? "sealed by the Gate Warden"
      : run.gate.open
        ? "open"
        : "waiting for every Echo";
    sentences.push(
      `The Gate is ${directionAndDistance(run, run.gate)}, ${state}.`
    );
  }
  for (const warden of run.wardens) {
    if (revealed.has(`${warden.row},${warden.col}`)) {
      sentences.push(
        `A Warden on ${warden.mode} duty is ` +
          `${directionAndDistance(run, warden)}.`
      );
    }
  }

  const revision = run.ruleset.revision;
  if (revision === "echo-hush-v1") {
    sentences.push(
      "Echo Hush: collecting an Echo stills ordinary Wardens for one action."
    );
  }
  if (revision === "tide-doors-v1" && run.tideDoors.length > 0) {
    sentences.push(
      `Tide Doors are ${run.tideDoors[0].open ? "open" : "sealed"} this beat.`
    );
  }
  if (revision === "echo-bridges-v1") {
    const open = run.echoBridges.filter((bridge) => bridge.open).length;
    sentences.push(
      `Echo Bridges opened: ${open} of ${run.echoBridges.length}.`
    );
  }
  if (revision === "warden-bells-v1") {
    const adjacent = run.signalBells.some(
      (bell) =>
        !bell.spent &&
        Math.abs(bell.row - run.explorer.row) +
          Math.abs(bell.col - run.explorer.col) ===
          1
    );
    sentences.push(
      adjacent
        ? "A Signal Bell is beside you — Ring Bell is ready."
        : "Signal Bells wait elsewhere in this Labyrinth."
    );
  }
  return sentences.join(" ");
}

/**
 * One concise polite status for the action that just resolved.
 *
 * @param {GameRun} run
 */
export function describeCompassAction(run) {
  const revealed = revealedTiles(run);
  const exits = DIRECTIONS.map((direction) =>
    describeExit(run, revealed, direction)
  )
    .filter((exit) => exit !== null && !exit.includes("unexplored"))
    .map((exit) => String(exit).split(" ")[0]);
  const event = run.event?.message ? `${run.event.message} ` : "";
  const place = `At row ${run.explorer.row + 1}, column ${run.explorer.col + 1}.`;
  const exitNote = exits.length ? ` Open: ${exits.join(", ")}.` : "";
  // Warden mode is on screen for a sighted Explorer at all times, so a
  // nonvisual Run has to carry it too. It rides this one status rather than
  // becoming a second announcement, and it is derived from the Run's own
  // Wardens — revealed state only, nothing Fog-hidden.
  return `${event}${place}${exitNote} ${wardenModeNote(run)}`.trim();
}

/**
 * @param {GameRun} run
 */
function wardenModeNote(run) {
  if (run.wardens.length === 0) {
    return "Warden mode: Path clear.";
  }
  const modes = run.wardens.map((warden) => warden.mode);
  if (modes.includes("lured")) {
    return "Warden mode: Lured to Bell.";
  }
  if (modes.includes("intercept")) {
    return "Warden mode: Intercept active.";
  }
  if (modes.includes("hunt")) {
    return "Warden mode: Hunt active.";
  }
  return "Warden mode: Patrol.";
}

/**
 * Self-wiring controller for the Trail Compass panel. Describe and Listen
 * dispatch no Run action and write no log entry; each player action produces
 * exactly one polite status through the shared announce channel.
 *
 * @param {{
 *   getRun: () => GameRun | null | undefined,
 *   announce: (message: string) => void,
 *   playCue?: (cue: "compass-echo" | "compass-gate" | "compass-warden") => void,
 *   root?: Document
 * }} dependencies
 */
export function createTrailCompass({
  getRun,
  announce,
  playCue = () => {},
  root = document
}) {
  const panel = root.getElementById("trail-compass");
  if (panel) {
    panel.hidden = false;
  }
  root.getElementById("compass-describe")?.addEventListener("click", () => {
    const run = getRun();
    announce(run ? describeCompassState(run) : "No active Run to describe.");
  });
  root.getElementById("compass-listen")?.addEventListener("click", () => {
    const run = getRun();
    if (!run) {
      announce("No active Run to listen to.");
      return;
    }
    const targets = describeListenTargets(run);
    if (targets.length === 0) {
      announce("Nothing revealed to listen for yet. Explore or use Pulse.");
      return;
    }
    for (const target of targets.slice(0, 6)) {
      playCue(`compass-${target.kind}`);
    }
    announce(
      `Listen: ${targets
        .slice(0, 6)
        .map((target) => `${target.kind} ${target.where}`)
        .join("; ")}.`
    );
  });
  return {
    /** @param {GameRun} run */
    onTransition(run) {
      announce(describeCompassAction(run));
    },
    hide() {
      if (panel) {
        panel.hidden = true;
      }
    },
    show() {
      if (panel) {
        panel.hidden = false;
      }
    }
  };
}
