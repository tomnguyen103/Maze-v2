import { applyAction, createRun } from "./game-session.js";
import { normalizeQuestion } from "../questions/question-contract.js";
import { getLabyrinthConfig } from "../questions/quest-levels.js";
import { createTerminalRunReplay } from "./run-replay-contract.js";
import { normalizeRunRuleset } from "./run-ruleset.js";
import {
  ACTIVE_RUN_RECOVERY_KEY,
  scrubActiveRunRecovery
} from "./local-recovery-scrub.js";

export { ACTIVE_RUN_RECOVERY_KEY };
export const ACTIVE_RUN_RECOVERY_MAX_ACTIONS = 2048;
export const ACTIVE_RUN_RECOVERY_MAX_BYTES = 256 * 1024;

/**
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown,
 *   removeItem: (key: string) => unknown
 * }} StorageLike
 * @typedef {{
 *   version: 3,
 *   runId: string,
 *   pending: false,
 *   seed: string,
 *   levelId: "bright-start" | "trail-scout" | "maze-master",
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   rulesetRevision: string
 * }} RecoveryIdentity
 * @typedef {
 *   | { type: "move", direction: "up" | "right" | "down" | "left", elapsedMs: number }
 *   | { type: "pulse" | "reveal-hint", elapsedMs: number }
 *   | { type: "provide-question", question: ReturnType<typeof normalizeQuestion>, elapsedMs: number }
 *   | { type: "challenge-outcome", outcome: "correct" | "wrong" | "skip", explanation: string, hintUsed: boolean, elapsedMs: number }
 * } RecoveryAction
 * @typedef {{
 *   version: 1,
 *   identity: RecoveryIdentity,
 *   actions: RecoveryAction[],
 *   checkpoint: Record<string, unknown> | null
 * }} RecoveryEnvelope
 */

const LEGACY_IDENTITY_KEYS = [
  "version",
  "runId",
  "pending",
  "seed",
  "levelId",
  "labyrinthNumber"
];
const IDENTITY_KEYS = [
  ...LEGACY_IDENTITY_KEYS,
  "atlasRegionId",
  "rulesetRevision"
];
const ENVELOPE_KEYS = [
  "version",
  "identity",
  "actions",
  "checkpoint"
];

