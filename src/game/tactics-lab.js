import { applyAction, createRun } from "./game-session.js";
import {
  CLASSIC_RULESET_REVISION,
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeKnownRunRuleset
} from "./run-ruleset.js";

/** @typedef {Readonly<{ prompt: string, allowedActions: readonly string[], successSignal: string }>} TacticsDrillStep */
/** @typedef {Readonly<{ id: string, title: string, objective: string, seed: string, ruleset: string | readonly string[], twistIds?: readonly string[], steps: readonly TacticsDrillStep[] }>} TacticsDrill */
/** @typedef {Readonly<{ version: number, drillId: string, twistId: string | null, stepIndex: number, run: ReturnType<typeof createRun>, persisted: false }>} TacticsLabSession */

export const TACTICS_DRILL_IDS = Object.freeze([
  "patrol",
  "hunt",
  "intercept",
  "trail-twists"
]);

export const TACTICS_TRAIL_TWIST_IDS = Object.freeze([
  "echo-hush-v1",
  "windways-v1",
  "echo-bridges-v1",
  "tide-doors-v1",
  "warden-bells-v1"
]);

/** @type {Readonly<Record<string, number>>} */
const TRAIL_TWIST_LABYRINTHS = Object.freeze({
  "echo-hush-v1": 1,
  "windways-v1": 5,
  "echo-bridges-v1": 9,
  "tide-doors-v1": 13,
  "warden-bells-v1": 17
});

/** @type {readonly TacticsDrill[]} */
const DRILLS = Object.freeze([
  Object.freeze({
    id: "patrol",
    title: "Read Patrol",
    objective: "See how a distant Warden chooses a route.",
    seed: "TACTICS-PATROL-V1",
    ruleset: CLASSIC_RULESET_REVISION,
    steps: Object.freeze([
      Object.freeze({
        prompt: "Choose one legal move, then read the Warden report.",
        allowedActions: Object.freeze(["move"]),
        successSignal: "The Warden moved one step and remains readable."
      })
    ])
  }),
  Object.freeze({
    id: "hunt",
    title: "Read Hunt",
    objective: "See how a Warden closes distance on a nearby Explorer.",
    seed: "TACTICS-HUNT-V1",
    ruleset: CLASSIC_RULESET_REVISION,
    steps: Object.freeze([
      Object.freeze({
        prompt: "Choose a legal move, then read the closing-distance report.",
        allowedActions: Object.freeze(["move"]),
        successSignal: "The Warden chooses a route toward the Explorer."
      })
    ])
  }),
  Object.freeze({
    id: "intercept",
    title: "Read Intercept",
    objective: "See how an eligible Warden predicts your last direction.",
    seed: "TACTICS-INTERCEPT-007",
    ruleset: CLASSIC_RULESET_REVISION,
    steps: Object.freeze([
      Object.freeze({
        prompt: "Move once, then read the Warden's predicted route.",
        allowedActions: Object.freeze(["move"]),
        successSignal: "The Warden anticipates the Explorer's last direction."
      })
    ])
  }),
  Object.freeze({
    id: "trail-twists",
    title: "Read Trail Twists",
    objective: "Walk one fixed example of each regional Trail Twist.",
    seed: "TACTICS-TRAIL-TWISTS-V1",
    ruleset: TACTICS_TRAIL_TWIST_IDS,
    twistIds: TACTICS_TRAIL_TWIST_IDS,
    steps: Object.freeze([
      Object.freeze({
        prompt: "Choose a regional rule, then make one legal move.",
        allowedActions: Object.freeze(["move"]),
        successSignal: "The production ruleset reports its visible Trail Twist."
      })
    ])
  })
]);

/** @type {Map<string, TacticsDrill>} */
const DRILL_BY_ID = new Map(DRILLS.map((drill) => [drill.id, drill]));
const TRAIL_TWIST_ID_SET = new Set(TACTICS_TRAIL_TWIST_IDS);
const TACTICS_ACTION_TYPES = new Set([
  "answer-question",
  "move",
  "pause",
  "provide-question",
  "pulse",
  "restart",
  "reveal-hint",
  "ring-bell",
  "skip-question",
  "tick"
]);

