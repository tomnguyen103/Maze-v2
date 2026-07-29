import { describe, expect, it } from "vitest";
import { applyAction, createRun } from "../src/game/game-session.js";
import {
  ACTIVE_RUN_RECOVERY_KEY,
  ACTIVE_RUN_RECOVERY_MAX_ACTIONS,
  ACTIVE_RUN_RECOVERY_MAX_BYTES,
  createActiveRunRecoveryController,
  recoveryPayloadWithinBounds
} from "../src/game/active-run-recovery.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { buildRunReplayTimeline } from "../src/game/run-replay.js";

/**
 * @typedef {"up" | "right" | "down" | "left"} Direction
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem: (key: string) => unknown
 * }} StorageLike
 * @typedef {{
 *   version: 2 | 3,
 *   runId: string,
 *   pending: false,
 *   seed: string,
 *   levelId: "bright-start" | "trail-scout" | "maze-master",
 *   labyrinthNumber: number,
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} RecoveryLocator
 * @typedef {ReturnType<typeof createActiveRunRecoveryController>} RecoveryController
 */

const LOCATOR = Object.freeze({
  version: 2,
  runId: "run_recovery_123",
  pending: false,
  seed: "CAMPFIRE-17",
  levelId: "bright-start",
  labyrinthNumber: 1
});
const GATE_LOCATOR = Object.freeze({
  ...LOCATOR,
  runId: "run_recovery_gate_123",
  labyrinthNumber: 4
});
const RULESET_LOCATOR = Object.freeze({
  version: 3,
  runId: "run_recovery_rules_123",
  pending: false,
  seed: "CAMPFIRE-RULES-09",
  levelId: "trail-scout",
  labyrinthNumber: 9,
  atlasRegionId: "capable",
  rulesetRevision: "echo-bridges-v1"
});

/** @returns {StorageLike & { readonly writes: number, readonly removals: number }} */
function createMemoryStorage() {
  const values = new Map();
  let writes = 0;
  let removals = 0;
  return {
    get writes() {
      return writes;
    },
    get removals() {
      return removals;
    },
    /** @param {string} key */
    getItem(key) {
      return values.get(key) ?? null;
    },
    /** @param {string} key @param {string} value */
    setItem(key, value) {
      writes += 1;
      values.set(key, value);
    },
    /** @param {string} key */
    removeItem(key) {
      removals += 1;
      values.delete(key);
    }
  };
}

/** @param {RecoveryLocator} [locator] */
function initialRun(locator = LOCATOR) {
  return createRun(
    locator.seed,
    {
      ...getLabyrinthConfig(locator.levelId, locator.labyrinthNumber),
      ...(locator.atlasRegionId && locator.rulesetRevision
        ? {
            ruleset: {
              atlasRegionId: locator.atlasRegionId,
              revision: locator.rulesetRevision
            }
          }
        : {})
    }
  );
}

/** @param {ReturnType<typeof createRun>} run */
function firstLegalDirection(run) {
  /** @type {{ direction: Direction, row: number, col: number }[]} */
  const directions = [
    { direction: "up", row: -1, col: 0 },
    { direction: "right", row: 0, col: 1 },
    { direction: "down", row: 1, col: 0 },
    { direction: "left", row: 0, col: -1 }
  ];
  const legal = directions.find(
    (move) =>
      run.labyrinth[run.explorer.row + move.row]?.[
        run.explorer.col + move.col
      ] === 1
  );
  if (!legal) {
    throw new Error("Expected a legal recovery fixture move.");
  }
  return /** @type {"up" | "right" | "down" | "left"} */ (
    legal.direction
  );
}

/**
 * @param {RecoveryController} controller
 * @param {ReturnType<typeof createRun>} run
 * @param {Parameters<typeof applyAction>[1]} action
 */
function durableTransition(controller, run, action) {
  const next = applyAction(run, action);
  const result = controller.record(run, action, next);
  return { run: next, result };
}