/** @param {{ storage?: StorageLike }} [options] */
export function createActiveRunRecoveryController(options = {}) {
  /** @type {StorageLike | undefined} */
  let storage;
  try {
    storage = Object.hasOwn(options, "storage")
      ? options.storage
      : globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  /** @type {RecoveryEnvelope | null} */
  let envelope = null;
  let disabled = false;

  return {
    /**
     * @param {unknown} locator
     * @param {{ clearStored?: boolean }} [options]
     */
    begin(locator, { clearStored = false } = {}) {
      const identity = normalizeIdentity(locator);
      if (!identity) {
        throw new Error("Active Run Recovery needs a valid Run identity.");
      }
      if (!storage) {
        envelope = null;
        disabled = true;
        return { status: "unavailable", reason: "storage" };
      }
      if (
        clearStored &&
        !scrubActiveRunRecovery(storage)
      ) {
        envelope = null;
        disabled = true;
        return { status: "unavailable", reason: "storage" };
      }
      envelope = {
        version: 1,
        identity,
        actions: [],
        checkpoint: null
      };
      disabled = false;
      return { status: "active" };
    },

    /**
     * @param {ReturnType<typeof createRun>} previous
     * @param {Parameters<typeof applyAction>[1]} action
     * @param {ReturnType<typeof createRun>} next
     */
    record(previous, action, next) {
      if (!envelope || disabled) {
        return { status: "inactive" };
      }
      if (next.status === "won" || next.status === "lost") {
        /** @type {ReturnType<typeof createTerminalRunReplay>} */
        let replay;
        try {
          const terminalEntry = recoveryEntry(previous, action, next);
          const terminalActions = terminalEntry
            ? appendRecoveryEntry(envelope.actions, terminalEntry)
            : envelope.actions;
          replay = createTerminalRunReplay(terminalActions, next);
        } catch {
          replay = null;
        }
        const cleared = scrubActiveRunRecovery(storage);
        envelope = null;
        disabled = !cleared;
        return cleared
          ? {
              status: "terminal",
              ...(replay ? { replay } : {})
            }
          : { status: "unavailable", reason: "storage" };
      }
      /** @type {RecoveryAction | null} */
      let entry;
      /** @type {RecoveryEnvelope} */
      let candidate;
      /** @type {ReturnType<typeof recoveryPayloadWithinBounds>} */
      let bounds;
      try {
        entry = recoveryEntry(previous, action, next);
        if (!entry) {
          return { status: "unchanged" };
        }
        candidate = {
          ...envelope,
          actions: appendRecoveryEntry(envelope.actions, entry),
          checkpoint: checkpointForRun(next)
        };
        bounds = recoveryPayloadWithinBounds(candidate);
      } catch {
        scrubActiveRunRecovery(storage);
        envelope = null;
        disabled = true;
        return { status: "unavailable", reason: "serialization" };
      }
      if (!bounds.ok) {
        scrubActiveRunRecovery(storage);
        envelope = null;
        disabled = true;
        return { status: "unavailable", reason: bounds.reason };
      }
      try {
        storage?.setItem(ACTIVE_RUN_RECOVERY_KEY, bounds.serialized);
      } catch {
        scrubActiveRunRecovery(storage);
        envelope = null;
        disabled = true;
        return { status: "unavailable", reason: "storage" };
      }
      envelope = candidate;
      return { status: "saved" };
    },

    /** @param {unknown} locator */
    load(locator) {
      const identity = normalizeIdentity(locator);
      if (!identity) {
        scrubActiveRunRecovery(storage);
        return { status: "invalid", reason: "identity" };
      }
      if (!storage) {
        return { status: "unavailable", reason: "storage" };
      }
      /** @type {string | null} */
      let serialized;
      try {
        serialized = storage?.getItem(ACTIVE_RUN_RECOVERY_KEY) ?? null;
      } catch {
        return { status: "unavailable", reason: "storage" };
      }
      if (serialized === null) {
        return { status: "none" };
      }
      if (utf8Size(serialized) > ACTIVE_RUN_RECOVERY_MAX_BYTES) {
        scrubActiveRunRecovery(storage);
        return { status: "invalid", reason: "size-limit" };
      }
      try {
        const candidate = JSON.parse(serialized);
        const normalized = normalizeEnvelope(candidate);
        if (
          !normalized ||
          !sameIdentity(normalized.identity, identity)
        ) {
          throw new Error("Recovery identity does not match.");
        }
        const bounds = recoveryPayloadWithinBounds(normalized);
        if (!bounds.ok) {
          throw new Error(bounds.reason);
        }
        const run = replayEnvelope(normalized);
        envelope = normalized;
        disabled = false;
        return {
          status: "recovered",
          run:
            run.status === "active"
              ? applyAction(run, { type: "pause" })
              : run
        };
      } catch {
        scrubActiveRunRecovery(storage);
        envelope = null;
        return { status: "invalid", reason: "corrupt" };
      }
    },

    clear() {
      const cleared = scrubActiveRunRecovery(storage);
      envelope = null;
      disabled = !cleared;
      return cleared
        ? { status: "cleared" }
        : { status: "unavailable", reason: "storage" };
    }
  };
}

/**
 * @param {{
 *   onContinue: () => void | Promise<void>,
 *   onRestart: () => void | Promise<void>
 * }} callbacks
 */
export function createCampfireResumeView({
  onContinue,
  onRestart
}) {
  const dialog = document.createElement("dialog");
  const label = document.createElement("span");
  const title = document.createElement("h2");
  const intro = document.createElement("p");
  const contract = document.createElement("div");
  const contractTitle = document.createElement("strong");
  const summary = document.createElement("span");
  const boundary = document.createElement("p");
  const actions = document.createElement("div");
  const continueButton = document.createElement("button");
  const restartButton = document.createElement("button");

  dialog.className =
    "quest-conflict-dialog campfire-resume-dialog";
  dialog.id = "campfire-resume-dialog";
  dialog.setAttribute("aria-labelledby", "campfire-resume-title");
  dialog.setAttribute(
    "aria-describedby",
    "campfire-resume-intro campfire-resume-boundary"
  );
  label.className = "section-label";
  label.textContent = "Same-device recovery";
  title.id = "campfire-resume-title";
  title.tabIndex = -1;
  title.textContent = "Continue from the Campfire?";
  intro.className = "dialog-intro";
  intro.id = "campfire-resume-intro";
  intro.textContent =
    "Your last safe step is waiting on this device. The Run is paused, so its timer is not moving.";
  contract.className = "daily-contract";
  contractTitle.textContent = "Last safe step";
  summary.id = "campfire-resume-summary";
  contract.append(contractTitle, summary);
  boundary.className = "dialog-intro";
  boundary.id = "campfire-resume-boundary";
  boundary.textContent =
    "Campfire Resume stays local to this browser. Restart clears this checkpoint before the Labyrinth begins again.";
  actions.className = "quest-conflict-dialog__actions";
  continueButton.className = "primary-button";
  continueButton.id = "campfire-resume-continue";
  continueButton.type = "button";
  continueButton.textContent = "Continue Run";
  restartButton.className = "control-button";
  restartButton.id = "campfire-resume-restart";
  restartButton.type = "button";
  restartButton.textContent = "Restart Run";
  actions.append(continueButton, restartButton);
  dialog.append(label, title, intro, contract, boundary, actions);
  document.body.append(dialog);

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  continueButton.addEventListener("click", () => {
    dialog.close();
    void onContinue();
  });
  restartButton.addEventListener("click", () => {
    dialog.close();
    void onRestart();
  });

  return {
    /**
     * @param {ReturnType<typeof createRun>} run
     * @param {{ levelName: string, labyrinthNumber: number }} context
     */
    show(run, { levelName, labyrinthNumber }) {
      const echoes = run.echoes.filter((echo) => echo.collected).length;
      summary.textContent =
        `${levelName} · Labyrinth ${labyrinthNumber} · ` +
        `${run.moves} ${run.moves === 1 ? "move" : "moves"} · ` +
        `${echoes}/${run.echoes.length} Echoes · ${formatElapsed(run.elapsedMs)}`;
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        title.focus({ preventScroll: true });
      });
    },

    close() {
      if (dialog.open) {
        dialog.close();
      }
    }
  };
}

