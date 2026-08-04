import {
  applyAction,
  createRun,
  normalizeSeed
} from "../src/game/game-session.js";
import {
  RUN_ACTION_LOG_MAX_ACTIONS,
  RUN_ACTION_LOG_VERSION
} from "../src/game/run-action-log.js";
import {
  RUN_ACTION_LOG_V2_MAX_ACTIONS,
  RUN_ACTION_LOG_V2_VERSION
} from "../src/game/run-action-log-v2.js";

export const RUN_REPLAY_LIMITS = Object.freeze({
  maxActions: RUN_ACTION_LOG_MAX_ACTIONS,
  maxBytes: 64 * 1024,
  // An offline Quest Run may span every Trail Twist and four times the
  // actions a Daily allows, and each answer entry carries a revision id.
  maxOfflineBytes: 512 * 1024,
  maxElapsedMs: 4 * 60 * 60 * 1000
});

const DIRECTIONS = new Set(["up", "right", "down", "left"]);
const ANSWER_ID_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const REVISION_ID_PATTERN = /^[a-z0-9:_-]{1,120}$/i;

export class ReplayInputError extends Error {}

/**
 * `createRun` refuses a seed that normalizes to nothing rather than inventing
 * one. Callers of this module classify on `ReplayInputError`, so the refusal
 * has to arrive as one.
 *
 * @param {string} seed
 */
function assertReplayableSeed(seed) {
  if (!normalizeSeed(seed)) {
    throw new ReplayInputError("This Run's seed is missing or unusable.");
  }
}

/**
 * @param {unknown} value
 * @param {{
 *   seed: string,
 *   config: Parameters<typeof createRun>[1],
 *   questionFor?: (
 *     index: number,
 *     context: { run: ReturnType<typeof createRun> }
 *   ) => ReturnType<
 *     (typeof import("../src/questions/question-bank.js"))["getBundledQuestion"]
 *   >,
 *   onStep?: (
 *     run: ReturnType<typeof createRun>,
 *     action: { type: string } | null
 *   ) => void
 * }} trusted
 */
export function verifyRunReplay(value, trusted) {
  const log = validateLog(value);
  assertReplayableSeed(trusted.seed);
  let run = createRun(trusted.seed, trusted.config);
  let elapsedMs = 0;
  let questionIndex = 0;
  trusted.onStep?.(run, null);

  for (const rawEntry of log.actions) {
    if (run.status === "won" || run.status === "lost") {
      throw new ReplayInputError(
        "An action cannot appear after the Run reached a terminal state."
      );
    }
    const entry = validateEntry(rawEntry, elapsedMs);
    const deltaMs = entry.elapsedMs - elapsedMs;
    if (deltaMs > 0) {
      if (run.status !== "active") {
        throw new ReplayInputError(
          "Run elapsed time cannot advance during a Warden Challenge."
        );
      }
      run = applyAction(run, { type: "tick", deltaMs });
    }
    elapsedMs = entry.elapsedMs;

    if (run.status === "challenge" && !run.challenge?.question) {
      if (!trusted.questionFor) {
        throw new Error("Replay needs a trusted Question resolver.");
      }
      const question = trusted.questionFor(questionIndex, { run });
      questionIndex += 1;
      assertTrustedQuestion(question);
      run = applyAction(run, { type: "provide-question", question });
    }

    const action = replayAction(entry, run);
    const next = applyAction(run, action);
    if (!changedAsExpected(run, next, action)) {
      throw new ReplayInputError(
        "Run Action Log contains an impossible or no-op action."
      );
    }
    run = next;
    trusted.onStep?.(run, action);
  }

  if (run.status !== "won" && run.status !== "lost") {
    throw new ReplayInputError("Run Action Log must reach a terminal state.");
  }

  return {
    status: run.status,
    seed: run.seed,
    score: run.score,
    wardensDefeated: run.wardensDefeated,
    echoesCollected: run.echoes.filter((echo) => echo.collected).length,
    moves: run.moves,
    elapsedMs: Math.round(run.elapsedMs)
  };
}

