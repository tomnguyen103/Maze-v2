import {
  DIFFICULTY_BANDS,
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  getQuestLevel,
  isGateWardenMilestone
} from "../questions/quest-levels.js";
import { getPublishedLearningDeckOption } from "../questions/learning-deck-catalog.js";
import { getRegionTheme } from "./region-theme.js";
import { getFossilSnapshot } from "./fossil-atlas-state.js";
import {
  fossilsForLabyrinth,
  normalizeFossilCollection
} from "./quest-fossils.js";

/** @typedef {"completed" | "current" | "ahead" | "milestone" | "completed-milestone"} AtlasNodeState */
/** @typedef {{
 *   version: 2,
 *   levelId: string,
 *   learningDeckId: string,
 *   learningDeckRevision: string,
 *   labyrinthNumber: number,
 *   completedLabyrinths: number,
 *   questId: string,
 *   complete: boolean
 * }} QuestProgressLike */
/** @typedef {ReturnType<typeof normalizeFossilCollection>} FossilCollection */

/** @type {Readonly<Record<string, { motif: string, fieldNotes: readonly string[] }>>} */
const REGION_METADATA = Object.freeze({
  foundation: Object.freeze({
    motif: "Lantern moss and quiet stone",
    fieldNotes: Object.freeze([
      "Mosslight wakes along the first quiet stones.",
      "The Bramblewatch keeps its universal Patrol marks.",
      "An Echo hushes ordinary footsteps for one action.",
      "The First Echo Sigil waits beyond the Gate Warden."
    ])
  }),
  developing: Object.freeze({
    motif: "Rising wind and bright trail ribbons",
    fieldNotes: Object.freeze([
      "Windcall ribbons point from each Windway source to its landing.",
      "The Kitewatch keeps universal Warden marks clear in the rising wind.",
      "One Windway action carries the Explorer exactly one extra legal tile.",
      "The Rising Wind Sigil waits beyond the Gate Warden."
    ])
  }),
  capable: Object.freeze({
    motif: "Joined arches and clear blue spans",
    fieldNotes: Object.freeze([
      "Each sealed Echo Bridge marks a shortcut waiting to open.",
      "A recovered Echo opens its paired Bridge for Explorer and Warden.",
      "Sunspan crossings add paths without closing the stone route.",
      "The Joined Path Sigil waits beyond the Gate Warden."
    ])
  }),
  advanced: Object.freeze({
    motif: "Sea-glass channels and alternating tide marks",
    fieldNotes: Object.freeze([
      "Visible Tide Doors begin open, then alternate together after each successful Move or Pulse.",
      "Explorer and Warden share the same Tide Door phase for the whole action.",
      "Blocked paths, Questions, Hints, and pauses leave the tide unchanged.",
      "The Turning Tide Sigil waits beyond the Gate Warden."
    ])
  }),
  mastery: Object.freeze({
    motif: "Beacon bells and resonant stone",
    fieldNotes: Object.freeze([
      "One-use Signal Bells wait on visible passages across Bellroot Summit.",
      "Ring an adjacent Bell to lure only revealed ordinary Wardens for one action.",
      "Hidden Wardens and Gate Wardens ignore the signal; normal modes return next action.",
      "The Last Light Sigil waits beyond the final Gate Warden."
    ])
  })
});

/**
 * Project the complete Echo Atlas without storing or changing Quest Progress.
 *
 * @param {QuestProgressLike} progress
 * @param {{
 *   watchTrailLandmarkIds?: ReadonlySet<string>,
 *   fossilCollection?: unknown,
 *   fossilStatus?: "ready" | "syncing" | "unavailable"
 * }} [options]
 */