/**
 * @param {unknown} envelope
 * @returns {
 *   | { ok: false, reason: string }
 *   | { ok: true, serialized: string }
 * }
 */
export function recoveryPayloadWithinBounds(envelope) {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !Array.isArray(
      /** @type {Record<string, unknown>} */ (envelope).actions
    )
  ) {
    return { ok: false, reason: "invalid" };
  }
  const actions =
    /** @type {Record<string, unknown[]>} */ (envelope).actions;
  if (actions.length > ACTIVE_RUN_RECOVERY_MAX_ACTIONS) {
    return { ok: false, reason: "action-limit" };
  }
  let serialized;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (utf8Size(serialized) > ACTIVE_RUN_RECOVERY_MAX_BYTES) {
    return { ok: false, reason: "size-limit" };
  }
  return { ok: true, serialized };
}

/**
 * @param {ReturnType<typeof createRun>} previous
 * @param {Parameters<typeof applyAction>[1]} action
 * @param {ReturnType<typeof createRun>} next
 * @returns {RecoveryAction | null}
 */
function recoveryEntry(previous, action, next) {
  const elapsedMs = durableElapsed(next.elapsedMs);
  if (
    action.type === "move" &&
    next.moves === previous.moves + 1
  ) {
    return { type: "move", direction: action.direction, elapsedMs };
  }
  if (
    action.type === "pulse" &&
    next.moves === previous.moves + 1
  ) {
    return { type: "pulse", elapsedMs };
  }
  if (
    action.type === "provide-question" &&
    previous.status === "challenge" &&
    previous.challenge?.question === null &&
    next.challenge?.question
  ) {
    return {
      type: "provide-question",
      question: normalizeQuestion(action.question),
      elapsedMs
    };
  }
  if (
    action.type === "reveal-hint" &&
    previous.status === "challenge" &&
    previous.challenge?.question &&
    !previous.challenge.hintRevealed &&
    next.challenge?.hintRevealed
  ) {
    return { type: "reveal-hint", elapsedMs };
  }
  if (
    action.type === "answer-question" &&
    previous.status === "challenge" &&
    previous.challenge?.question &&
    previous.challenge.question.choices.some(
      (choice) => choice.id === action.answerId
    ) &&
    next !== previous
  ) {
    const correct =
      action.answerId === previous.challenge.question.answerId;
    return {
      type: "challenge-outcome",
      outcome: correct ? "correct" : "wrong",
      explanation: correct
        ? ""
        : previous.challenge.question.explanation,
      hintUsed: previous.challenge.hintRevealed,
      elapsedMs
    };
  }
  if (
    action.type === "skip-question" &&
    previous.status === "challenge" &&
    previous.challenge?.question &&
    next !== previous
  ) {
    return {
      type: "challenge-outcome",
      outcome: "skip",
      explanation: "",
      hintUsed: previous.challenge.hintRevealed,
      elapsedMs
    };
  }
  return null;
}