/** @param {ReturnType<typeof createRun>} run */
function comparableState(run) {
  return {
    seed: run.seed,
    config: run.config,
    labyrinth: run.labyrinth,
    explorer: run.explorer,
    echoes: run.echoes,
    gate: run.gate,
    gateWarden: run.gateWarden,
    wardens: run.wardens,
    challenge: run.challenge,
    revealed: run.revealed,
    pulseVisible: run.pulseVisible,
    pulseExpiresAt: run.pulseExpiresAt,
    pulses: run.pulses,
    score: run.score,
    wardensDefeated: run.wardensDefeated,
    freeQuestionSkipAvailable: run.freeQuestionSkipAvailable,
    moves: run.moves,
    lastDirection: run.lastDirection,
    elapsedMs: run.elapsedMs
  };
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {{ row: number, col: number }} goal
 * @returns {Direction[]}
 */
function pathTo(run, goal) {
  /** @param {{ row: number, col: number }} position */
  const key = (position) => `${position.row},${position.col}`;
  const startKey = key(run.explorer);
  const goalKey = key(goal);
  /** @type {{ row: number, col: number }[]} */
  const queue = [run.explorer];
  /** @type {Map<string, null | { prior: string, direction: Direction }>} */
  const previous = new Map([[startKey, null]]);
  /** @type {{ direction: Direction, row: number, col: number }[]} */
  const moves = [
    { direction: "up", row: -1, col: 0 },
    { direction: "right", row: 0, col: 1 },
    { direction: "down", row: 1, col: 0 },
    { direction: "left", row: 0, col: -1 }
  ];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (key(current) === goalKey) {
      break;
    }
    for (const move of moves) {
      const next = {
        row: current.row + move.row,
        col: current.col + move.col
      };
      const nextKey = key(next);
      if (
        run.labyrinth[next.row]?.[next.col] !== 1 ||
        previous.has(nextKey)
      ) {
        continue;
      }
      previous.set(nextKey, {
        prior: key(current),
        direction: move.direction
      });
      queue.push(next);
    }
  }
  /** @type {Direction[]} */
  const path = [];
  let cursor = goalKey;
  while (cursor !== startKey) {
    const step = previous.get(cursor);
    if (!step) {
      throw new Error(`No passage path to ${goalKey}.`);
    }
    path.unshift(step.direction);
    cursor = step.prior;
  }
  return path;
}

/**
 * @param {RecoveryController} controller
 * @param {{ revealFirstHint?: boolean }} [options]
 */
function finishWinningRun(controller, { revealFirstHint = false } = {}) {
  let run = initialRun();
  const pulseTransition = durableTransition(controller, run, { type: "pulse" });
  run = pulseTransition.run;
  let terminalResult = pulseTransition.result;
  let questionOrdinal = 0;
  for (let step = 0; step < 800 && run.status !== "won"; step += 1) {
    if (run.status === "challenge") {
      const question = getBundledQuestion({
        levelId: LOCATOR.levelId,
        seed: LOCATOR.seed,
        wardenId: run.challenge?.wardenId ?? 0,
        attempt: run.challenge?.attempt ?? 0,
        labyrinthNumber: LOCATOR.labyrinthNumber,
        questionOrdinal
      });
      questionOrdinal += 1;
      ({ run } = durableTransition(controller, run, {
        type: "provide-question",
        question
      }));
      if (revealFirstHint && questionOrdinal === 1) {
        ({ run } = durableTransition(controller, run, {
          type: "reveal-hint"
        }));
      }
      const transition = durableTransition(controller, run, {
        type: "answer-question",
        answerId: question.answerId
      });
      run = transition.run;
      terminalResult = transition.result;
      continue;
    }
    const target =
      run.echoes.find((echo) => !echo.collected) ?? run.gate;
    const direction = pathTo(run, target)[0];
    if (!direction) {
      throw new Error("Expected a route toward the next Run objective.");
    }
    const transition = durableTransition(controller, run, {
      type: "move",
      direction
    });
    run = transition.run;
    terminalResult = transition.result;
  }
  if (run.status !== "won") {
    throw new Error("Expected the recovery fixture to escape.");
  }
  return { run, terminalResult };
}