/**
 * Replays an offline Quest Run recorded as Run Action Log version 2.
 *
 * The trusted inputs come from the receipt, not from the submission: the seed,
 * Labyrinth configuration, and deterministic ruleset the receipt bound, and a
 * content pack that resolves a Reviewed Question Revision id to the exact
 * Question that revision names. Nothing the client sends decides what the
 * server replays against — the client only says which revision it answered and
 * which option it chose, and both are checked against the pack.
 *
 * Verified Daily does not come through here. It stays on version 1, refuses
 * regional actions, and keeps its own contract.
 *
 * @param {unknown} value
 * @param {{
 *   seed: string,
 *   config: Parameters<typeof createRun>[1],
 *   questionForRevision: (
 *     revisionId: string,
 *     context?: { run: ReturnType<typeof createRun> }
 *   ) => ReturnType<
 *     (typeof import("../src/questions/question-bank.js"))["getBundledQuestion"]
 *   > | null,
 *   onAction?: (
 *     run: ReturnType<typeof createRun>,
 *     action: { type: string, answerId?: string }
 *   ) => void,
 *   onStep?: (
 *     run: ReturnType<typeof createRun>,
 *     action: { type: string } | null
 *   ) => void
 * }} trusted
 */
export function verifyOfflineRunReplay(value, trusted) {
  const log = validateLogV2(value);
  assertReplayableSeed(trusted.seed);
  let run = createRun(trusted.seed, trusted.config);
  let elapsedMs = 0;
  trusted.onStep?.(run, null);

  for (const rawEntry of log.actions) {
    if (run.status === "won" || run.status === "lost") {
      throw new ReplayInputError(
        "An action cannot appear after the Run reached a terminal state."
      );
    }
    const entry = validateEntryV2(rawEntry, elapsedMs);
    const deltaMs = entry.elapsedMs - elapsedMs;
    if (deltaMs > 0) {
      if (run.status !== "active") {
        throw new ReplayInputError(
          "Run elapsed time cannot advance during a Warden Challenge."
        );
      }
      run = applyAction(run, { type: "tick", deltaMs });
    }
    elapsedMs = entry.elapsedMs;

    if (run.status === "challenge" && !run.challenge?.question) {
      const revisionId = revisionIdOf(entry);
      if (!revisionId) {
        throw new ReplayInputError(
          "A Warden Challenge needs the Reviewed Question Revision that answered it."
        );
      }
      const question = trusted.questionForRevision(revisionId, { run });
      if (!question) {
        throw new ReplayInputError(
          "Reviewed Question Revision is not in the receipt-bound content pack."
        );
      }
      assertTrustedQuestion(question);
      run = applyAction(run, { type: "provide-question", question });
    }

    const action = replayActionV2(entry, run);
    trusted.onAction?.(run, action);
    const next = applyAction(run, action);
    if (!changedAsExpected(run, next, action)) {
      throw new ReplayInputError(
        "Run Action Log contains an impossible or no-op action."
      );
    }
    run = next;
    trusted.onStep?.(run, action);
  }

  if (run.status !== "won" && run.status !== "lost") {
    throw new ReplayInputError("Run Action Log must reach a terminal state.");
  }

  return {
    status: run.status,
    seed: run.seed,
    score: run.score,
    wardensDefeated: run.wardensDefeated,
    echoesCollected: run.echoes.filter((echo) => echo.collected).length,
    moves: run.moves,
    elapsedMs: Math.round(run.elapsedMs)
  };
}

/** @param {unknown} value */
function validateLogV2(value) {
  const input = record(value, "Run Action Log must be an object.");
  if (input.version !== RUN_ACTION_LOG_V2_VERSION) {
    throw new ReplayInputError("Run Action Log version is not supported.");
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new ReplayInputError("Run Action Log must contain actions.");
  }
  if (input.actions.length > RUN_ACTION_LOG_V2_MAX_ACTIONS) {
    throw new ReplayInputError("Run Action Log has too many actions.");
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ReplayInputError("Run Action Log must be valid JSON data.");
  }
  if (Buffer.byteLength(encoded) > RUN_REPLAY_LIMITS.maxOfflineBytes) {
    throw new ReplayInputError("Run Action Log is too large.");
  }
  if (!hasOnlyKeys(input, ["version", "actions"])) {
    throw new ReplayInputError("Run Action Log contains unknown fields.");
  }
  return /** @type {{ version: 2, actions: unknown[] }} */ (input);
}

/**
 * Every accepted shape is exhaustive in its keys, so a log carrying reviewed
 * text alongside a legal action is rejected rather than quietly ignored.
 *
 * @param {unknown} value
 * @param {number} previousElapsedMs
 */
