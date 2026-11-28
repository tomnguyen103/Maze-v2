/**
 * Revealed Path Compass (player label: Trail Compass) — a presentation-only
 * nonvisual description layer over the canonical Run state. It reads exactly
 * what the canvas renderer draws: the revealed and pulse-visible tiles
 * and the always-visible Trail Twist fixtures. It never
 * touches deterministic Run state and never describes Fog-hidden entities,
 * shortcuts, timing, or pathfinding.
 *
 * @typedef {import("./game-session.js").GameRun} GameRun
 */

import { summarizeWardenMode } from "./warden-mode.js";
import { actionAdvancedRun, openShortcutAcrossWall } from "./game-session.js";

const DIRECTIONS = Object.freeze([
  Object.freeze({ name: "north", row: -1, col: 0 }),
  Object.freeze({ name: "east", row: 0, col: 1 }),
  Object.freeze({ name: "south", row: 1, col: 0 }),
  Object.freeze({ name: "west", row: 0, col: -1 })
]);

/** @type {Readonly<Record<string, string>>} */
const COMPASS_WORDS = Object.freeze({
  up: "north",
  right: "east",
  down: "south",
  left: "west"
});

/**
 * The Grid reference the board draws outside the Neatline: column letter,
 * then row number.
 *
 * @param {{ row: number, col: number }} position
 */
function gridReference(position) {
  return `${String.fromCharCode(65 + position.col)}${position.row + 1}`;
}

/**
 * A tile the Pulse alone shows: the board tints it, and it expires.
 *
 * @param {GameRun} run
 * @param {string} key
 */
function isPulseOnly(run, key) {
  return run.pulseVisible.includes(key) && !run.revealed.includes(key);
}

/**
 * @param {number} count
 * @param {string} one
 * @param {string} many
 */
