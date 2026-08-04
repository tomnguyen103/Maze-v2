import {
  getClassicRunRuleset,
  normalizeKnownRunRuleset
} from "./run-ruleset.js";
import { compareKeys } from "./compare-keys.js";

/**
 * @typedef {"up" | "right" | "down" | "left"} Direction
 * @typedef {{ row: number, col: number }} Position
 * @typedef {Position & { collected: boolean }} Echo
 * @typedef {{
 *   source: Position,
 *   destination: Position,
 *   direction: Direction
 * }} Windway
 * @typedef {{
 *   echoIndex: number,
 *   from: Position,
 *   to: Position,
 *   open: boolean
 * }} EchoBridge
 * @typedef {{
 *   id: number,
 *   from: Position,
 *   to: Position,
 *   open: boolean
 * }} TideDoor
 * @typedef {Position & {
 *   id: number,
 *   spent: boolean
 * }} SignalBell
 * @typedef {"patrol" | "hunt" | "intercept" | "lured"} WardenMode
 * @typedef {Position & { id: number, mode: WardenMode }} Warden
 * @typedef {{
 *   id: string,
 *   prompt: string,
 *   choices: readonly { id: string, label: string }[],
 *   answerId: string,
 *   hint: string,
 *   explanation: string,
 *   difficultyBand: string,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   reviewedRevisionId?: string
 * }} WardenQuestion
 * @typedef {{
 *   kind: "wrong" | "skipped",
 *   message: string,
 *   explanation: string
 * }} ChallengeFeedback
 * @typedef {{
 *   kind?: "gate-warden",
 *   wardenId: number,
 *   question: WardenQuestion | null,
 *   attempt: number,
 *   feedback: ChallengeFeedback | null,
 *   hintRevealed: boolean
 * }} WardenChallenge
 * @typedef {{
 *   size?: number,
 *   echoCount?: number,
 *   wardenCount?: number,
 *   vitality?: number,
 *   pulses?: number,
 *   gateWarden?: boolean,
 *   ruleset?: {
 *     atlasRegionId: string,
 *     revision: string,
 *     label?: string
 *   }
 * }} RunConfigInput
 * @typedef {{
 *   size: number,
 *   echoCount: number,
 *   wardenCount: number,
 *   vitality: number,
 *   pulses: number,
 *   gateWarden?: true,
 *   ruleset: {
 *     atlasRegionId: string,
 *     revision: string,
 *     label: string
 *   }
 * }} RunConfig
 * @typedef {"active" | "paused" | "challenge" | "won" | "lost"} RunStatus
 * @typedef {{
 *   type: string,
 *   message: string
 * }} RunEvent
 * @typedef {{
 *   version: 1,
 *   seed: string,
 *   config: RunConfig,
 *   ruleset: RunConfig["ruleset"],
 *   labyrinth: number[][],
 *   explorer: Position & { vitality: number, maxVitality: number },
 *   echoes: Echo[],
 *   gate: Position & { open: boolean, sealed?: boolean },
 *   wardens: Warden[],
 *   windways: Windway[],
 *   echoBridges: EchoBridge[],
 *   tideDoors: TideDoor[],
 *   signalBells: SignalBell[],
 *   gateWarden?: { id: number, defeated: boolean },
 *   challenge: WardenChallenge | null,
 *   revealed: string[],
 *   pulseVisible: string[],
 *   pulseExpiresAt: number | null,
 *   pulses: number,
 *   score: number,
 *   wardensDefeated: number,
 *   freeQuestionSkipAvailable: boolean,
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
 *   type: "ring-bell"
 * } | {
 *   type: "pause"
 * } | {
 *   type: "restart"
 * } | {
 *   type: "tick",
 *   deltaMs: number
 * } | {
 *   type: "provide-question",
 *   question: WardenQuestion
 * } | {
 *   type: "answer-question",
 *   answerId: string
 * } | {
 *   type: "reveal-hint"
 * } | {
 *   type: "skip-question"
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
  if (!seed) {
    throw new Error(
      "createRun needs a seed that survives normalization; the caller chooses it."
    );
  }
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
  const generatedWardens = pickEntities(
    openTiles,
    distances,
    occupied,
    config.wardenCount,
    random,
    Math.max(5, Math.floor(config.size * 0.6))
  ).map((position, id) => ({ ...position, id, mode: "patrol" }));
  const gateWarden = config.gateWarden
    ? generatedWardens.at(-1)
    : undefined;
  const wardens = gateWarden
    ? generatedWardens.slice(0, -1)
    : generatedWardens;
  const protectedPositions = [
    explorerPosition,
    gatePosition,
    ...echoes,
    ...generatedWardens
  ];
  const windways = config.ruleset.revision === "windways-v1"
    ? createWindways(
        labyrinth,
        occupied,
        protectedPositions,
        random,
        2
      )
    : [];
  const echoBridges = config.ruleset.revision === "echo-bridges-v1"
    ? createEchoBridges(
        labyrinth,
        occupied,
        echoes.length,
        random
      )
    : [];
  const tideDoors = config.ruleset.revision === "tide-doors-v1"
    ? createTideDoors(labyrinth, occupied, 2, random)
    : [];
  const signalBells = config.ruleset.revision === "warden-bells-v1"
    ? createSignalBells(openTiles, distances, occupied, 2, random)
    : [];

  const explorer = {
    ...explorerPosition,
    vitality: config.vitality,
    maxVitality: config.vitality
  };

  return {
    version: 1,
    seed,
    config,
    ruleset: config.ruleset,
    labyrinth,
    explorer,
    echoes,
    gate: gateWarden
      ? { ...gatePosition, open: config.echoCount === 0, sealed: true }
      : { ...gatePosition, open: config.echoCount === 0 },
    wardens,
    windways,
    echoBridges,
    tideDoors,
    signalBells,
    ...(gateWarden
      ? { gateWarden: { id: gateWarden.id, defeated: false } }
      : {}),
    challenge: null,
    revealed: revealKeys(labyrinth, explorer, 2),
    pulseVisible: [],
    pulseExpiresAt: null,
    pulses: config.pulses,
    score: 0,
    wardensDefeated: 0,
    freeQuestionSkipAvailable: true,
    moves: 0,
    lastDirection: null,
    elapsedMs: 0,
    status: "active",
    event: {
      type: "started",
      message:
        `Recover ${config.echoCount} ${config.echoCount === 1 ? "Echo" : "Echoes"}, then reach the Gate. Answer correctly to defeat Wardens.`
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

  if (
    action.type === "provide-question" &&
    run.status === "challenge" &&
    run.challenge
  ) {
    return {
      ...run,
      challenge: {
        ...run.challenge,
        question: {
          ...action.question,
          choices: action.question.choices.map((choice) => ({ ...choice }))
        },
        hintRevealed: false
      },
      event: {
        type: "question-ready",
        message: "The Warden asks its Question."
      }
    };
  }

  if (
    action.type === "reveal-hint" &&
    run.status === "challenge" &&
    run.challenge?.question &&
    !run.challenge.hintRevealed
  ) {
    return {
      ...run,
      challenge: {
        ...run.challenge,
        hintRevealed: true
      },
      event: {
        type: "hint-revealed",
        message: "A Question Hint is revealed."
      }
    };
  }

  if (
    action.type === "skip-question" &&
    run.status === "challenge" &&
    run.challenge?.question
  ) {
    if (run.freeQuestionSkipAvailable) {
      return {
        ...run,
        freeQuestionSkipAvailable: false,
        challenge: {
          ...run.challenge,
          question: null,
          attempt: run.challenge.attempt + 1,
          feedback: {
            kind: "skipped",
            message: "Free Question Skip used.",
            explanation: "The Warden prepares a different Question."
          },
          hintRevealed: false
        },
        event: {
          type: "question-skipped-free",
          message: "Free Question Skip used. The Warden prepares another Question."
        }
      };
    }

    const vitality = Math.max(0, run.explorer.vitality - 1);
    if (vitality === 0) {
      return {
        ...run,
        explorer: { ...run.explorer, vitality },
        challenge: null,
        status: "lost",
        event: {
          type: "defeated",
          message:
            "The Question Skip spent the Explorer's final Vitality. This Labyrinth attempt ends."
        }
      };
    }
    return {
      ...run,
      explorer: { ...run.explorer, vitality },
      challenge: {
        ...run.challenge,
        question: null,
        attempt: run.challenge.attempt + 1,
        feedback: {
          kind: "skipped",
          message: `Question skipped. ${vitality} Vitality ${vitality === 1 ? "remains" : "remain"}.`,
          explanation: "The Warden prepares a different Question."
        },
        hintRevealed: false
      },
      event: {
        type: "question-skipped-paid",
        message: `Question skipped for 1 Vitality. ${vitality} remain.`
      }
    };
  }

  if (
    action.type === "answer-question" &&
    run.status === "challenge" &&
    run.challenge?.question
  ) {
    const question = run.challenge.question;
    if (action.answerId !== question.answerId) {
      const vitality = Math.max(0, run.explorer.vitality - 1);
      if (vitality === 0) {
        return {
          ...run,
          explorer: { ...run.explorer, vitality },
          challenge: null,
          status: "lost",
          event: {
            type: "defeated",
            message: `Not this time. ${question.explanation} The Explorer's Vitality is gone.`
          }
        };
      }
      return {
        ...run,
        explorer: { ...run.explorer, vitality },
        challenge: {
          ...run.challenge,
          question: null,
          attempt: run.challenge.attempt + 1,
          feedback: {
            kind: "wrong",
            message: `Good try. ${vitality} Vitality ${vitality === 1 ? "remains" : "remain"}.`,
            explanation: question.explanation
          },
          hintRevealed: false
        },
        event: {
          type: "wrong-answer",
          message: `Good try. ${question.explanation} The Warden prepares another Question.`
        }
      };
    }
    if (run.challenge.kind === "gate-warden") {
      return {
        ...run,
        gate: { ...run.gate, sealed: false },
        gateWarden: run.gateWarden
          ? { ...run.gateWarden, defeated: true }
          : undefined,
        challenge: null,
        pulses: run.pulses + 1,
        score: run.score + 100,
        wardensDefeated: run.wardensDefeated + 1,
        status: "active",
        event: {
          type: "gate-warden-defeated",
          message: `Correct! ${question.explanation} The Gate Warden yields. The seal breaks, and you earned 1 Pulse and 100 score.`
        }
      };
    }
    return {
      ...run,
      wardens: run.wardens.filter(
        (warden) => warden.id !== run.challenge?.wardenId
      ),
      challenge: null,
      pulses: run.pulses + 1,
      score: run.score + 100,
      wardensDefeated: run.wardensDefeated + 1,
      status: "active",
      event: {
        type: "warden-defeated",
        message: `Correct! ${question.explanation} The Warden fades from the Labyrinth. You earned 1 Pulse and 100 score.`
      }
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
    return resolveTidePhase(run, resolvePulse(run));
  }

  if (action.type === "ring-bell") {
    return resolveRingBell(run);
  }

  if (action.type !== "move") {
    return run;
  }

  return resolveTidePhase(run, resolveMove(run, action.direction));
}

/**
 * Tide Doors keep one visible phase for the entire action, including Warden
 * movement, and change only after a Move or Pulse spends a turn.
 *
 * @param {GameRun} previous
 * @param {GameRun} next
 * @returns {GameRun}
 */