function validateEntryV2(value, previousElapsedMs) {
  const input = record(value, "Each replay action must be an object.");
  if (
    !Number.isInteger(input.elapsedMs) ||
    Number(input.elapsedMs) < previousElapsedMs ||
    Number(input.elapsedMs) > RUN_REPLAY_LIMITS.maxElapsedMs
  ) {
    throw new ReplayInputError(
      "Replay elapsed time must be monotonic and within the protocol limit."
    );
  }
  const elapsedMs = Number(input.elapsedMs);
  if (
    input.type === "move" &&
    DIRECTIONS.has(String(input.direction)) &&
    hasOnlyKeys(input, ["type", "direction", "elapsedMs"])
  ) {
    return {
      type: /** @type {"move"} */ (input.type),
      direction:
        /** @type {"up" | "right" | "down" | "left"} */ (input.direction),
      elapsedMs
    };
  }
  if (
    (input.type === "pulse" || input.type === "ring-bell") &&
    hasOnlyKeys(input, ["type", "elapsedMs"])
  ) {
    return {
      type: /** @type {"pulse" | "ring-bell"} */ (input.type),
      elapsedMs
    };
  }
  if (
    input.type === "reveal-hint" &&
    typeof input.questionRevisionId === "string" &&
    REVISION_ID_PATTERN.test(input.questionRevisionId) &&
    hasOnlyKeys(input, ["type", "questionRevisionId", "elapsedMs"])
  ) {
    return {
      type: /** @type {"reveal-hint"} */ (input.type),
      questionRevisionId: input.questionRevisionId,
      elapsedMs
    };
  }
  if (
    input.type === "answer-question" &&
    typeof input.questionRevisionId === "string" &&
    REVISION_ID_PATTERN.test(input.questionRevisionId) &&
    typeof input.optionId === "string" &&
    ANSWER_ID_PATTERN.test(input.optionId) &&
    hasOnlyKeys(input, ["type", "questionRevisionId", "optionId", "elapsedMs"])
  ) {
    return {
      type: /** @type {"answer-question"} */ (input.type),
      questionRevisionId: input.questionRevisionId,
      optionId: input.optionId,
      elapsedMs
    };
  }
  if (
    input.type === "skip-question" &&
    typeof input.questionRevisionId === "string" &&
    REVISION_ID_PATTERN.test(input.questionRevisionId) &&
    hasOnlyKeys(input, ["type", "questionRevisionId", "elapsedMs"])
  ) {
    return {
      type: /** @type {"skip-question"} */ (input.type),
      questionRevisionId: input.questionRevisionId,
      elapsedMs
    };
  }
  throw new ReplayInputError(
    "Run Action Log contains an unknown or invalid action."
  );
}

/** @param {ReturnType<typeof validateEntryV2>} entry */
function revisionIdOf(entry) {
  return "questionRevisionId" in entry ? entry.questionRevisionId : null;
}

/**
 * @param {ReturnType<typeof validateEntryV2>} entry
 * @param {ReturnType<typeof createRun>} run
 * @returns {Parameters<typeof applyAction>[1]}
 */
function replayActionV2(entry, run) {
  if (entry.type === "move") {
    return { type: "move", direction: entry.direction };
  }
  if (entry.type === "pulse") {
    return { type: "pulse" };
  }
  if (entry.type === "ring-bell") {
    return { type: "ring-bell" };
  }
  if (entry.type === "reveal-hint") {
    if (run.status !== "challenge" || !run.challenge?.question) {
      throw new ReplayInputError("Hint is not available.");
    }
    return { type: "reveal-hint" };
  }
  if (run.status !== "challenge" || !run.challenge?.question) {
    throw new ReplayInputError("Question answer is not available.");
  }
  const question = /** @type {{ id: string, reviewedRevisionId?: string }} */ (
    run.challenge.question
  );
  const questionRevisionId = question.reviewedRevisionId ?? question.id;
  if (questionRevisionId !== entry.questionRevisionId) {
    throw new ReplayInputError(
      "Reviewed Question Revision does not match the Challenge it answered."
    );
  }
  if (entry.type === "skip-question") {
    return { type: "skip-question" };
  }
  if (
    !run.challenge.question.choices.some(
      (choice) => choice.id === entry.optionId
    )
  ) {
    throw new ReplayInputError(
      "Answer is not one of the trusted Question choices."
    );
  }
  return { type: "answer-question", answerId: entry.optionId };
}