export function projectQuestAtlas(
  progress,
  {
    watchTrailLandmarkIds = new Set(),
    fossilCollection: fossilCollectionInput,
    fossilStatus
  } = {}
) {
  const level = getQuestLevel(progress.levelId);
  // Resolved by Deck, not by revision: a Quest keeps the revision it pinned,
  // so a republished Deck must still project a truthful Atlas.
  const learningDeck = getPublishedLearningDeckOption(progress.learningDeckId);
  if (!learningDeck) {
    throw new Error("Quest Progress has an unavailable Learning Deck.");
  }
  const retainedLandmarkIds = new Set(watchTrailLandmarkIds);
  const normalizedFossilCollection = normalizeFossilCollection(fossilCollectionInput);
  const fossilCollection = normalizedFossilCollection?.questId === progress.questId
    ? normalizedFossilCollection
    : null;
  const regions = DIFFICULTY_BANDS.map((_, regionIndex) => {
    const start = regionIndex * 4 + 1;
    const end = start + 3;
    const band = getDifficultyBand(start);
    const metadata = REGION_METADATA[band.id];
    const theme = getRegionTheme(band.id);
    const nodes = Array.from({ length: 4 }, (_, offset) =>
      projectNode(
        progress,
        start + offset,
        band,
        metadata.fieldNotes[offset],
        level.questionGuide,
        retainedLandmarkIds,
        fossilCollection
      )
    );
    const sigilRestored = progress.completedLabyrinths >= end;
    return {
      id: band.id,
      index: regionIndex,
      label: band.label,
      themeName: theme?.name ?? band.label,
      wardenGuild: theme?.wardenGuild ?? null,
      motif: metadata.motif,
      rangeLabel: `Labyrinths ${start}-${end}`,
      sigilRestored,
      sigilLabel: sigilRestored
        ? `${theme?.sigilName ?? "Sigil"} restored`
        : `${theme?.sigilName ?? "Sigil"} restores at Labyrinth ${end}`,
      nodes
    };
  });
  const nextMilestoneNumber = progress.complete
    ? null
    : Math.ceil(progress.labyrinthNumber / 4) * 4;

  return {
    version: 2,
    levelId: progress.levelId,
    learningDeckId: learningDeck.deckId,
    // The revision this Quest pinned, not whatever the Deck publishes now.
    learningDeckRevision: progress.learningDeckRevision,
    learningDeckLabel: learningDeck.label,
    complete: progress.complete,
    currentLabyrinthNumber: progress.complete
      ? null
      : progress.labyrinthNumber,
    completedLabyrinths: progress.completedLabyrinths,
    restoredSigils: regions.filter((region) => region.sigilRestored).length,
    fossilStatus: fossilStatus ?? "unavailable",
    fossilCount: fossilCollection?.fossils.length ?? 0,
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
 * @param {{ watchTrailLandmarkIds?: ReadonlySet<string> }} [options]
 */
export async function projectAtlas(progress, options = {}) {
  return projectQuestAtlas(progress, {
    ...options,
    snapshot: await getFossilSnapshot()
  });
}

/**
 * @param {QuestProgressLike} progress
 * @param {number} labyrinthNumber
 * @param {{ id: string, label: string }} band
 * @param {string} fieldNote
 * @param {string} learningFocus
 * @param {ReadonlySet<string>} retainedLandmarkIds
 * @param {FossilCollection} fossilCollection
 */
function projectNode(
  progress,
  labyrinthNumber,
  band,
  fieldNote,
  learningFocus,
  retainedLandmarkIds,
  fossilCollection
) {
  const id = `${band.id}-${labyrinthNumber}`;
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
  const nodeFossils = completed
    ? fossilsForLabyrinth(fossilCollection, labyrinthNumber)
    : [];

  return {
    id,
    labyrinthNumber,
    difficultyBandId: band.id,
    difficultyBand: band.label,
    fieldNote,
    learningFocus,
    completed,
    current,
    watchTrailAvailable: completed && retainedLandmarkIds.has(id),
    fossils: nodeFossils,
    fossilCount: nodeFossils.length,
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