/**
 * @param {RecoveryController} controller
 * @param {RecoveryLocator} [locator]
 */
function reachChallenge(controller, locator = LOCATOR) {
  let run = initialRun(locator);
  for (let step = 0; step < 800 && run.status !== "challenge"; step += 1) {
    const target =
      run.echoes.find((echo) => !echo.collected) ?? run.gate;
    const direction = pathTo(run, target)[0];
    if (!direction) {
      throw new Error("Expected a path toward the next objective.");
    }
    ({ run } = durableTransition(controller, run, {
      type: "move",
      direction
    }));
  }
  if (run.status !== "challenge") {
    throw new Error("Recovery fixture did not reach a Warden.");
  }
  return run;
}

/**
 * @param {StorageLike} storage
 * @param {ReturnType<typeof createRun>} expected
 */
function expectRecoveredState(storage, expected) {
  const recovered = createActiveRunRecoveryController({
    storage
  }).load(LOCATOR);
  expect(recovered.status).toBe("recovered");
  if (!recovered.run) {
    throw new Error("Expected a recovered Run.");
  }
  expect(comparableState(recovered.run)).toEqual(
    comparableState(expected)
  );
  expect(recovered.run?.status).toBe(
    expected.status === "active" ? "paused" : expected.status
  );
}

/** @param {RecoveryController} controller */
function reachGateWardenChallenge(controller) {
  let run = initialRun(GATE_LOCATOR);
  let questionOrdinal = 0;
  for (let step = 0; step < 2000; step += 1) {
    if (
      run.status === "challenge" &&
      run.challenge?.kind === "gate-warden"
    ) {
      return run;
    }
    if (run.status === "challenge" && run.challenge) {
      const question = getBundledQuestion({
        levelId: GATE_LOCATOR.levelId,
        seed: run.seed,
        wardenId: run.challenge.wardenId,
        attempt: run.challenge.attempt,
        labyrinthNumber: GATE_LOCATOR.labyrinthNumber,
        questionOrdinal
      });
      questionOrdinal += 1;
      ({ run } = durableTransition(controller, run, {
        type: "provide-question",
        question
      }));
      ({ run } = durableTransition(controller, run, {
        type: "answer-question",
        answerId: question.answerId
      }));
      continue;
    }
    const target =
      run.echoes.find((echo) => !echo.collected) ?? run.gate;
    const direction = pathTo(run, target)[0];
    if (!direction) {
      throw new Error("Expected a path toward the Gate Warden.");
    }
    ({ run } = durableTransition(controller, run, {
      type: "move",
      direction
    }));
  }
  throw new Error("Recovery fixture did not reach the Gate Warden.");
}

