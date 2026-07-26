import {
  DIFFICULTY_BANDS,
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  isGateWardenMilestone
} from "../questions/quest-levels.js";

/** @typedef {"completed" | "current" | "ahead" | "milestone" | "completed-milestone"} AtlasNodeState */
/** @typedef {{
 *   version: 1,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   completedLabyrinths: number,
 *   complete: boolean
 * }} QuestProgressLike */

/**
 * Project the complete Echo Atlas without storing or changing Quest Progress.
 *
 * @param {QuestProgressLike} progress
 */
export function projectQuestAtlas(progress) {
  const regions = DIFFICULTY_BANDS.map((_, regionIndex) => {
    const start = regionIndex * 4 + 1;
    const end = start + 3;
    const band = getDifficultyBand(start);
    const nodes = Array.from({ length: 4 }, (_, offset) =>
      projectNode(progress, start + offset)
    );
    const sigilRestored = progress.completedLabyrinths >= end;
    return {
      id: band.id,
      index: regionIndex,
      label: band.label,
      rangeLabel: `Labyrinths ${start}-${end}`,
      sigilRestored,
      sigilLabel: sigilRestored
        ? "Sigil restored"
        : `Sigil restores at Labyrinth ${end}`,
      nodes
    };
  });
  const nextMilestoneNumber = progress.complete
    ? null
    : Math.ceil(progress.labyrinthNumber / 4) * 4;

  return {
    version: 1,
    levelId: progress.levelId,
    complete: progress.complete,
    currentLabyrinthNumber: progress.complete
      ? null
      : progress.labyrinthNumber,
    completedLabyrinths: progress.completedLabyrinths,
    restoredSigils: regions.filter((region) => region.sigilRestored).length,
    nextMilestoneNumber,
    labyrinthsToNextMilestone: nextMilestoneNumber === null
      ? null
      : nextMilestoneNumber - progress.labyrinthNumber,
    totalLabyrinths: QUEST_LABYRINTH_COUNT,
    regions
  };
}

/**
 * @param {QuestProgressLike} progress
 * @param {number} labyrinthNumber
 */
function projectNode(progress, labyrinthNumber) {
  const milestone = isGateWardenMilestone(labyrinthNumber);
  const completed = labyrinthNumber <= progress.completedLabyrinths;
  const current = !progress.complete &&
    labyrinthNumber === progress.labyrinthNumber;
  /** @type {AtlasNodeState} */
  const state = completed
    ? milestone
      ? "completed-milestone"
      : "completed"
    : milestone
      ? "milestone"
      : current
        ? "current"
        : "ahead";
  const stateLabel = atlasStateLabel({ completed, current, milestone });

  return {
    labyrinthNumber,
    completed,
    current,
    milestone,
    state,
    stateLabel,
    accessibleLabel: `Labyrinth ${labyrinthNumber}, ${stateLabel}`
  };
}

/**
 * @param {{ completed: boolean, current: boolean, milestone: boolean }} state
 */
function atlasStateLabel({ completed, current, milestone }) {
  if (milestone) {
    if (completed) {
      return "Gate Warden milestone completed";
    }
    return current
      ? "Current Gate Warden milestone"
      : "Gate Warden milestone ahead";
  }
  if (completed) {
    return "Completed";
  }
  return current ? "Current Labyrinth" : "Ahead";
}