/**
 * @param {RecoveryAction[]} actions
 * @param {RecoveryAction} entry
 */
function appendRecoveryEntry(actions, entry) {
  if (entry.type !== "challenge-outcome") {
    return [...actions, entry];
  }
  let questionIndex = -1;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index].type === "provide-question") {
      questionIndex = index;
      break;
    }
  }
  if (questionIndex < 0) {
    throw new Error("Resolved Challenge has no recoverable Question.");
  }
  return [
    ...actions.slice(0, questionIndex).map((action) =>
      action.type === "challenge-outcome" &&
      action.explanation
        ? { ...action, explanation: "" }
        : action
    ),
    entry
  ];
}

/** @param {RecoveryEnvelope} envelope */
function replayEnvelope(envelope) {
  let run = createRun(
    envelope.identity.seed,
    {
      ...getLabyrinthConfig(
        envelope.identity.levelId,
        envelope.identity.labyrinthNumber
      ),
      ruleset: {
        atlasRegionId: envelope.identity.atlasRegionId,
        revision: envelope.identity.rulesetRevision
      }
    }
  );
  for (const entry of envelope.actions) {
    if (entry.elapsedMs < run.elapsedMs) {
      throw new Error("Recovery elapsed time moved backward.");
    }
    if (entry.elapsedMs > run.elapsedMs) {
      if (run.status !== "active") {
        throw new Error("Recovery advanced time outside active play.");
      }
      run = applyAction(run, {
        type: "tick",
        deltaMs: entry.elapsedMs - run.elapsedMs
      });
    }
    if (entry.type === "challenge-outcome") {
      run = replayChallengeOutcome(run, entry);
    } else {
      const action = actionFromEntry(entry);
      const previous = run;
      run = applyAction(run, action);
      const replayedEntry = recoveryEntry(previous, action, run);
      if (
        !replayedEntry ||
        JSON.stringify(replayedEntry) !== JSON.stringify(entry)
      ) {
        throw new Error("Recovery action diverged from canonical Run rules.");
      }
    }
    if (run.status === "won" || run.status === "lost") {
      throw new Error("Terminal Runs cannot remain recoverable.");
    }
  }
  if (
    envelope.actions.length === 0 ||
    JSON.stringify(checkpointForRun(run)) !==
      JSON.stringify(envelope.checkpoint)
  ) {
    throw new Error("Recovery checkpoint diverged from replay.");
  }
  return run;
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {Extract<RecoveryAction, { type: "challenge-outcome" }>} entry
 */
function replayChallengeOutcome(run, entry) {
  if (
    run.status !== "challenge" ||
    !run.challenge ||
    run.challenge.question !== null
  ) {
    throw new Error("Recovery Challenge outcome is out of sequence.");
  }
  const explanation =
    entry.explanation || "The previous Question was resolved.";
  const question = normalizeQuestion({
    id: "recovery-outcome",
    prompt: "Which recovery outcome is correct?",
    choices: [
      { id: "correct", label: "Correct outcome" },
      { id: "wrong", label: "Wrong outcome" },
      { id: "other", label: "Other outcome" }
    ],
    answerId: "correct",
    hint: "This card reconstructs an earlier outcome.",
    explanation,
    difficultyBand: "foundation",
    difficultyRank: 1,
    topicId: "arithmetic",
    learningObjectiveId: "scout-equal-groups"
  });
  let withQuestion = applyAction(run, {
    type: "provide-question",
    question
  });
  if (entry.hintUsed) {
    withQuestion = applyAction(withQuestion, { type: "reveal-hint" });
  }
  if (entry.outcome === "skip") {
    return applyAction(withQuestion, { type: "skip-question" });
  }
  return applyAction(withQuestion, {
    type: "answer-question",
    answerId: entry.outcome === "correct" ? "correct" : "wrong"
  });
}

/**
 * @param {RecoveryAction} entry
 * @returns {Parameters<typeof applyAction>[1]}
 */
function actionFromEntry(entry) {
  if (entry.type === "move") {
    return { type: "move", direction: entry.direction };
  }
  if (entry.type === "pulse") {
    return { type: "pulse" };
  }
  if (entry.type === "provide-question") {
    return {
      type: "provide-question",
      question: normalizeQuestion(entry.question)
    };
  }
  if (entry.type === "reveal-hint") {
    return { type: "reveal-hint" };
  }
  throw new Error("Recovery action type is not supported.");
}

/**
 * @param {unknown} value
 * @returns {RecoveryEnvelope | null}
 */
function normalizeEnvelope(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !hasOnlyKeys(value, ENVELOPE_KEYS)
  ) {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.actions) ||
    !candidate.checkpoint ||
    typeof candidate.checkpoint !== "object"
  ) {
    return null;
  }
  const identity = normalizeIdentity(candidate.identity);
  if (!identity) {
    return null;
  }
  const actions = candidate.actions.map(normalizeAction);
  if (actions.some((action) => action === null)) {
    return null;
  }
  return {
    version: 1,
    identity,
    actions: /** @type {RecoveryAction[]} */ (actions),
    checkpoint: /** @type {Record<string, unknown>} */ (
      candidate.checkpoint
    )
  };
}

