import { applyAction, createRun } from "./game-session.js";
import { getLabyrinthConfig } from "../questions/quest-levels.js";
import { normalizeRunReplay } from "./run-replay-contract.js";
import { normalizeRunRuleset } from "./run-ruleset.js";

export class RunReplayError extends Error {}

/**
 * @param {{
 *   seed?: unknown,
 *   questLevelId?: unknown,
 *   labyrinthNumber?: unknown,
 *   atlasRegionId?: unknown,
 *   rulesetRevision?: unknown,
 *   replay?: unknown
 * }} record
 */
export function buildRunReplayTimeline(record) {
  const replay = normalizeRunReplay(record.replay);
  const levelId =
    record.questLevelId === "bright-start" ||
    record.questLevelId === "trail-scout" ||
    record.questLevelId === "maze-master"
      ? record.questLevelId
      : null;
  const labyrinthNumber =
    Number.isInteger(record.labyrinthNumber) &&
    Number(record.labyrinthNumber) >= 1 &&
    Number(record.labyrinthNumber) <= 20
      ? Number(record.labyrinthNumber)
      : null;
  const ruleset = normalizeRunRuleset(
    {
      atlasRegionId: record.atlasRegionId,
      revision: record.rulesetRevision
    },
    labyrinthNumber ?? 1
  );
  if (
    !replay ||
    typeof record.seed !== "string" ||
    !record.seed ||
    !levelId ||
    !labyrinthNumber ||
    !ruleset
  ) {
    throw new RunReplayError("This Run Replay is missing or corrupt.");
  }

  let run = createRun(record.seed, {
    ...getLabyrinthConfig(levelId, labyrinthNumber),
    ruleset
  });
  const states = [run];
  const events = [{
    index: 0,
    type: "start",
    label: `Trail begins at Labyrinth ${labyrinthNumber}.`,
    elapsedMs: 0
  }];

  for (const [index, entry] of replay.actions.entries()) {
    if (run.status === "won" || run.status === "lost") {
      throw new RunReplayError(
        "Run Replay contains actions after its terminal state."
      );
    }
    if (entry.elapsedMs > run.elapsedMs) {
      if (run.status !== "active") {
        throw new RunReplayError(
          "Run Replay advances time during a Warden Challenge."
        );
      }
      run = applyAction(run, {
        type: "tick",
        deltaMs: entry.elapsedMs - run.elapsedMs
      });
    }
    const previous = run;
    if (entry.type === "challenge-outcome") {
      run = replayChallengeOutcome(run, entry.outcome);
    } else if (entry.type === "hint") {
      run = replayHint(run);
    } else {
      run = applyAction(
        run,
        entry.type === "move"
          ? { type: "move", direction: entry.direction }
          : entry.type === "ring-bell"
            ? { type: "ring-bell" }
            : { type: "pulse" }
      );
    }
    if (!changedAsExpected(previous, run, entry.type)) {
      throw new RunReplayError(
        "Run Replay contains an impossible or unchanged action."
      );
    }
    states.push(run);
    events.push({
      index: index + 1,
      type: replayEventType(run, entry.type),
      label: replayEventLabel(run, entry),
      elapsedMs: entry.elapsedMs
    });
  }

  if (
    run.status !== "won" &&
    run.status !== "lost"
  ) {
    throw new RunReplayError("Run Replay does not reach a terminal state.");
  }
  const terminal = terminalFacts(run);
  if (JSON.stringify(terminal) !== JSON.stringify(replay.terminal)) {
    throw new RunReplayError(
      "Run Replay terminal facts do not match the retained Run Record."
    );
  }
  return {
    states,
    events,
    terminal,
    actionCount: replay.actions.length
  };
}

/** @param {ReturnType<typeof createRun>} run */
export function terminalFacts(run) {
  return {
    outcome: run.status === "won" ? "escaped" : "defeated",
    moves: run.moves,
    elapsedMs: Math.max(0, Math.round(run.elapsedMs)),
    echoesCollected: run.echoes.filter((echo) => echo.collected).length,
    echoTotal: run.echoes.length,
    wardensDefeated: run.wardensDefeated,
    score: run.score,
    vitality: run.explorer.vitality
  };
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {"correct" | "wrong" | "skip"} outcome
 */
function replayChallengeOutcome(run, outcome) {
  if (
    run.status !== "challenge" ||
    !run.challenge ||
    (
      run.challenge.question !== null &&
      run.challenge.question.id !== "run-replay-outcome"
    )
  ) {
    throw new RunReplayError(
      "Run Replay Challenge outcome is out of sequence."
    );
  }
  const withQuestion =
    run.challenge.question ? run : provideReplayQuestion(run);
  if (outcome === "skip") {
    return applyAction(withQuestion, { type: "skip-question" });
  }
  return applyAction(withQuestion, {
    type: "answer-question",
    answerId: outcome === "correct" ? "correct" : "wrong"
  });
}

/** @param {ReturnType<typeof createRun>} run */
function replayHint(run) {
  if (
    run.status !== "challenge" ||
    !run.challenge ||
    run.challenge.question !== null
  ) {
    throw new RunReplayError(
      "Run Replay Hint outcome is out of sequence."
    );
  }
  return applyAction(provideReplayQuestion(run), { type: "reveal-hint" });
}

/** @param {ReturnType<typeof createRun>} run */
function provideReplayQuestion(run) {
  return applyAction(run, {
    type: "provide-question",
    question: {
      id: "run-replay-outcome",
      prompt: "Which retained outcome occurred?",
      choices: [
        { id: "correct", label: "Correct outcome" },
        { id: "wrong", label: "Wrong outcome" },
        { id: "other", label: "Other outcome" }
      ],
      answerId: "correct",
      hint: "This temporary card reconstructs an outcome only.",
      explanation: "The retained outcome is reconstructed without an answer.",
      difficultyBand: "foundation",
      topicId: "arithmetic",
      learningObjectiveId: "scout-equal-groups"
    }
  });
}

/**
 * @param {ReturnType<typeof createRun>} previous
 * @param {ReturnType<typeof createRun>} next
 * @param {"move" | "pulse" | "ring-bell" | "hint" | "challenge-outcome"} type
 */
function changedAsExpected(previous, next, type) {
  if (type === "move" || type === "pulse" || type === "ring-bell") {
    return next.moves === previous.moves + 1;
  }
  return next !== previous;
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {"move" | "pulse" | "ring-bell" | "hint" | "challenge-outcome"} actionType
 */
function replayEventType(run, actionType) {
  return run.event.type === "none" || run.event.type === "move"
    ? actionType
    : run.event.type;
}

/**
 * @param {ReturnType<typeof createRun>} run
 * @param {import("./run-replay-contract.js").RunReplayAction} entry
 */
function replayEventLabel(run, entry) {
  if (entry.type === "hint") {
    return "Hint revealed without retaining Question text.";
  }
  if (entry.type === "challenge-outcome") {
    const labels = {
      correct: "Question answered correctly. The Warden path changed.",
      wrong: "Question answered incorrectly. One Vitality was lost.",
      skip: "Question skipped under the Quest skip rules."
    };
    return labels[
      /** @type {"correct" | "wrong" | "skip"} */ (entry.outcome)
    ];
  }
  if (run.event.type !== "none" && run.event.type !== "move") {
    return run.event.message;
  }
  return entry.type === "pulse"
    ? "Pulse revealed nearby passages."
    : entry.type === "ring-bell"
      ? "Signal Bell rang and revealed Wardens were Lured."
    : `Moved ${entry.direction}.`;
}
