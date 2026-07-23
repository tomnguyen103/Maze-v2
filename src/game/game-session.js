/**
 * @typedef {"up" | "right" | "down" | "left"} Direction
 * @typedef {{ row: number, col: number }} Position
 * @typedef {Position & { collected: boolean }} Echo
 * @typedef {"patrol" | "hunt" | "intercept"} WardenMode
 * @typedef {Position & { id: number, mode: WardenMode }} Warden
 * @typedef {{
 *   size?: number,
 *   echoCount?: number,
 *   wardenCount?: number,
 *   vitality?: number,
 *   pulses?: number
 * }} RunConfigInput
 * @typedef {{
 *   size: number,
 *   echoCount: number,
 *   wardenCount: number,
 *   vitality: number,
 *   pulses: number
 * }} RunConfig
 * @typedef {"active" | "paused" | "won" | "lost"} RunStatus
 * @typedef {{
 *   type: string,
 *   message: string
 * }} RunEvent
 * @typedef {{
 *   version: 1,
 *   seed: string,
 *   config: RunConfig,
 *   labyrinth: number[][],
 *   explorer: Position & { vitality: number, maxVitality: number },
 *   echoes: Echo[],
 *   gate: Position & { open: boolean },
 *   wardens: Warden[],
 *   revealed: string[],
 *   pulseVisible: string[],
 *   pulseExpiresAt: number | null,
 *   pulses: number,
 *   moves: number,
 *   lastDirection: Direction | null,
 *   elapsedMs: number,
 *   status: RunStatus,
 *   event: RunEvent
 * }} GameRun
 * @typedef {{
 *   type: "move",
 *   direction: Direction
 * } | {
 *   type: "pulse"
 * } | {
 *   type: "pause"
 * } | {
 *   type: "restart"
 * } | {
 *   type: "tick",
 *   deltaMs: number
 * }} GameAction
 */

const DIRECTIONS = Object.freeze([
  Object.freeze({ name: "up", row: -1, col: 0 }),
  Object.freeze({ name: "right", row: 0, col: 1 }),
  Object.freeze({ name: "down", row: 1, col: 0 }),
  Object.freeze({ name: "left", row: 0, col: -1 })
]);

const DIRECTION_BY_NAME = new Map(
  DIRECTIONS.map((direction) => [direction.name, direction])
);

const DEFAULT_CONFIG = Object.freeze({
  size: 15,
  echoCount: 3,
  wardenCount: 2,
  vitality: 3,
  pulses: 2
});

const HUNT_DISTANCE = 7;
const INTERCEPT_DISTANCE = 10;
const INTERCEPT_STEPS = 2;

/**
 * Create one deterministic run.
 *
 * @param {string} requestedSeed
 * @param {RunConfigInput} [input]
 * @returns {GameRun}
 */
export function createRun(requestedSeed, input = {}) {
  const seed = normalizeSeed(requestedSeed);
  const config = normalizeConfig(input);
  const random = createRandom(seed);
  const labyrinth = generateLabyrinth(config.size, random);
  const explorerPosition = { row: 1, col: 1 };
  const distances = distancesFrom(labyrinth, explorerPosition);
  const openTiles = getOpenTiles(labyrinth);
  const gatePosition = farthestAvailable(openTiles, distances, new Set());
  const occupied = new Set([
    positionKey(explorerPosition),
    positionKey(gatePosition)
  ]);

  const echoes = pickEntities(
    openTiles,
    distances,
    occupied,
    config.echoCount,
    random,
    Math.max(4, Math.floor(config.size * 0.45))
  ).map((position) => ({ ...position, collected: false }));

  /** @type {Warden[]} */
  const wardens = pickEntities(
    openTiles,
    distances,
    occupied,
    config.wardenCount,
    random,
    Math.max(5, Math.floor(config.size * 0.6))
  ).map((position, id) => ({ ...position, id, mode: "patrol" }));

  const explorer = {
    ...explorerPosition,
    vitality: config.vitality,
    maxVitality: config.vitality
  };

  return {
    version: 1,
    seed,
    config,
    labyrinth,
    explorer,
    echoes,
    gate: { ...gatePosition, open: config.echoCount === 0 },
    wardens,
    revealed: revealKeys(labyrinth, explorer, 2),
    pulseVisible: [],
    pulseExpiresAt: null,
    pulses: config.pulses,
    moves: 0,
    lastDirection: null,
    elapsedMs: 0,
    status: "active",
    event: {
      type: "started",
      message: "Collect 3 Echoes, then enter the Gate. Wardens move after each valid step."
    }
  };
}