/**
 * @param {unknown} value
 * @returns {RecoveryAction | null}
 */
function normalizeAction(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const elapsedMs = normalizeElapsed(candidate.elapsedMs);
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
      direction: /** @type {"up" | "right" | "down" | "left"} */ (
        candidate.direction
      ),
      elapsedMs
    };
  }
  if (
    typeof candidate.type === "string" &&
    ["pulse", "reveal-hint"].includes(candidate.type) &&
    hasOnlyKeys(value, ["type", "elapsedMs"])
  ) {
    return {
      type: /** @type {"pulse" | "reveal-hint"} */ (
        candidate.type
      ),
      elapsedMs
    };
  }
  if (
    candidate.type === "challenge-outcome" &&
    (
      hasOnlyKeys(
        value,
        ["type", "outcome", "explanation", "elapsedMs"]
      ) ||
      hasOnlyKeys(
        value,
        ["type", "outcome", "explanation", "hintUsed", "elapsedMs"]
      )
    ) &&
    typeof candidate.outcome === "string" &&
    ["correct", "wrong", "skip"].includes(candidate.outcome) &&
    typeof candidate.explanation === "string" &&
    candidate.explanation.length <= 240 &&
    (candidate.hintUsed === undefined ||
      typeof candidate.hintUsed === "boolean")
  ) {
    return {
      type: "challenge-outcome",
      outcome: /** @type {"correct" | "wrong" | "skip"} */ (
        candidate.outcome
      ),
      explanation: candidate.explanation.trim(),
      hintUsed: candidate.hintUsed === true,
      elapsedMs
    };
  }
  if (
    candidate.type === "provide-question" &&
    hasOnlyKeys(value, ["type", "question", "elapsedMs"])
  ) {
    try {
      return {
        type: "provide-question",
        question: normalizeQuestion(candidate.question),
        elapsedMs
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {RecoveryIdentity | null}
 */
function normalizeIdentity(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    (candidate.version === 2 &&
      !hasOnlyKeys(value, LEGACY_IDENTITY_KEYS)) ||
    (candidate.version === 3 && !hasOnlyKeys(value, IDENTITY_KEYS))
  ) {
    return null;
  }
  const ruleset = normalizeRunRuleset(
    candidate.version === 3
      ? {
          atlasRegionId: candidate.atlasRegionId,
          revision: candidate.rulesetRevision
        }
      : undefined,
    Number(candidate.labyrinthNumber)
  );
  if (
    (candidate.version !== 2 && candidate.version !== 3) ||
    !ruleset ||
    candidate.pending !== false ||
    typeof candidate.runId !== "string" ||
    !/^[a-zA-Z0-9_-]{12,128}$/.test(candidate.runId) ||
    typeof candidate.seed !== "string" ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(candidate.seed) ||
    candidate.seed.length > 24 ||
    typeof candidate.levelId !== "string" ||
    !["bright-start", "trail-scout", "maze-master"].includes(
      candidate.levelId
    ) ||
    !Number.isInteger(candidate.labyrinthNumber) ||
    Number(candidate.labyrinthNumber) < 1 ||
    Number(candidate.labyrinthNumber) > 20
  ) {
    return null;
  }
  return {
    version: 3,
    runId: candidate.runId,
    pending: false,
    seed: candidate.seed,
    levelId: /** @type {RecoveryIdentity["levelId"]} */ (
      candidate.levelId
    ),
    labyrinthNumber: Number(candidate.labyrinthNumber),
    atlasRegionId: ruleset.atlasRegionId,
    rulesetRevision: ruleset.revision
  };
}

/** @param {ReturnType<typeof createRun>} run */
function checkpointForRun(run) {
  return cloneJson({
    explorer: run.explorer,
    echoes: run.echoes,
    gate: run.gate,
    ...(run.gateWarden ? { gateWarden: run.gateWarden } : {}),
    wardens: run.wardens,
    challenge: run.challenge
      ? {
          ...run.challenge,
          question: run.challenge.question
            ? normalizeQuestion(run.challenge.question)
            : null
        }
      : null,
    revealed: run.revealed,
    pulseVisible: run.pulseVisible,
    pulseExpiresAt: run.pulseExpiresAt,
    pulses: run.pulses,
    score: run.score,
    wardensDefeated: run.wardensDefeated,
    freeQuestionSkipAvailable: run.freeQuestionSkipAvailable,
    moves: run.moves,
    lastDirection: run.lastDirection,
    elapsedMs: durableElapsed(run.elapsedMs),
    status: run.status
  });
}

/** @param {object} value @param {string[]} keys */
function hasOnlyKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/** @param {RecoveryIdentity} left @param {RecoveryIdentity} right */
function sameIdentity(left, right) {
  return (
    left.version === right.version &&
    left.runId === right.runId &&
    left.pending === right.pending &&
    left.seed === right.seed &&
    left.levelId === right.levelId &&
    left.labyrinthNumber === right.labyrinthNumber &&
    left.atlasRegionId === right.atlasRegionId &&
    left.rulesetRevision === right.rulesetRevision
  );
}

/** @param {number} elapsedMs */
function durableElapsed(elapsedMs) {
  return Math.max(0, Math.round(elapsedMs));
}

/** @param {unknown} value */
function normalizeElapsed(value) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** @param {string} value */
function utf8Size(value) {
  return new TextEncoder().encode(value).byteLength;
}

/** @param {number} elapsedMs */
function formatElapsed(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