function resolveTidePhase(previous, next) {
  if (
    previous.ruleset.revision !== "tide-doors-v1" ||
    next.moves !== previous.moves + 1 ||
    next.tideDoors.length === 0
  ) {
    return next;
  }
  const tideDoors = next.tideDoors.map((door) => ({
    ...door,
    open: !door.open
  }));
  const open = tideDoors[0]?.open ?? false;
  const phased = {
    ...next,
    tideDoors
  };
  if (next.status !== "active") {
    return phased;
  }
  return {
    ...phased,
    event: {
      ...next.event,
      message: `${next.event.message} Tide Doors are now ${open ? "open" : "sealed"}.`
    }
  };
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

  const directTarget = {
    row: run.explorer.row + direction.row,
    col: run.explorer.col + direction.col
  };
  const echoBridge = run.ruleset.revision === "echo-bridges-v1"
    ? openShortcutAcrossWall(run.echoBridges, run.explorer, directTarget)
    : undefined;
  const tideDoor = run.ruleset.revision === "tide-doors-v1"
    ? openShortcutAcrossWall(run.tideDoors, run.explorer, directTarget)
    : undefined;
  if (!isPassage(run.labyrinth, directTarget) && !echoBridge && !tideDoor) {
    return {
      ...run,
      event: { type: "blocked", message: "Wall. Choose another direction." }
    };
  }

  const windway = run.ruleset.revision === "windways-v1"
    ? run.windways.find(({ source }) => samePosition(source, directTarget))
    : undefined;
  if (windway && !isPassage(run.labyrinth, windway.destination)) {
    return {
      ...run,
      event: {
        type: "blocked",
        message: "That Windway has no safe destination."
      }
    };
  }
  const destination =
    echoBridge?.destination ??
    tideDoor?.destination ??
    windway?.destination ??
    directTarget;
  const nextMoves = run.moves + 1;
  if (
    samePosition(destination, run.gate) &&
    run.gate.open &&
    run.gate.sealed &&
    run.gateWarden &&
    !run.gateWarden.defeated
  ) {
    return expirePulse({
      ...cloneRun(run),
      moves: nextMoves,
      lastDirection: directionName,
      status: "challenge",
      challenge: {
        kind: "gate-warden",
        wardenId: run.gateWarden.id,
        question: null,
        attempt: 0,
        feedback: null,
        hintRevealed: false
      },
      event: {
        type: "gate-warden-challenge",
        message: "The Gate is open but sealed. Defeat its Warden to pass."
      }
    });
  }

  /** @type {GameRun} */
  let next = {
    ...cloneRun(run),
    explorer: { ...run.explorer, ...destination },
    moves: nextMoves,
    lastDirection: directionName,
    event: echoBridge
      ? {
          type: "echo-bridge-travel",
          message: "Echo Bridge carried you across the sealed wall."
        }
      : tideDoor
        ? {
            type: "tide-door-travel",
            message: "The open Tide Door carried you across the wall."
          }
      : windway
        ? {
          type: "windway-travel",
          message: `Windway carried you ${windway.direction}.`
        }
        : { type: "moved", message: `Moved ${directionName}.` }
  };
  next = expirePulse(next);
  next = revealExplorerArea(next);
  next = collectEcho(next);

  const directContact = resolveWardenContact(next);
  if (directContact.status !== "active") {
    return directContact;
  }
  next = directContact;

  if (samePosition(next.explorer, next.gate)) {
    if (next.gate.open) {
      return {
        ...next,
        score: next.score + 500,
        status: "won",
        event: {
          type: "escaped",
          message: "Run complete. Gate reached. You earned 500 score."
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

  if (
    next.event.type === "echo-collected" &&
    next.ruleset.revision === "echo-hush-v1"
  ) {
    return {
      ...next,
      event: {
        ...next.event,
        message: `${next.event.message} Echo Hush keeps ordinary Wardens still for this action.`
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
function resolveRingBell(run) {
  if (run.ruleset.revision !== "warden-bells-v1") {
    return run;
  }
  const bell = run.signalBells.find(
    (candidate) =>
      !candidate.spent &&
      Math.abs(candidate.row - run.explorer.row) +
        Math.abs(candidate.col - run.explorer.col) === 1
  );
  if (!bell) {
    return run;
  }
  /** @type {GameRun} */
  let next = {
    ...cloneRun(run),
    signalBells: run.signalBells.map((candidate) =>
      candidate.id === bell.id
        ? { ...candidate, spent: true }
        : { ...candidate }
    ),
    moves: run.moves + 1,
    event: {
      type: "signal-bell-rung",
      message: "Signal Bell rung. Revealed ordinary Wardens are Lured for this action."
    }
  };
  next = moveLuredWardens(next, bell);
  next = expirePulse(next);
  return resolveWardenContact(next);
}

/**
 * @param {GameRun} run
 * @param {SignalBell} bell
 * @returns {GameRun}
 */
function moveLuredWardens(run, bell) {
  const visible = new Set([...run.revealed, ...run.pulseVisible]);
  const reserved = new Set([
    positionKey(run.gate),
    ...run.echoes
      .filter((echo) => !echo.collected)
      .map((echo) => positionKey(echo))
  ]);
  const targetDistances = distancesFrom(run.labyrinth, bell);
  const originalWardenPositions = new Set(run.wardens.map(positionKey));
  /** @type {Warden[]} */
  const wardens = [];
  for (const warden of run.wardens) {
    if (!visible.has(positionKey(warden))) {
      wardens.push({ ...warden });
      continue;
    }
    const occupied = new Set([
      ...originalWardenPositions,
      ...wardens.map(positionKey)
    ]);
    const currentDistance =
      targetDistances.get(positionKey(warden)) ?? Infinity;
    const candidates = passageNeighbors(run.labyrinth, warden)
      .filter(
        (position) =>
          !reserved.has(positionKey(position)) &&
          !occupied.has(positionKey(position)) &&
          (targetDistances.get(positionKey(position)) ?? Infinity) <
            currentDistance
      )
      .sort((left, right) => {
        const distance =
          (targetDistances.get(positionKey(left)) ?? Infinity) -
          (targetDistances.get(positionKey(right)) ?? Infinity);
        // Code-unit order, not `localeCompare`: a Lured Warden must pick the
        // same tile on every device, and collation is locale-dependent.
        return distance || compareKeys(positionKey(left), positionKey(right));
      });
    const chosen = candidates[0] ?? warden;
    wardens.push({ ...chosen, id: warden.id, mode: "lured" });
  }
  return { ...run, wardens };
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
  const echoBridges = run.echoBridges.map((bridge) =>
    bridge.echoIndex === echoIndex ? { ...bridge, open: true } : bridge
  );
  const bridgeOpened = echoBridges.some(
    (bridge, index) => bridge.open && !run.echoBridges[index]?.open
  );
  const bridgeMessage = bridgeOpened ? " Bridge opened." : "";
  return {
    ...run,
    echoes,
    echoBridges,
    score: run.score + 50,
    gate: { ...run.gate, open: allCollected },
    event: {
      type: "echo-collected",
      message: allCollected
        ? run.gate.sealed
          ? `Final Echo recovered.${bridgeMessage} The Gate is open but sealed. The Gate Warden waits. You earned 50 score.`
          : `Final Echo recovered.${bridgeMessage} The Gate is open. You earned 50 score.`
        : `Echo recovered.${bridgeMessage} ${echoes.filter((echo) => !echo.collected).length} remain. You earned 50 score.`
    }
  };
}

/**
 * @param {GameRun} run
 * @returns {GameRun}
 */
function moveWardens(run) {
  const shortcuts = [...run.echoBridges, ...run.tideDoors];
  const reserved = new Set([
    positionKey(run.gate),
    ...run.echoes
      .filter((echo) => !echo.collected)
      .map((echo) => positionKey(echo))
  ]);
  const explorerDistances = distancesFrom(
    run.labyrinth,
    run.explorer,
    shortcuts
  );
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
    const candidates = passageNeighbors(
      run.labyrinth,
      warden,
      shortcuts
    ).filter(
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
    const targetDistances = distancesFrom(
      run.labyrinth,
      target,
      shortcuts
    );
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

  const warden = run.wardens[wardenIndex];
  return {
    ...run,
    status: "challenge",
    challenge: {
      wardenId: warden.id,
      question: null,
      attempt: 0,
      feedback: null,
      hintRevealed: false
    },
    event: {
      type: "challenge-started",
      message: "A Warden blocks the path. Answer its Question to defeat it."
    }
  };
}

/**
 * @param {GameRun} run
 * @param {Warden} warden
 * @param {number} wardenIndex
 * @returns {Warden}
 */
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

  const distances = distancesFrom(
    run.labyrinth,
    warden,
    [...run.echoBridges, ...run.tideDoors]
  );
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
    windways: run.windways.map((windway) => ({
      source: { ...windway.source },
      destination: { ...windway.destination },
      direction: windway.direction
    })),
    echoBridges: run.echoBridges.map((bridge) => ({
      echoIndex: bridge.echoIndex,
      from: { ...bridge.from },
      to: { ...bridge.to },
      open: bridge.open
    })),
    tideDoors: run.tideDoors.map((door) => ({
      id: door.id,
      from: { ...door.from },
      to: { ...door.to },
      open: door.open
    })),
    signalBells: run.signalBells.map((bell) => ({ ...bell })),
    ...(run.gateWarden
      ? { gateWarden: { ...run.gateWarden } }
      : {}),
    challenge: run.challenge
      ? {
          ...run.challenge,
          question: run.challenge.question
            ? {
                ...run.challenge.question,
                choices: run.challenge.question.choices.map((choice) => ({ ...choice }))
              }
            : null,
          feedback: run.challenge.feedback
            ? { ...run.challenge.feedback }
            : null
        }
      : null,
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
  const ruleset =
    input.ruleset === undefined
      ? getClassicRunRuleset(1)
      : normalizeKnownRunRuleset(input.ruleset);
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  let size = clampInteger(input.size, DEFAULT_CONFIG.size, 9, 25);
  if (size % 2 === 0) {
    size += size === 25 ? -1 : 1;
  }
  const config = {
    size,
    echoCount: clampInteger(input.echoCount, DEFAULT_CONFIG.echoCount, 0, 8),
    wardenCount: clampInteger(input.wardenCount, DEFAULT_CONFIG.wardenCount, 0, 6),
    vitality: clampInteger(input.vitality, DEFAULT_CONFIG.vitality, 1, 9),
    pulses: clampInteger(input.pulses, DEFAULT_CONFIG.pulses, 0, 5),
    ruleset
  };
  return input.gateWarden === true
    ? { ...config, gateWarden: true }
    : config;
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
 * Reduce a requested seed to the canonical form the Labyrinth generator reads.
 *
 * Returns `""` when nothing usable survives. It used to substitute a clock
 * reading instead, which meant a Run whose seed came from a malformed link
 * silently generated a different Labyrinth from the one the link named, and it
 * put a hidden clock read inside the deterministic core. Choosing a seed is a
 * caller's job now.
 *
 * @param {string} seed
 * @returns {string} the canonical seed, or `""` if the input carried none
 */
export function normalizeSeed(seed) {
  return String(seed ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
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
 * @param {(EchoBridge | TideDoor)[]} [shortcuts]
 */
function distancesFrom(labyrinth, start, shortcuts = []) {
  const distances = new Map([[positionKey(start), 0]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(positionKey(current)) ?? 0;
    for (const neighbor of passageNeighbors(
      labyrinth,
      current,
      shortcuts
    )) {
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
 * @param {(EchoBridge | TideDoor)[]} [shortcuts]
 */
function passageNeighbors(labyrinth, position, shortcuts = []) {
  const direct = DIRECTIONS.map((direction) => ({
    row: position.row + direction.row,
    col: position.col + direction.col
  })).filter((candidate) => isPassage(labyrinth, candidate));
  const shortcutNeighbors = shortcuts
    .filter((shortcut) => shortcut.open)
    .flatMap((shortcut) => {
      if (samePosition(shortcut.from, position)) {
        return [{ ...shortcut.to }];
      }
      if (samePosition(shortcut.to, position)) {
        return [{ ...shortcut.from }];
      }
      return [];
    });
  return [...direct, ...shortcutNeighbors].filter(
    (candidate, index, positions) =>
      positions.findIndex((position) => samePosition(position, candidate)) ===
      index
  );
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
 * @param {Position[]} positions
 * @param {Map<string, number>} distances
 * @param {Set<string>} occupied
 * @param {number} count
 * @param {() => number} random
 * @returns {SignalBell[]}
 */
function createSignalBells(
  positions,
  distances,
  occupied,
  count,
  random
) {
  return pickEntities(
    positions,
    distances,
    occupied,
    count,
    random,
    2
  ).map((position, id) => ({
    ...position,
    id,
    spent: false
  }));
}

/**
 * @param {number[][]} labyrinth
 * @param {Set<string>} protectedTiles
 * @param {Position[]} protectedPositions
 * @param {() => number} random
 * @param {number} count
 * @returns {Windway[]}
 */
function createWindways(
  labyrinth,
  protectedTiles,
  protectedPositions,
  random,
  count
) {
  const candidates = getOpenTiles(labyrinth).flatMap((source) =>
    DIRECTIONS.map((direction) => ({
      source,
      destination: {
        row: source.row + direction.row,
        col: source.col + direction.col
      },
      direction: direction.name
    })).filter(
      ({ destination }) =>
        !protectedTiles.has(positionKey(source)) &&
        !protectedTiles.has(positionKey(destination)) &&
        isPassage(labyrinth, destination)
    )
  );
  shuffle(candidates, random);
  const reserved = new Set(protectedTiles);
  /** @type {Windway[]} */
  const windways = [];
  for (const candidate of candidates) {
    const sourceKey = positionKey(candidate.source);
    const destinationKey = positionKey(candidate.destination);
    if (reserved.has(sourceKey) || reserved.has(destinationKey)) {
      continue;
    }
    const windway = {
      source: { ...candidate.source },
      destination: { ...candidate.destination },
      direction: candidate.direction
    };
    if (!protectedTilesRemainMutuallyReachable(
      labyrinth,
      protectedPositions,
      [...windways, windway]
    )) {
      continue;
    }
    windways.push(windway);
    reserved.add(sourceKey);
    reserved.add(destinationKey);
    if (windways.length === count) {
      break;
    }
  }
  return windways;
}

/**
 * @param {number[][]} labyrinth
 * @param {Set<string>} protectedTiles
 * @param {number} count
 * @param {() => number} random
 * @returns {EchoBridge[]}
 */
function createEchoBridges(labyrinth, protectedTiles, count, random) {
  return selectShortcutEdges(labyrinth, protectedTiles, count, random)
    .map((bridge, echoIndex) => ({
      echoIndex,
      from: { ...bridge.from },
      to: { ...bridge.to },
      open: false
    }));
}

/**
 * @param {number[][]} labyrinth
 * @param {Set<string>} protectedTiles
 * @param {number} count
 * @param {() => number} random
 * @returns {TideDoor[]}
 */
function createTideDoors(labyrinth, protectedTiles, count, random) {
  return selectShortcutEdges(labyrinth, protectedTiles, count, random)
    .map((door, id) => ({
      id,
      from: { ...door.from },
      to: { ...door.to },
      open: true
    }));
}

/**
 * @param {number[][]} labyrinth
 * @param {Set<string>} protectedTiles
 * @param {number} count
 * @param {() => number} random
 * @returns {{ from: Position, to: Position }[]}
 */
function selectShortcutEdges(labyrinth, protectedTiles, count, random) {
  const candidates = [];
  for (let row = 1; row < labyrinth.length - 1; row += 1) {
    for (let col = 1; col < labyrinth[row].length - 1; col += 1) {
      if (labyrinth[row][col] !== 0) {
        continue;
      }
      const pairs = [
        [
          { row, col: col - 1 },
          { row, col: col + 1 }
        ],
        [
          { row: row - 1, col },
          { row: row + 1, col }
        ]
      ];
      for (const [from, to] of pairs) {
        if (
          isPassage(labyrinth, from) &&
          isPassage(labyrinth, to) &&
          !protectedTiles.has(positionKey(from)) &&
          !protectedTiles.has(positionKey(to))
        ) {
          candidates.push({ from, to });
        }
      }
    }
  }
  shuffle(candidates, random);
  const reserved = new Set(protectedTiles);
  const selected = [];
  for (const candidate of candidates) {
    if (
      reserved.has(positionKey(candidate.from)) ||
      reserved.has(positionKey(candidate.to))
    ) {
      continue;
    }
    selected.push(candidate);
    reserved.add(positionKey(candidate.from));
    reserved.add(positionKey(candidate.to));
    if (selected.length === count) {
      break;
    }
  }
  if (selected.length < count) {
    for (const candidate of candidates) {
      if (
        selected.some(
          (bridge) =>
            samePosition(bridge.from, candidate.from) &&
            samePosition(bridge.to, candidate.to)
        )
      ) {
        continue;
      }
      selected.push(candidate);
      if (selected.length === count) {
        break;
      }
    }
  }
  return selected;
}

/**
 * @param {(EchoBridge | TideDoor)[]} shortcuts
 * @param {Position} position
 * @param {Position} wall
 */
function openShortcutAcrossWall(shortcuts, position, wall) {
  for (const shortcut of shortcuts) {
    if (!shortcut.open) {
      continue;
    }
    const midpoint = {
      row: (shortcut.from.row + shortcut.to.row) / 2,
      col: (shortcut.from.col + shortcut.to.col) / 2
    };
    if (!samePosition(midpoint, wall)) {
      continue;
    }
    if (samePosition(shortcut.from, position)) {
      return { shortcut, destination: shortcut.to };
    }
    if (samePosition(shortcut.to, position)) {
      return { shortcut, destination: shortcut.from };
    }
  }
  return undefined;
}

/**
 * @param {number[][]} labyrinth
 * @param {Position[]} protectedPositions
 * @param {Windway[]} windways
 */
function protectedTilesRemainMutuallyReachable(
  labyrinth,
  protectedPositions,
  windways
) {
  const destinationsBySource = new Map(
    windways.map(({ source, destination }) => [
      positionKey(source),
      destination
    ])
  );
  const protectedKeys = protectedPositions.map(positionKey);
  return protectedPositions.every((start) => {
    const queue = [start];
    const visited = new Set([positionKey(start)]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const direction of DIRECTIONS) {
        const directTarget = {
          row: current.row + direction.row,
          col: current.col + direction.col
        };
        if (!isPassage(labyrinth, directTarget)) {
          continue;
        }
        const next =
          destinationsBySource.get(positionKey(directTarget)) ?? directTarget;
        const nextKey = positionKey(next);
        if (!visited.has(nextKey)) {
          visited.add(nextKey);
          queue.push(next);
        }
      }
    }
    return protectedKeys.every((key) => visited.has(key));
  });
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