/**
 * Resolve one player intent into the next complete run state.
 *
 * @param {GameRun} run
 * @param {GameAction} action
 * @returns {GameRun}
 */
export function applyAction(run, action) {
  if (action.type === "restart") {
    return createRun(run.seed, run.config);
  }

  if (action.type === "pause") {
    if (run.status === "active") {
      return {
        ...run,
        status: "paused",
        event: { type: "paused", message: "Run paused." }
      };
    }
    if (run.status === "paused") {
      return {
        ...run,
        status: "active",
        event: { type: "resumed", message: "Run resumed." }
      };
    }
    return run;
  }

  if (action.type === "tick") {
    if (run.status !== "active") {
      return run;
    }
    return {
      ...run,
      elapsedMs: run.elapsedMs + Math.max(0, action.deltaMs)
    };
  }

  if (run.status === "paused") {
    return {
      ...run,
      event: { type: "paused", message: "Resume the run before moving." }
    };
  }

  if (run.status !== "active") {
    return run;
  }

  if (action.type === "pulse") {
    return resolvePulse(run);
  }

  if (action.type !== "move") {
    return run;
  }

  return resolveMove(run, action.direction);
}

/**
 * @param {GameRun} run
 * @param {Direction} directionName
 * @returns {GameRun}
 */