const SESSION_CONFIG = Object.freeze({
  size: 11,
  echoCount: 0,
  wardenCount: 1,
  vitality: 3,
  pulses: 2
});

/** @returns {TacticsDrill[]} */
export function listTacticsDrills() {
  return DRILLS.map((drill) => ({
    ...drill,
    steps: drill.steps.map((step) => ({
      ...step,
      allowedActions: [...step.allowedActions]
    })),
    ...(Array.isArray(drill.ruleset)
      ? {
          ruleset: [...drill.ruleset],
          twistIds: [...(drill.twistIds ?? [])]
        }
      : {})
  }));
}

/**
 * @param {string} drillId
 * @param {string} [twistRevision]
 * @returns {TacticsLabSession}
 */
export function createTacticsLabSession(drillId, twistRevision) {
  const drill = DRILL_BY_ID.get(drillId);
  if (!drill) {
    throw new Error("Tactics Lab drill is not available.");
  }

  const selectedTwist = resolveTwist(drillId, twistRevision);
  const labyrinthNumber = selectedTwist
    ? TRAIL_TWIST_LABYRINTHS[selectedTwist]
    : 1;
  const ruleset = selectedTwist
    ? normalizeKnownRunRuleset(getQuestRunRuleset(labyrinthNumber))
    : normalizeKnownRunRuleset(getClassicRunRuleset(labyrinthNumber));
  if (!ruleset) {
    throw new Error("Tactics Lab ruleset is not available.");
  }

  const seed = selectedTwist
    ? `${drill.seed}-${selectedTwist}`
    : drill.seed;
  const run = createRun(seed, {
    ...SESSION_CONFIG,
    wardenCount: drillId === "intercept" ? 2 : SESSION_CONFIG.wardenCount,
    ruleset
  });
  return Object.freeze({
    version: 1,
    drillId,
    twistId: selectedTwist ?? null,
    stepIndex: 0,
    run,
    persisted: false
  });
}

/**
 * @param {TacticsLabSession} session
 * @param {unknown} action
 */
export function applyTacticsLabAction(session, action) {
  if (!session || session.persisted !== false || !session.run) {
    throw new Error("Tactics Lab session is invalid.");
  }
  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    typeof /** @type {{ type?: unknown }} */ (action).type !== "string"
  ) {
    throw new Error("Tactics Lab action is not available.");
  }
  const actionType = /** @type {{ type: string }} */ (action).type;
  if (!TACTICS_ACTION_TYPES.has(actionType)) {
    throw new Error("Tactics Lab action is not available.");
  }

  const nextRun = applyAction(
    session.run,
    /** @type {Parameters<typeof applyAction>[1]} */ (action)
  );
  return Object.freeze({
    ...session,
    stepIndex: actionType === "restart" ? 0 : session.stepIndex + 1,
    run: nextRun,
    persisted: false
  });
}

/**
 * Return only state that a Lab presentation may render. Engine coordinates,
 * hidden map tiles, answer-bearing Question data, and persistence handles are
 * intentionally absent from this projection.
 *
 * @param {TacticsLabSession} session
 */
export function getTacticsLabPublicState(session) {
  if (!session || session.persisted !== false || !session.run) {
    throw new Error("Tactics Lab session is invalid.");
  }
  const run = session.run;
  return Object.freeze({
    version: 1,
    drillId: session.drillId,
    twistId: session.twistId,
    stepIndex: session.stepIndex,
    status: run.status,
    moves: run.moves,
    pulses: run.pulses,
    vitality: run.explorer.vitality,
    event: run.event ? { ...run.event } : null,
    wardens: run.wardens.map((warden) => ({
      id: warden.id,
      mode: warden.mode
    })),
    persisted: false
  });
}

/**
 * @param {string} drillId
 * @param {string} [twistRevision]
 */
function resolveTwist(drillId, twistRevision) {
  if (drillId !== "trail-twists") {
    if (twistRevision !== undefined) {
      throw new Error("Tactics Lab ruleset selection is invalid.");
    }
    return null;
  }
  const selected = twistRevision ?? TACTICS_TRAIL_TWIST_IDS[0];
  if (!TRAIL_TWIST_ID_SET.has(selected)) {
    throw new Error("Tactics Lab ruleset selection is invalid.");
  }
  return selected;
}