/** @param {unknown} value */
function validateLog(value) {
  const input = record(value, "Run Action Log must be an object.");
  if (input.version !== RUN_ACTION_LOG_VERSION) {
    throw new ReplayInputError("Run Action Log version is not supported.");
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new ReplayInputError("Run Action Log must contain actions.");
  }
  if (input.actions.length > RUN_REPLAY_LIMITS.maxActions) {
    throw new ReplayInputError("Run Action Log has too many actions.");
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ReplayInputError("Run Action Log must be valid JSON data.");
  }
  if (Buffer.byteLength(encoded) > RUN_REPLAY_LIMITS.maxBytes) {
    throw new ReplayInputError("Run Action Log is too large.");
  }
  if (!hasOnlyKeys(input, ["version", "actions"])) {
    throw new ReplayInputError("Run Action Log contains unknown fields.");
  }
  return /** @type {{ version: 1, actions: unknown[] }} */ (input);
}

/**
 * @param {unknown} value
 * @param {number} previousElapsedMs
 */
function validateEntry(value, previousElapsedMs) {
  const input = record(value, "Each replay action must be an object.");
  if (
    !Number.isInteger(input.elapsedMs) ||
    Number(input.elapsedMs) < previousElapsedMs ||
    Number(input.elapsedMs) > RUN_REPLAY_LIMITS.maxElapsedMs
  ) {
    throw new ReplayInputError(
      "Replay elapsed time must be monotonic and within the protocol limit."
    );
  }
  if (
    input.type === "move" &&
    DIRECTIONS.has(String(input.direction)) &&
    hasOnlyKeys(input, ["type", "direction", "elapsedMs"])
  ) {
    return {
      type: /** @type {"move"} */ (input.type),
      direction:
        /** @type {"up" | "right" | "down" | "left"} */ (input.direction),
      elapsedMs: Number(input.elapsedMs)
    };
  }
  if (
    (input.type === "pulse" || input.type === "skip-question") &&
    hasOnlyKeys(input, ["type", "elapsedMs"])
  ) {
    return {
      type: /** @type {"pulse" | "skip-question"} */ (input.type),
      elapsedMs: Number(input.elapsedMs)
    };
  }
  if (
    input.type === "answer-question" &&
    typeof input.answerId === "string" &&
    ANSWER_ID_PATTERN.test(input.answerId) &&
    hasOnlyKeys(input, ["type", "answerId", "elapsedMs"])
  ) {
    return {
      type: /** @type {"answer-question"} */ (input.type),
      answerId: input.answerId,
      elapsedMs: Number(input.elapsedMs)
    };
  }
  throw new ReplayInputError("Run Action Log contains an unknown or invalid action.");
}

/**
 * @param {ReturnType<typeof validateEntry>} entry
 * @param {ReturnType<typeof createRun>} run
 * @returns {Parameters<typeof applyAction>[1]}
 */
function replayAction(entry, run) {
  if (entry.type === "move") {
    return { type: "move", direction: entry.direction };
  }
  if (entry.type === "pulse") {
    return { type: "pulse" };
  }
  if (entry.type === "skip-question") {
    if (run.status !== "challenge" || !run.challenge?.question) {
      throw new ReplayInputError("Question Skip is not available.");
    }
    return { type: "skip-question" };
  }
  if (run.status !== "challenge" || !run.challenge?.question) {
    throw new ReplayInputError("Question answer is not available.");
  }
  if (
    !run.challenge.question.choices.some(
      (choice) => choice.id === entry.answerId
    )
  ) {
    throw new ReplayInputError(
      "Answer is not one of the trusted Question choices."
    );
  }
  return {
    type: "answer-question",
    answerId: /** @type {string} */ (entry.answerId)
  };
}

/**
 * @param {ReturnType<typeof createRun>} previous
 * @param {ReturnType<typeof createRun>} next
 * @param {Parameters<typeof applyAction>[1]} action
 */
function changedAsExpected(previous, next, action) {
  if (action.type === "move" || action.type === "pulse") {
    return next.moves === previous.moves + 1;
  }
  return next !== previous;
}

/** @param {unknown} question */
function assertTrustedQuestion(question) {
  const value = record(question, "Trusted Question resolver returned no Question.");
  if (
    typeof value.id !== "string" ||
    typeof value.answerId !== "string" ||
    !Array.isArray(value.choices) ||
    !value.choices.some(
      (choice) =>
        choice !== null &&
        typeof choice === "object" &&
        "id" in choice &&
        choice.id === value.answerId
    )
  ) {
    throw new Error("Trusted Question resolver returned an invalid Question.");
  }
}

/** @param {unknown} value @param {string} message */
function record(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReplayInputError(message);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function hasOnlyKeys(value, keys) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