function counted(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** @param {GameRun} run */
function revealedTiles(run) {
  // Renderer parity: a Windway partner tile stays in Fog until it is revealed itself.
  const revealed = new Set([...run.revealed, ...run.pulseVisible]);
  return revealed;
}

/**
 * Describe one adjacent direction from what the Explorer can already see.
 *
 * @param {GameRun} run
 * @param {{ name: string, row: number, col: number }} direction
 */
function describeExit(run, direction) {
  const size = run.labyrinth.length;
  const row = run.explorer.row + direction.row;
  const col = run.explorer.col + direction.col;
  if (row < 0 || col < 0 || row >= size || col >= size) {
    return null;
  }
  // Only the shortcut revisions populate these lists, so this matches the
  // engine revision gate in resolveMove.
  const crossing = openShortcutAcrossWall(
    [...run.echoBridges, ...run.tideDoors],
    run.explorer,
    { row, col }
  );
  if (crossing) {
    const kind =
      "echoIndex" in crossing.shortcut
        ? `Echo Bridge ${crossing.shortcut.echoIndex + 1}`
        : "a Tide Door";
    return (
      `${direction.name} open through ${kind} to ` +
      gridReference(crossing.destination)
    );
  }
  if (run.labyrinth[row][col] !== 1) {
    return null;
  }
  const windway = run.windways.find(
    (candidate) =>
      candidate.source.row === row && candidate.source.col === col
  );
  if (!windway) {
    return `${direction.name} open`;
  }
  const { destination } = windway;
  if (run.labyrinth[destination.row]?.[destination.col] !== 1) {
    return null;
  }
  if (
    destination.row === run.explorer.row &&
    destination.col === run.explorer.col
  ) {
    return `${direction.name} onto a Windway that carries you back here`;
  }
  return (
    `${direction.name} onto a Windway carrying you to ` +
    gridReference(destination)
  );
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
 * the Gate, and Wardens, each with its revealed direction. Danger comes first,
 * so the Listen cap never hides a Warden: Wardens nearest first, then the Gate,
 * then Echoes nearest first.
 *
 * @param {GameRun} run
 */
export function describeListenTargets(run) {
  const revealed = revealedTiles(run);
  /** @param {{ row: number, col: number }} position */
  const distance = (position) =>
    Math.abs(position.row - run.explorer.row) +
    Math.abs(position.col - run.explorer.col);
  /**
   * @template {{ row: number, col: number }} T
   * @param {T[]} positions
   * @returns {T[]}
   */
  const nearestFirst = (positions) =>
    [...positions].sort((a, b) => distance(a) - distance(b));
  /** @type {{ kind: "echo" | "gate" | "warden", key: string, where: string, text: string, item: any }[]} */
  const targets = [];
  for (const warden of nearestFirst(run.wardens)) {
    const key = `${warden.row},${warden.col}`;
    if (revealed.has(key)) {
      const where = directionAndDistance(run, warden);
      targets.push({ kind: "warden", key, where, text: `warden ${where}`, item: warden });
    }
  }
  const gateKey = `${run.gate.row},${run.gate.col}`;
  if (revealed.has(gateKey)) {
    const where = directionAndDistance(run, run.gate);
    targets.push({ kind: "gate", key: gateKey, where, text: `gate ${where}`, item: run.gate });
  }
  // The number is the Echo pair number the board draws on the Echo.
  const numbered = run.echoes.map((echo, index) => ({ ...echo, number: index + 1 }));
  for (const echo of nearestFirst(numbered)) {
    const key = `${echo.row},${echo.col}`;
    if (!echo.collected && revealed.has(key)) {
      const where = directionAndDistance(run, echo);
      targets.push({
        kind: "echo",
        key,
        where,
        text: `echo ${echo.number}, ${where}`,
        item: echo
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
  if (run.status === "paused") {
    sentences.push("Run paused.");
  } else if (run.status === "won") {
    sentences.push("Run over: you escaped.");
  } else if (run.status === "lost") {
    sentences.push("Run over: you were defeated.");
  } else if (run.status === "challenge") {
    sentences.push("Warden Challenge in progress.");
  }
  const remainingEchoes = run.echoes.filter((echo) => !echo.collected).length;
  const resources =
    `Vitality ${run.explorer.vitality} of ${run.explorer.maxVitality}, ` +
    `Pulses ${run.pulses}, ` +
    `${remainingEchoes} ${remainingEchoes === 1 ? "Echo remains" : "Echoes remain"}. ` +
    `Score ${run.score}.`;
  if (run.status === "paused") {
    // The paused cover hides the board (A-40), so the Compass gives no board facts.
    sentences.push(resources);
    return sentences.join(" ");
  }
  sentences.push(`You are at ${gridReference(run.explorer)}.`);
  sentences.push(resources);
  const exits = DIRECTIONS.map((direction) =>
    describeExit(run, direction)
  ).filter((exit) => exit !== null);
  sentences.push(exits.length ? `Exits: ${exits.join("; ")}.` : "No open exits.");

  // Listen order: Wardens nearest first, then the Gate, then Echoes.
  for (const { kind, key, where, item } of describeListenTargets(run)) {
    const seen = isPulseOnly(run, key) ? ", seen by Pulse" : "";
    if (kind === "warden") {
      sentences.push(`A Warden on ${item.mode} duty is ${where}${seen}.`);
    } else if (kind === "gate") {
      const state = run.gate.open
        ? run.gate.sealed
          ? "open but sealed by the Gate Warden"
          : "open"
        : "locked until you collect every Echo";
      sentences.push(`The Gate is ${where}, ${state}${seen}.`);
    } else {
      sentences.push(`Echo ${item.number} shimmers ${where}${seen}.`);
    }
  }
  for (const windway of run.windways) {
    const sourceKey = `${windway.source.row},${windway.source.col}`;
    const { row, col } = windway.destination;
    // The board draws a Windway when either end is known (B-83); the Compass follows.
    const key = revealed.has(sourceKey) ? sourceKey : `${row},${col}`;
    // The engine blocks a Windway whose destination is not a passage.
    if (revealed.has(key) && run.labyrinth[row]?.[col] === 1) {
      const seen = isPulseOnly(run, key) ? ", seen by Pulse" : "";
      sentences.push(
        `A Windway starts ${directionAndDistance(run, windway.source)} ` +
          `and carries you to ${gridReference(windway.destination)}${seen}.`
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
    const open = run.echoBridges.filter((bridge) => bridge.open);
    const pairs = open.length
      ? ` (${open.map((bridge) => `Echo ${bridge.echoIndex + 1}`).join(", ")})`
      : "";
    sentences.push(
      `Echo Bridges opened: ${open.length} of ${run.echoBridges.length}${pairs}.`
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
        : run.signalBells.length > 0 && run.signalBells.every((bell) => bell.spent)
          ? "Every Signal Bell has rung."
          : "Signal Bells wait elsewhere in this Labyrinth."
    );
  }
  return sentences.join(" ");
}

/**
 * What a Pulse showed: the passages, Echoes, Gate and Wardens that only the
 * Pulse reveals. Fog-hidden entities stay out of range.
 *
 * @param {GameRun} run
 */
function pulseNote(run) {
  const pulseOnly = run.pulseVisible.filter((key) => !run.revealed.includes(key));
  const passages = pulseOnly.filter((key) => {
    const [row, col] = key.split(",").map(Number);
    return run.labyrinth[row]?.[col] === 1;
  }).length;
  const onPulse = (/** @type {{ row: number, col: number }} */ item) =>
    pulseOnly.includes(`${item.row},${item.col}`);
  const echoes = run.echoes.filter((echo) => !echo.collected && onPulse(echo)).length;
  const wardens = run.wardens.filter(onPulse).length;
  const found = [
    passages > 0 && counted(passages, "passage", "passages"),
    echoes > 0 && counted(echoes, "Echo", "Echoes"),
    onPulse(run.gate) && "the Gate",
    wardens > 0 && counted(wardens, "Warden", "Wardens")
  ].filter(Boolean);
  return `In range: ${found.length ? found.join(", ") : "nothing new"}.`;
}

/**
 * One concise polite status for the action that just resolved. In a Challenge
 * and after the Run ends, only the event is said.
 *
 * @param {GameRun} run
 * @param {GameRun} [previous]
 */
export function describeCompassAction(run, previous) {
  // The engine names moves up, right, down and left; the Compass speaks
  // compass words only (A-36).
  let event = (run.event?.message ?? "").replace(
    /^(Moved|Windway carried you) (up|right|down|left)\./,
    (_, lead, word) => `${lead} ${COMPASS_WORDS[word]}.`
  );
  const door = run.tideDoors[0];
  if (
    run.status === "challenge" &&
    door &&
    previous?.tideDoors[0] &&
    previous.tideDoors[0].open !== door.open &&
    !event.includes("Tide Doors are now")
  ) {
    // The engine leaves the phase out of a Challenge event.
    event = `${event} Tide Doors are now ${door.open ? "open" : "sealed"}.`;
  }
  if (run.status !== "active") {
    // A paused cover hides the board (A-40); an ended Run or a Challenge needs
    // the event only. An empty event still gets a status line.
    const fallback = {
      paused: "Run paused.",
      challenge: "Warden Challenge in progress.",
      won: "Run over: you escaped.",
      lost: "Run over: you were defeated."
    }[run.status];
    return event.trim() || fallback || "";
  }
  const exits = DIRECTIONS.map((direction) => describeExit(run, direction))
    .filter((exit) => exit !== null)
    .map((exit) => String(exit).split(" ")[0]);
  const sentences = [event, `At ${gridReference(run.explorer)}.`];
  if (exits.length) {
    sentences.push(`Open: ${exits.join(", ")}.`);
  }
  if (run.event?.type === "pulse") {
    sentences.push(pulseNote(run));
  }
  // Warden mode is on screen for a sighted Explorer at all times, so a
  // nonvisual Run has to carry it too. It rides this one status rather than
  // becoming a second announcement. The mode reads every Warden, Fog-hidden
  // ones included, as the sighted HUD does, and names no position. Only a
  // revealed Warden gets a distance and a direction.
  sentences.push(wardenModeNote(run));
  const nearest = describeListenTargets(run).find(
    (target) => target.kind === "warden"
  );
  if (nearest) {
    sentences.push(`Nearest Warden: ${nearest.item.mode}, ${nearest.where}.`);
  }
  return sentences.filter(Boolean).join(" ");
}

/**
 * @param {GameRun} run
 */
function wardenModeNote(run) {
  const mode = summarizeWardenMode(run);
  return mode === "cleared"
    ? "Warden mode: Path clear."
    : `Warden mode: ${{
        lured: "Lured to Bell",
        intercept: "Intercept active",
        hunt: "Hunt active",
        patrol: "Patrol"
      }[mode]}.`;
}

const LISTEN_CUE_GAP_MS = 160;

/**
 * The stereo pan and pitch of a Listen tone: east pans right, north rings higher.
 *
 * @param {GameRun} run
 * @param {{ row: number, col: number }} position
 * @returns {{ pan: number, detune: number }}
 */
export function listenCueVoice(run, position) {
  const colDelta = position.col - run.explorer.col;
  const rowDelta = position.row - run.explorer.row;
  return {
    pan: Math.max(-1, Math.min(1, colDelta / 4)),
    detune: Math.max(-400, Math.min(400, -rowDelta * 100))
  };
}

/**
 * Self-wiring controller for the Trail Compass panel. Describe and Listen
 * dispatch no Run action and write no log entry; each player action produces
 * exactly one polite status through the shared announce channel.
 *
 * @param {{
 *   getRun: () => GameRun | null | undefined,
 *   announce: (message: string) => void,
 *   playCue?: (cue: "compass-echo" | "compass-gate" | "compass-warden", voice?: { pan?: number, detune?: number }) => void,
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
  /** @type {ReturnType<typeof setTimeout>[]} */
  let pendingCues = [];
  // A new Listen, a Run change, or a hidden panel makes queued tones stale.
  const cancelCues = () => {
    pendingCues.forEach(clearTimeout);
    pendingCues = [];
  };
  root.getElementById("compass-listen")?.addEventListener("click", () => {
    cancelCues();
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
    // Each tone lasts 150 ms; a 160 ms gap lets the order be heard.
    pendingCues = targets
      .slice(0, 6)
      .map((target, index) =>
        setTimeout(
          () => playCue(`compass-${target.kind}`, listenCueVoice(run, target.item)),
          index * LISTEN_CUE_GAP_MS
        )
      );
    announce(
      `Listen: ${targets
        .slice(0, 6)
        .map((target) => target.text)
        .join("; ")}.`
    );
  });
  return {
    /**
     * @param {GameRun} run
     * @param {GameRun} [previous]
     * @param {{ type: string }} [action]
     */
    onTransition(run, previous, action) {
      cancelCues();
      // resolveRingBell returns the same Run when no Bell is beside the
      // Explorer, so the old event message would repeat.
      if (
        previous &&
        action?.type === "ring-bell" &&
        !actionAdvancedRun(previous, run, action)
      ) {
        announce("No Signal Bell is beside you.");
        return;
      }
      announce(describeCompassAction(run, previous));
    },
    hide() {
      cancelCues();
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