describe("Active Run Recovery", () => {
  it("preserves exact Region rules through recovery reconstruction", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(RULESET_LOCATOR);
    const run = initialRun(RULESET_LOCATOR);
    const transition = durableTransition(controller, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });

    const recovered = createActiveRunRecoveryController({
      storage
    }).load(RULESET_LOCATOR);

    expect(recovered.status).toBe("recovered");
    expect(recovered.run?.ruleset).toEqual(run.ruleset);
    expect(transition.run.ruleset).toEqual(run.ruleset);
    expect(
      JSON.parse(storage.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? "{}").identity
    ).toMatchObject({
      atlasRegionId: "capable",
      rulesetRevision: "echo-bridges-v1"
    });
  });

  it("restores acknowledged movement, Pulse state, and durable elapsed time exactly", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let run = initialRun();
    run = applyAction(run, { type: "tick", deltaMs: 1250 });

    const direction = firstLegalDirection(run);
    let transition = durableTransition(controller, run, {
      type: "move",
      direction
    });
    run = transition.run;
    expect(transition.result.status).toBe("saved");

    run = applyAction(run, { type: "tick", deltaMs: 750 });
    transition = durableTransition(controller, run, { type: "pulse" });
    run = transition.run;
    expect(transition.result.status).toBe("saved");
    expect(storage.writes).toBe(2);

    const recovered = createActiveRunRecoveryController({
      storage
    }).load(LOCATOR);
    expect(recovered.status).toBe("recovered");
    expect(recovered.run?.status).toBe("paused");
    if (!recovered.run) {
      throw new Error("Expected a recovered Run.");
    }
    expect(comparableState(recovered.run)).toEqual(comparableState(run));
    expect(recovered.run.elapsedMs).toBe(2000);
  });

  it("ignores blocked and no-op actions without creating false checkpoints", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    const run = initialRun();
    const blocked = durableTransition(controller, run, {
      type: "move",
      direction: "up"
    });

    expect(blocked.run.moves).toBe(0);
    expect(blocked.result.status).toBe("unchanged");
    expect(storage.writes).toBe(0);
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it("pins the exact reviewed Question and Hint state without a provider", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let run = reachChallenge(controller);
    const question = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: LOCATOR.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      attempt: run.challenge?.attempt ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 4
    });

    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question
    }));
    ({ run } = durableTransition(controller, run, {
      type: "reveal-hint"
    }));

    const recovered = createActiveRunRecoveryController({
      storage
    }).load(LOCATOR);
    expect(recovered.status).toBe("recovered");
    expect(recovered.run?.challenge?.question).toEqual(question);
    expect(recovered.run?.challenge?.hintRevealed).toBe(true);
    if (!recovered.run) {
      throw new Error("Expected a recovered Challenge.");
    }
    expect(comparableState(recovered.run)).toEqual(comparableState(run));
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toContain(
      question.prompt
    );
  });

  it("compacts a resolved Challenge to outcome-only recovery data", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let run = reachChallenge(controller);
    const question = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 9
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question
    }));
    const wrongAnswerId = question.choices.find(
      (choice) => choice.id !== question.answerId
    )?.id;
    if (!wrongAnswerId) {
      throw new Error("Expected a reviewed wrong answer.");
    }
    ({ run } = durableTransition(controller, run, {
      type: "answer-question",
      answerId: wrongAnswerId
    }));

    const serialized =
      storage.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? "";
    const envelope = JSON.parse(serialized);
    expect(envelope.actions.at(-1)).toMatchObject({
      type: "challenge-outcome",
      outcome: "wrong",
      explanation: question.explanation
    });
    expect(serialized).not.toContain(question.prompt);
    expect(serialized).not.toContain(`"answerId"`);
    expectRecoveredState(storage, run);
  });

  it("reconstructs wrong answers, replacements, both Skips, and Warden defeat", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let run = reachChallenge(controller);
    const initialVitality = run.explorer.vitality;

    const wrongQuestion = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 0
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question: wrongQuestion
    }));
    const wrongAnswerId = wrongQuestion.choices.find(
      (choice) => choice.id !== wrongQuestion.answerId
    )?.id;
    if (!wrongAnswerId) {
      throw new Error("Expected an incorrect reviewed option.");
    }
    ({ run } = durableTransition(controller, run, {
      type: "answer-question",
      answerId: wrongAnswerId
    }));
    expect(run.challenge?.feedback?.kind).toBe("wrong");
    expect(run.challenge?.question).toBeNull();
    expect(run.explorer.vitality).toBe(initialVitality - 1);
    expectRecoveredState(storage, run);

    const freeSkipQuestion = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 1
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question: freeSkipQuestion
    }));
    expect(run.challenge?.feedback?.kind).toBe("wrong");
    expect(
      storage.getItem(ACTIVE_RUN_RECOVERY_KEY)
    ).toContain(wrongQuestion.explanation);
    expectRecoveredState(storage, run);
    ({ run } = durableTransition(controller, run, {
      type: "skip-question"
    }));
    expect(run.challenge?.feedback?.kind).toBe("skipped");
    expect(run.freeQuestionSkipAvailable).toBe(false);
    expect(run.explorer.vitality).toBe(initialVitality - 1);
    expectRecoveredState(storage, run);

    const paidSkipQuestion = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 2
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question: paidSkipQuestion
    }));
    ({ run } = durableTransition(controller, run, {
      type: "skip-question"
    }));
    expect(run.challenge?.feedback?.kind).toBe("skipped");
    expect(run.explorer.vitality).toBe(initialVitality - 2);
    expectRecoveredState(storage, run);

    const correctQuestion = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 3
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question: correctQuestion
    }));
    ({ run } = durableTransition(controller, run, {
      type: "answer-question",
      answerId: correctQuestion.answerId
    }));
    expect(run.status).toBe("active");
    expect(run.wardensDefeated).toBe(1);
    expectRecoveredState(storage, run);

    const serialized =
      storage.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? "";
    const envelope = JSON.parse(serialized);
    expect(
      envelope.actions
        .filter(
          (/** @type {{ type?: string }} */ entry) =>
            entry.type === "challenge-outcome"
        )
        .map(
          (/** @type {{ outcome?: string }} */ entry) =>
            entry.outcome
        )
    ).toEqual(["wrong", "skip", "skip", "correct"]);
    expect(serialized).not.toContain(wrongQuestion.explanation);
    expect(serialized).not.toContain(wrongQuestion.prompt);
    expect(serialized).not.toContain(correctQuestion.prompt);
    expect(serialized).not.toContain(`"answerId"`);
    expect(serialized).not.toContain(`"provide-question"`);
    expect(serialized).not.toMatch(
      /account|analytics|email|providerDebug|userAuthored/i
    );
  });

  it("reconstructs the Gate Warden seal and defeat state", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(GATE_LOCATOR);
    let run = reachGateWardenChallenge(controller);
    expect(run.challenge?.kind).toBe("gate-warden");
    expect(run.gateWarden?.defeated).toBe(false);

    const question = getBundledQuestion({
      levelId: GATE_LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      attempt: run.challenge?.attempt ?? 0,
      labyrinthNumber: GATE_LOCATOR.labyrinthNumber,
      questionOrdinal: 40,
      challengeKind: "gate-warden"
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question
    }));
    ({ run } = durableTransition(controller, run, {
      type: "answer-question",
      answerId: question.answerId
    }));

    expect(run.gateWarden?.defeated).toBe(true);
    expect(run.gate.sealed).toBe(false);
    const recovered = createActiveRunRecoveryController({
      storage
    }).load(GATE_LOCATOR);
    expect(recovered.status).toBe("recovered");
    if (!recovered.run) {
      throw new Error("Expected a recovered Gate Warden Run.");
    }
    expect(recovered.run?.gateWarden).toEqual(run.gateWarden);
    expect(recovered.run?.gate).toEqual(run.gate);
    expect(comparableState(recovered.run)).toEqual(
      comparableState(run)
    );
  });

  it("returns an outcome-only escape Replay with equal terminal facts", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);

    const { run, terminalResult } = finishWinningRun(controller, {
      revealFirstHint: true
    });

    expect(terminalResult?.status).toBe("terminal");
    const replay =
      terminalResult && "replay" in terminalResult
        ? terminalResult.replay
        : null;
    const timeline = buildRunReplayTimeline({
      seed: run.seed,
      questLevelId: LOCATOR.levelId,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      atlasRegionId: run.ruleset.atlasRegionId,
      rulesetRevision: run.ruleset.revision,
      replay
    });
    expect(timeline.terminal).toMatchObject({
      outcome: "escaped",
      moves: run.moves,
      elapsedMs: Math.round(run.elapsedMs),
      echoesCollected: run.echoes.length,
      echoTotal: run.echoes.length,
      wardensDefeated: run.wardensDefeated,
      score: run.score,
      vitality: run.explorer.vitality
    });
    expect(timeline.states.at(-1)?.status).toBe("won");
    expect(replay?.actions).toContainEqual(
      expect.objectContaining({ type: "hint" })
    );
    expect(timeline.events).toContainEqual(
      expect.objectContaining({
        label: "Hint revealed without retaining Question text."
      })
    );
    expect(JSON.stringify(replay)).not.toMatch(
      /answerId|choices|question|provider|account|email|runId/i
    );
  });

  it("clears terminal recovery and selected answer identifiers", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let run = reachChallenge(controller);
    const question = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: LOCATOR.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      attempt: 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 3
    });
    ({ run } = durableTransition(controller, run, {
      type: "provide-question",
      question
    }));
    const startingVitality = run.explorer.vitality;
    let terminalReplay = null;
    for (let attempt = 0; attempt < startingVitality; attempt += 1) {
      const currentQuestion =
        attempt === 0
          ? question
          : getBundledQuestion({
              levelId: LOCATOR.levelId,
              seed: LOCATOR.seed,
              wardenId: run.challenge?.wardenId ?? 0,
              attempt,
              labyrinthNumber: LOCATOR.labyrinthNumber,
              questionOrdinal: 3 + attempt
            });
      if (attempt > 0) {
        ({ run } = durableTransition(controller, run, {
          type: "provide-question",
          question: currentQuestion
        }));
      }
      const answer = currentQuestion.choices.find(
        (choice) => choice.id !== currentQuestion.answerId
      );
      if (!answer) {
        throw new Error("Expected a reviewed wrong answer.");
      }
      const transition = durableTransition(controller, run, {
        type: "answer-question",
        answerId: answer.id
      });
      run = transition.run;
      if (attempt === startingVitality - 1) {
        expect(transition.result.status).toBe("terminal");
        terminalReplay =
          "replay" in transition.result
            ? transition.result.replay ?? null
            : null;
      }
    }

    expect(run.status).toBe("lost");
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
    expect(terminalReplay).toMatchObject({
      version: 1,
      terminal: {
        outcome: "defeated",
        moves: run.moves,
        elapsedMs: Math.round(run.elapsedMs),
        echoesCollected: run.echoes.filter((echo) => echo.collected).length,
        echoTotal: run.echoes.length,
        wardensDefeated: run.wardensDefeated,
        score: run.score,
        vitality: 0
      }
    });
    const serializedReplay = JSON.stringify(terminalReplay);
    expect(serializedReplay).not.toContain(question.prompt);
    expect(serializedReplay).not.toContain(question.answerId);
    expect(serializedReplay).not.toMatch(
      /answerId|choices|question|provider|account|email|runId/i
    );
    expect(buildRunReplayTimeline({
      seed: run.seed,
      questLevelId: LOCATOR.levelId,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      atlasRegionId: run.ruleset.atlasRegionId,
      rulesetRevision: run.ruleset.revision,
      replay: terminalReplay
    }).terminal).toEqual(terminalReplay?.terminal);
  });

  it("enforces the 2,048-action and 256-KiB serialized bounds", () => {
    const base = {
      version: 1,
      identity: LOCATOR,
      actions: [],
      checkpoint: {}
    };
    expect(
      recoveryPayloadWithinBounds({
        ...base,
        actions: Array.from(
          { length: ACTIVE_RUN_RECOVERY_MAX_ACTIONS + 1 },
          () => ({ type: "pulse", elapsedMs: 0 })
        )
      })
    ).toEqual({ ok: false, reason: "action-limit" });
    expect(
      recoveryPayloadWithinBounds({
        ...base,
        checkpoint: {
          oversized: "x".repeat(ACTIVE_RUN_RECOVERY_MAX_BYTES)
        }
      })
    ).toEqual({ ok: false, reason: "size-limit" });
  });

  it("clears recovery at the action limit without changing current-tab state", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    let currentTabRun = initialRun();
    for (
      let index = 0;
      index < ACTIVE_RUN_RECOVERY_MAX_ACTIONS;
      index += 1
    ) {
      const next = {
        ...currentTabRun,
        moves: currentTabRun.moves + 1
      };
      expect(
        controller.record(
          currentTabRun,
          { type: "move", direction: "right" },
          next
        ).status
      ).toBe("saved");
      currentTabRun = next;
    }
    const next = {
      ...currentTabRun,
      moves: currentTabRun.moves + 1
    };
    expect(
      controller.record(
        currentTabRun,
        { type: "move", direction: "right" },
        next
      )
    ).toEqual({
      status: "unavailable",
      reason: "action-limit"
    });

    expect(next.moves).toBe(ACTIVE_RUN_RECOVERY_MAX_ACTIONS + 1);
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it.each([
    ["invalid JSON", "{"],
    [
      "unknown version",
      JSON.stringify({
        version: 99,
        identity: LOCATOR,
        actions: [],
        checkpoint: {}
      })
    ],
    [
      "invalid identity",
      JSON.stringify({
        version: 1,
        identity: { ...LOCATOR, runId: "other_run_123" },
        actions: [],
        checkpoint: {}
      })
    ],
    [
      "malformed action",
      JSON.stringify({
        version: 1,
        identity: LOCATOR,
        actions: [{ type: "teleport", elapsedMs: 0 }],
        checkpoint: {}
      })
    ]
  ])("clears %s safely", (_label, stored) => {
    const storage = createMemoryStorage();
    storage.setItem(ACTIVE_RUN_RECOVERY_KEY, stored);

    const result = createActiveRunRecoveryController({
      storage
    }).load(LOCATOR);

    expect(result.status).toBe("invalid");
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it("rejects impossible replay divergence instead of installing state", () => {
    const storage = createMemoryStorage();
    const writer = createActiveRunRecoveryController({ storage });
    writer.begin(LOCATOR);
    const run = initialRun();
    durableTransition(writer, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });
    const envelope = JSON.parse(
      storage.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? "{}"
    );
    envelope.checkpoint.moves = 999;
    storage.setItem(
      ACTIVE_RUN_RECOVERY_KEY,
      JSON.stringify(envelope)
    );

    const result = createActiveRunRecoveryController({
      storage
    }).load(LOCATOR);

    expect(result.status).toBe("invalid");
    expect(storage.getItem(ACTIVE_RUN_RECOVERY_KEY)).toBeNull();
  });

  it("fails storage writes safely without blocking current-tab state", () => {
    const storage = {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("storage denied");
      },
      removeItem() {}
    };
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    const run = initialRun();
    const transition = durableTransition(controller, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });

    expect(transition.run.moves).toBe(1);
    expect(transition.result).toEqual({
      status: "unavailable",
      reason: "storage"
    });
  });

  it("reports a failed checkpoint deletion instead of claiming it cleared", () => {
    const storage = createMemoryStorage();
    const writer = createActiveRunRecoveryController({ storage });
    writer.begin(LOCATOR);
    const run = initialRun();
    durableTransition(writer, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });
    const stored = storage.getItem(ACTIVE_RUN_RECOVERY_KEY);
    const deniedStorage = {
      getItem() {
        return stored;
      },
      setItem() {
        throw new Error("storage denied");
      },
      removeItem() {
        throw new Error("storage denied");
      }
    };
    const controller = createActiveRunRecoveryController({
      storage: deniedStorage
    });

    expect(controller.load(LOCATOR).status).toBe("recovered");
    expect(controller.clear()).toEqual({
      status: "unavailable",
      reason: "storage"
    });
    expect(deniedStorage.getItem()).toBe(stored);
  });

  it("scrubs Challenge content when deletion is denied but overwrite works", () => {
    const storage = createMemoryStorage();
    const writer = createActiveRunRecoveryController({ storage });
    writer.begin(LOCATOR);
    let run = reachChallenge(writer);
    const question = getBundledQuestion({
      levelId: LOCATOR.levelId,
      seed: run.seed,
      wardenId: run.challenge?.wardenId ?? 0,
      labyrinthNumber: LOCATOR.labyrinthNumber,
      questionOrdinal: 8
    });
    ({ run } = durableTransition(writer, run, {
      type: "provide-question",
      question
    }));
    const wrongAnswerId = question.choices.find(
      (choice) => choice.id !== question.answerId
    )?.id;
    if (!wrongAnswerId) {
      throw new Error("Expected a reviewed wrong answer.");
    }
    durableTransition(writer, run, {
      type: "answer-question",
      answerId: wrongAnswerId
    });
    let stored = storage.getItem(ACTIVE_RUN_RECOVERY_KEY);
    const removeDeniedStorage = {
      getItem() {
        return stored;
      },
      /** @param {string} _key @param {string} value */
      setItem(_key, value) {
        stored = value;
      },
      removeItem() {
        throw new Error("deletion denied");
      }
    };
    const controller = createActiveRunRecoveryController({
      storage: removeDeniedStorage
    });
    expect(controller.load(LOCATOR).status).toBe("recovered");

    expect(controller.clear()).toEqual({ status: "cleared" });
    expect(stored).toBe("");
    expect(stored).not.toContain(question.prompt);
    expect(stored).not.toContain(wrongAnswerId);
  });

  it("treats a denied global storage getter as unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage denied");
      }
    });

    try {
      const controller = createActiveRunRecoveryController();
      const result = controller.begin(LOCATOR);
      const run = initialRun();
      const next = applyAction(run, {
        type: "move",
        direction: firstLegalDirection(run)
      });

      expect(next.moves).toBe(1);
      expect(result).toEqual({
        status: "unavailable",
        reason: "storage"
      });
    } finally {
      if (descriptor) {
        Object.defineProperty(
          globalThis,
          "localStorage",
          descriptor
        );
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

  it("fails open when an accepted Question cannot be normalized", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    const run = reachChallenge(controller);
    const malformedQuestion =
      /** @type {Parameters<typeof applyAction>[1]} */ (
        /** @type {unknown} */ ({
        type: "provide-question",
        question: {
          id: "malformed-question",
          prompt: "This card reaches canonical play.",
          choices: [{}],
          correctChoiceId: "missing",
          hint: "Missing reviewed fields."
        }
        })
      );
    const next = applyAction(
      run,
      malformedQuestion
    );

    /** @type {ReturnType<RecoveryController["record"]> | undefined} */
    let result;
    expect(() => {
      result = controller.record(
        run,
        malformedQuestion,
        next
      );
    }).not.toThrow();
    expect(result).toEqual({
      status: "unavailable",
      reason: "serialization"
    });
    expect(next.challenge?.question?.id).toBe("malformed-question");
  });

  it("removes a partial write when storage throws after mutation", () => {
    /** @type {string | null} */
    let stored = null;
    const storage = {
      getItem() {
        return stored;
      },
      /** @param {string} _key @param {string} value */
      setItem(_key, value) {
        stored = value;
        throw new Error("storage failed after mutation");
      },
      removeItem() {
        stored = null;
      }
    };
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    const run = initialRun();
    const transition = durableTransition(controller, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });

    expect(transition.run.moves).toBe(1);
    expect(transition.result).toEqual({
      status: "unavailable",
      reason: "storage"
    });
    expect(stored).toBeNull();
  });

  it("stores only bounded Run identity, canonical actions, and reviewed content", () => {
    const storage = createMemoryStorage();
    const controller = createActiveRunRecoveryController({ storage });
    controller.begin(LOCATOR);
    const run = initialRun();
    durableTransition(controller, run, {
      type: "move",
      direction: firstLegalDirection(run)
    });
    const serialized =
      storage.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? "";

    expect(serialized).toContain(LOCATOR.runId);
    expect(serialized).not.toMatch(
      /account|analytics|email|username|userId|displayName/i
    );
  });
});