function resolveMove(run, directionName) {
  const direction = DIRECTION_BY_NAME.get(directionName);
  if (!direction) {
    return {
      ...run,
      event: { type: "blocked", message: "That direction is unknown." }
    };
  }

  const target = {
    row: run.explorer.row + direction.row,
    col: run.explorer.col + direction.col
  };

  if (!isPassage(run.labyrinth, target)) {
    return {
      ...run,
      event: { type: "blocked", message: "Wall. Choose another direction." }
    };
  }

  const nextMoves = run.moves + 1;
  /** @type {GameRun} */
  let next = {
    ...cloneRun(run),
    explorer: { ...run.explorer, ...target },
    moves: nextMoves,
    lastDirection: directionName,
    event: { type: "moved", message: `Moved ${directionName}.` }
  };
  next = expirePulse(next);
  next = revealExplorerArea(next);
  next = collectEcho(next);

  const directContact = resolveWardenContact(next);
  if (directContact.status === "lost") {
    return directContact;
  }
  next = directContact;

  if (samePosition(next.explorer, next.gate)) {
    if (next.gate.open) {
      return {
        ...next,
        status: "won",
        event: {
          type: "escaped",
          message: "Run complete. Gate reached."
        }
      };
    }
    next = {
      ...next,
      event: {
        type: "gate-locked",
        message: `${remainingEchoes(next)} Echoes remain. Gate locked.`
      }
    };
  }

  next = moveWardens(next);
  return resolveWardenContact(next);
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function resolvePulse(run) {
  if (run.pulses <= 0) {
    return {
      ...run,
      event: {
        type: "pulse-empty",
        message: "No Pulses remain."
      }
    };
  }

  const moves = run.moves + 1;
  /** @type {GameRun} */
  let next = {
    ...cloneRun(run),
    pulses: run.pulses - 1,
    moves,
    pulseVisible: revealKeys(run.labyrinth, run.explorer, 4),
    pulseExpiresAt: moves + 2,
    event: {
      type: "pulse",
      message: "Pulse reveals nearby tiles briefly."
    }
  };
  next = moveWardens(next);
  return resolveWardenContact(next);
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function expirePulse(run) {
  if (run.pulseExpiresAt === null || run.moves < run.pulseExpiresAt) {
    return run;
  }
  return {
    ...run,
    pulseVisible: [],
    pulseExpiresAt: null
  };
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function revealExplorerArea(run) {
  const revealed = new Set(run.revealed);
  for (const key of revealKeys(run.labyrinth, run.explorer, 2)) {
    revealed.add(key);
  }
  return { ...run, revealed: [...revealed] };
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function collectEcho(run) {
  const echoIndex = run.echoes.findIndex(
    (echo) => !echo.collected && samePosition(echo, run.explorer)
  );
  if (echoIndex === -1) {
    return run;
  }

  const echoes = run.echoes.map((echo, index) =>
    index === echoIndex ? { ...echo, collected: true } : echo
  );
  const allCollected = echoes.every((echo) => echo.collected);
  return {
    ...run,
    echoes,
    gate: { ...run.gate, open: allCollected },
    event: {
      type: "echo-collected",
      message: allCollected
        ? "Final Echo recovered. The Gate is open."
        : `Echo recovered. ${echoes.filter((echo) => !echo.collected).length} remain.`
    }
  };
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function moveWardens(run) {
  const reserved = new Set([
    positionKey(run.gate),
    ...run.echoes
      .filter((echo) => !echo.collected)
      .map((echo) => positionKey(echo))
  ]);
  const explorerDistances = distancesFrom(run.labyrinth, run.explorer);
  const originalWardenPositions = new Set(run.wardens.map(positionKey));
  /** @type {Warden[]} */
  const wardens = [];

  for (const warden of run.wardens) {
    /** @type {Set<string>} */
    const occupiedByWarden = new Set([
      ...originalWardenPositions,
      ...wardens.map(positionKey)
    ]);
    /** @type {Position[]} */
    const candidates = passageNeighbors(run.labyrinth, warden).filter(
      (position) =>
        !reserved.has(positionKey(position)) &&
        !occupiedByWarden.has(positionKey(position))
    );
    /** @type {Position[]} */
    let legal = candidates.length > 0
      ? candidates
      : [warden];
    const currentDistance = explorerDistances.get(positionKey(warden)) ?? Infinity;
    const intercept =
      warden.id % 2 === 1 &&
      run.lastDirection !== null &&
      currentDistance <= INTERCEPT_DISTANCE;
    const hunt = !intercept && currentDistance <= HUNT_DISTANCE;
    const mode = intercept ? "intercept" : hunt ? "hunt" : "patrol";
    if (mode === "patrol" && candidates.length > 0) {
      legal = [...candidates, warden];
    }
    const target =
      mode === "intercept"
        ? predictedExplorerPosition(run)
        : mode === "hunt"
          ? run.explorer
          : patrolTarget(run, warden);
    const targetDistances = distancesFrom(run.labyrinth, target);
    /** @type {Position[]} */
    const ordered = [...legal].sort((left, right) => {
      const leftDistance = targetDistances.get(positionKey(left)) ?? Infinity;
      const rightDistance = targetDistances.get(positionKey(right)) ?? Infinity;
      return leftDistance - rightDistance;
    });
    const bestDistance = targetDistances.get(positionKey(ordered[0])) ?? Infinity;
    /** @type {Position[]} */
    const tied = ordered.filter(
      (position) =>
        (targetDistances.get(positionKey(position)) ?? Infinity) === bestDistance
    );
    const random = createRandom(`${run.seed}:warden:${warden.id}:turn:${run.moves}`);
    /** @type {Position} */
    const chosen = tied[Math.floor(random() * tied.length)] ?? warden;
    wardens.push({
      ...chosen,
      id: warden.id,
      mode
    });
  }

  return { ...run, wardens };
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function resolveWardenContact(run) {
  const wardenIndex = run.wardens.findIndex((warden) =>
    samePosition(warden, run.explorer)
  );
  if (wardenIndex === -1) {
    return run;
  }

  const vitality = Math.max(0, run.explorer.vitality - 1);
  if (vitality === 0) {
    return {
      ...run,
      explorer: { ...run.explorer, vitality },
      status: "lost",
      event: {
        type: "defeated",
        message: "Warden contact depleted Vitality."
      }
    };
  }

  const wardens = run.wardens.map((warden, index) =>
    index === wardenIndex
      ? relocateWarden(run, warden, wardenIndex)
      : warden
  );
  return {
    ...run,
    explorer: { ...run.explorer, vitality },
    wardens,
    event: {
      type: "hurt",
      message: `Warden contact. ${vitality} Vitality remain.`
    }
  };
}

/**
 * @param {GameRun} run
 * @param {Warden} warden
 * @param {number} wardenIndex
 * @returns {Warden}
 */
function relocateWarden(run, warden, wardenIndex) {
  const distances = distancesFrom(run.labyrinth, run.explorer);
  const occupied = new Set([
    positionKey(run.explorer),
    positionKey(run.gate),
    ...run.echoes
      .filter((echo) => !echo.collected)
      .map((echo) => positionKey(echo)),
    ...run.wardens
      .filter((_, index) => index !== wardenIndex)
      .map(positionKey)
  ]);
  const candidates = getOpenTiles(run.labyrinth).filter(
    (position) =>
      !occupied.has(positionKey(position)) &&
      (distances.get(positionKey(position)) ?? 0) >= Math.floor(run.config.size / 2)
  );
  const random = createRandom(`${run.seed}:relocate:${warden.id}:turn:${run.moves}`);
  const position =
    candidates[Math.floor(random() * candidates.length)] ??
    getOpenTiles(run.labyrinth).find(
      (candidate) => !occupied.has(positionKey(candidate))
    ) ??
    warden;
  return { ...position, id: warden.id, mode: warden.mode };
}

/**
 * @param {GameRun} run
 * @returns {Position}
 */
function predictedExplorerPosition(run) {
  const direction = run.lastDirection
    ? DIRECTION_BY_NAME.get(run.lastDirection)
    : undefined;
  if (!direction) {
    return run.explorer;
  }

  let target = { row: run.explorer.row, col: run.explorer.col };
  for (let step = 0; step < INTERCEPT_STEPS; step += 1) {
    const next = {
      row: target.row + direction.row,
      col: target.col + direction.col
    };
    if (!isPassage(run.labyrinth, next)) {
      break;
    }
    target = next;
  }
  return target;
}

/**
 * @param {GameRun} run
 * @param {Warden} warden
 * @returns {Position}
 */
function patrolTarget(run, warden) {
  const targets = run.echoes.filter((echo) => !echo.collected);
  if (targets.length === 0) {
    return run.gate;
  }

  const distances = distancesFrom(run.labyrinth, warden);
  return [...targets].sort(
    (left, right) =>
      (distances.get(positionKey(left)) ?? Infinity) -
      (distances.get(positionKey(right)) ?? Infinity)
  )[0];
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function cloneRun(run) {
  return {
    ...run,
    config: { ...run.config },
    explorer: { ...run.explorer },
    gate: { ...run.gate },
    echoes: run.echoes.map((echo) => ({ ...echo })),
    wardens: run.wardens.map((warden) => ({ ...warden })),
    revealed: [...run.revealed],
    pulseVisible: [...run.pulseVisible],
    event: { ...run.event }
  };
}

/**
 * @param {RunConfigInput} input
 * @returns {RunConfig}
 */
function normalizeConfig(input) {
  let size = clampInteger(input.size, DEFAULT_CONFIG.size, 9, 25);
  if (size % 2 === 0) {
    size += size === 25 ? -1 : 1;
  }
  return {
    size,
    echoCount: clampInteger(input.echoCount, DEFAULT_CONFIG.echoCount, 0, 5),
    wardenCount: clampInteger(input.wardenCount, DEFAULT_CONFIG.wardenCount, 0, 5),
    vitality: clampInteger(input.vitality, DEFAULT_CONFIG.vitality, 1, 9),
    pulses: clampInteger(input.pulses, DEFAULT_CONFIG.pulses, 0, 5)
  };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} minimum
 * @param {number} maximum
 */
function clampInteger(value, fallback, minimum, maximum) {
  const number = typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

/**
 * @param {string} seed
 */
function normalizeSeed(seed) {
  const normalized = String(seed ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (normalized) {
    return normalized;
  }
  return `ECHO-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * @param {number} size
 * @param {() => number} random
 */
function generateLabyrinth(size, random) {
  const labyrinth = Array.from({ length: size }, () => Array(size).fill(0));
  const stack = [{ row: 1, col: 1 }];
  labyrinth[1][1] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = DIRECTIONS.map((direction) => ({
      row: current.row + direction.row * 2,
      col: current.col + direction.col * 2,
      betweenRow: current.row + direction.row,
      betweenCol: current.col + direction.col
    })).filter(
      (candidate) =>
        candidate.row > 0 &&
        candidate.row < size - 1 &&
        candidate.col > 0 &&
        candidate.col < size - 1 &&
        labyrinth[candidate.row][candidate.col] === 0
    );

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[Math.floor(random() * candidates.length)];
    labyrinth[next.betweenRow][next.betweenCol] = 1;
    labyrinth[next.row][next.col] = 1;
    stack.push({ row: next.row, col: next.col });
  }

  const loopCandidates = [];
  for (let row = 1; row < size - 1; row += 1) {
    for (let col = 1; col < size - 1; col += 1) {
      if (labyrinth[row][col] === 1) {
        continue;
      }
      const horizontal =
        labyrinth[row][col - 1] === 1 && labyrinth[row][col + 1] === 1;
      const vertical =
        labyrinth[row - 1][col] === 1 && labyrinth[row + 1][col] === 1;
      if (horizontal !== vertical) {
        loopCandidates.push({ row, col });
      }
    }
  }
  shuffle(loopCandidates, random);
  for (const position of loopCandidates.slice(0, Math.floor(size / 4))) {
    labyrinth[position.row][position.col] = 1;
  }

  return labyrinth;
}

/**
 * @param {number[][]} labyrinth
 * @param {Position} start
 */
function distancesFrom(labyrinth, start) {
  const distances = new Map([[positionKey(start), 0]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(positionKey(current)) ?? 0;
    for (const neighbor of passageNeighbors(labyrinth, current)) {
      const key = positionKey(neighbor);
      if (distances.has(key)) {
        continue;
      }
      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}

/**
 * @param {number[][]} labyrinth
 * @param {Position} position
 */
function passageNeighbors(labyrinth, position) {
  return DIRECTIONS.map((direction) => ({
    row: position.row + direction.row,
    col: position.col + direction.col
  })).filter((candidate) => isPassage(labyrinth, candidate));
}

/**
 * @param {number[][]} labyrinth
 * @param {Position} position
 */
function isPassage(labyrinth, position) {
  return labyrinth[position.row]?.[position.col] === 1;
}

/**
 * @param {number[][]} labyrinth
 */
function getOpenTiles(labyrinth) {
  const positions = [];
  for (let row = 0; row < labyrinth.length; row += 1) {
    for (let col = 0; col < labyrinth[row].length; col += 1) {
      if (labyrinth[row][col] === 1) {
        positions.push({ row, col });
      }
    }
  }
  return positions;
}

/**
 * @param {Position[]} positions
 * @param {Map<string, number>} distances
 * @param {Set<string>} occupied
 */
function farthestAvailable(positions, distances, occupied) {
  return [...positions]
    .filter((position) => !occupied.has(positionKey(position)))
    .sort(
      (left, right) =>
        (distances.get(positionKey(right)) ?? 0) -
        (distances.get(positionKey(left)) ?? 0)
    )[0];
}

/**
 * @param {Position[]} positions
 * @param {Map<string, number>} distances
 * @param {Set<string>} occupied
 * @param {number} count
 * @param {() => number} random
 * @param {number} minimumDistance
 */
function pickEntities(
  positions,
  distances,
  occupied,
  count,
  random,
  minimumDistance
) {
  const distant = positions.filter(
    (position) =>
      !occupied.has(positionKey(position)) &&
      (distances.get(positionKey(position)) ?? 0) >= minimumDistance
  );
  const candidates = distant.length >= count
    ? distant
    : positions.filter((position) => !occupied.has(positionKey(position)));
  shuffle(candidates, random);
  /** @type {Position[]} */
  const selected = [];

  for (const position of candidates) {
    if (selected.length >= count) {
      break;
    }
    const separated = selected.every(
      (other) =>
        Math.abs(other.row - position.row) + Math.abs(other.col - position.col) >= 3
    );
    if (!separated && candidates.length > count * 2) {
      continue;
    }
    selected.push(position);
    occupied.add(positionKey(position));
  }
  return selected;
}

/**
 * @param {number[][]} labyrinth
 * @param {Position} center
 * @param {number} radius
 */
function revealKeys(labyrinth, center, radius) {
  const keys = [];
  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    for (let col = center.col - radius; col <= center.col + radius; col += 1) {
      if (
        labyrinth[row]?.[col] !== undefined &&
        Math.abs(row - center.row) + Math.abs(col - center.col) <= radius
      ) {
        keys.push(`${row},${col}`);
      }
    }
  }
  return keys;
}

/**
 * @param {GameRun} run
 */
function remainingEchoes(run) {
  return run.echoes.filter((echo) => !echo.collected).length;
}

/**
 * @param {Position} left
 * @param {Position} right
 */
function samePosition(left, right) {
  return left.row === right.row && left.col === right.col;
}

/**
 * @param {Position} position
 */
function positionKey(position) {
  return `${position.row},${position.col}`;
}

/**
 * @template T
 * @param {T[]} values
 * @param {() => number} random
 */
function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

/**
 * @param {string} seed
 */
function createRandom(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return function random() {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
