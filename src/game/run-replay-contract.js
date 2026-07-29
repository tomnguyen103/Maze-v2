export const RUN_REPLAY_MAX_ACTIONS = 2048;
export const RUN_REPLAY_MAX_BYTES = 192 * 1024;

const REPLAY_KEYS = ["version", "actions", "terminal"];
const TERMINAL_KEYS = [
  "outcome",
  "moves",
  "elapsedMs",
  "echoesCollected",
  "echoTotal",
  "wardensDefeated",
  "score",
  "vitality"
];

/**
 * @typedef {
 *   | { type: "move", direction: "up" | "right" | "down" | "left", elapsedMs: number }
 *   | { type: "pulse", elapsedMs: number }
 *   | { type: "ring-bell", elapsedMs: number }
 *   | { type: "hint", elapsedMs: number }
 *   | { type: "challenge-outcome", outcome: "correct" | "wrong" | "skip", elapsedMs: number }
 * } RunReplayAction
 * @typedef {{
 *   outcome: "escaped" | "defeated",
 *   moves: number,
 *   elapsedMs: number,
 *   echoesCollected: number,
 *   echoTotal: number,
 *   wardensDefeated: number,
 *   score: number,
 *   vitality: number
 * }} RunReplayTerminal
 * @typedef {{
 *   version: 1,
 *   actions: RunReplayAction[],
 *   terminal: RunReplayTerminal
 * }} RunReplay
 */

/**
 * @param {unknown[]} actions
 * @param {Record<string, unknown>} run
 * @returns {RunReplay | null}
 */
export function createTerminalRunReplay(actions, run) {
  const candidate = {
    version: 1,
    actions: actions.flatMap(sanitizeRecoveryActions),
    terminal: {
      outcome: run.status === "won" ? "escaped" : "defeated",
      moves: run.moves,
      elapsedMs: Math.max(0, Math.round(Number(run.elapsedMs))),
      echoesCollected: Array.isArray(run.echoes)
        ? run.echoes.filter(
            (echo) =>
              echo &&
              typeof echo === "object" &&
              /** @type {Record<string, unknown>} */ (echo).collected === true
          ).length
        : 0,
      echoTotal: Array.isArray(run.echoes) ? run.echoes.length : 0,
      wardensDefeated: run.wardensDefeated,
      score: run.score,
      vitality:
        run.explorer &&
        typeof run.explorer === "object"
          ? /** @type {Record<string, unknown>} */ (run.explorer).vitality
          : -1
    }
  };
  return normalizeRunReplay(candidate);
}

/**
 * @param {unknown} value
 * @returns {RunReplay | null}
 */
export function normalizeRunReplay(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !hasOnlyKeys(value, REPLAY_KEYS)
  ) {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.actions) ||
    candidate.actions.length === 0 ||
    candidate.actions.length > RUN_REPLAY_MAX_ACTIONS
  ) {
    return null;
  }
  const terminal = normalizeTerminal(candidate.terminal);
  if (!terminal) {
    return null;
  }
  const actions = candidate.actions.map(normalizeAction);
  if (
    actions.some((action) => action === null) ||
    actions.some(
      (action, index) =>
        action.elapsedMs > terminal.elapsedMs ||
        (index > 0 &&
          action.elapsedMs <
            /** @type {RunReplayAction} */ (actions[index - 1]).elapsedMs)
    )
  ) {
    return null;
  }
  const replay = {
    version: /** @type {const} */ (1),
    actions: /** @type {RunReplayAction[]} */ (actions),
    terminal
  };
  try {
    if (
      new TextEncoder().encode(JSON.stringify(replay)).byteLength >
      RUN_REPLAY_MAX_BYTES
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return replay;
}

/** @param {unknown} value @returns {RunReplayAction[]} */
function sanitizeRecoveryActions(value) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (candidate.type === "challenge-outcome") {
    const outcome = normalizeAction({
      type: candidate.type,
      outcome: candidate.outcome,
      elapsedMs: candidate.elapsedMs
    });
    return [
      ...(candidate.hintUsed === true
        ? [{
            type: /** @type {const} */ ("hint"),
            elapsedMs: Number(candidate.elapsedMs)
          }]
        : []),
      ...(outcome ? [outcome] : [])
    ];
  }
  if (candidate.type === "reveal-hint") {
    const hint = normalizeAction({
      type: "hint",
      elapsedMs: candidate.elapsedMs
    });
    return hint ? [hint] : [];
  }
  const normalized = normalizeAction(value);
  return normalized ? [normalized] : [];
}

/** @param {unknown} value @returns {RunReplayAction | null} */
function normalizeAction(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const elapsedMs = safeInteger(candidate.elapsedMs, 0, Number.MAX_SAFE_INTEGER);
  if (elapsedMs === null) {
    return null;
  }
  if (
    candidate.type === "move" &&
    hasOnlyKeys(value, ["type", "direction", "elapsedMs"]) &&
    typeof candidate.direction === "string" &&
    ["up", "right", "down", "left"].includes(candidate.direction)
  ) {
    return {
      type: "move",
      direction: /** @type {RunReplayAction["direction"]} */ (
        candidate.direction
      ),
      elapsedMs
    };
  }
  if (
    (candidate.type === "pulse" || candidate.type === "ring-bell") &&
    hasOnlyKeys(value, ["type", "elapsedMs"])
  ) {
    return { type: candidate.type, elapsedMs };
  }
  if (
    candidate.type === "hint" &&
    hasOnlyKeys(value, ["type", "elapsedMs"])
  ) {
    return { type: "hint", elapsedMs };
  }
  if (
    candidate.type === "challenge-outcome" &&
    hasOnlyKeys(value, ["type", "outcome", "elapsedMs"]) &&
    typeof candidate.outcome === "string" &&
    ["correct", "wrong", "skip"].includes(candidate.outcome)
  ) {
    return {
      type: "challenge-outcome",
      outcome: /** @type {"correct" | "wrong" | "skip"} */ (
        candidate.outcome
      ),
      elapsedMs
    };
  }
  return null;
}

/** @param {unknown} value @returns {RunReplayTerminal | null} */
function normalizeTerminal(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !hasOnlyKeys(value, TERMINAL_KEYS)
  ) {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const moves = safeInteger(candidate.moves, 0, RUN_REPLAY_MAX_ACTIONS);
  const elapsedMs = safeInteger(
    candidate.elapsedMs,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const echoTotal = safeInteger(candidate.echoTotal, 1, 20);
  const echoesCollected = safeInteger(
    candidate.echoesCollected,
    0,
    echoTotal ?? -1
  );
  const wardensDefeated = safeInteger(candidate.wardensDefeated, 0, 20);
  const score = safeInteger(candidate.score, 0, 100000);
  const vitality = safeInteger(candidate.vitality, 0, 20);
  if (
    (candidate.outcome !== "escaped" && candidate.outcome !== "defeated") ||
    moves === null ||
    elapsedMs === null ||
    echoTotal === null ||
    echoesCollected === null ||
    wardensDefeated === null ||
    score === null ||
    vitality === null ||
    (candidate.outcome === "escaped" && echoesCollected !== echoTotal) ||
    (candidate.outcome === "defeated" && vitality !== 0)
  ) {
    return null;
  }
  return {
    outcome: candidate.outcome,
    moves,
    elapsedMs,
    echoesCollected,
    echoTotal,
    wardensDefeated,
    score,
    vitality
  };
}

/** @param {unknown} value @param {number} minimum @param {number} maximum */
function safeInteger(value, minimum, maximum) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

/** @param {object} value @param {string[]} keys */
function hasOnlyKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort());
}
