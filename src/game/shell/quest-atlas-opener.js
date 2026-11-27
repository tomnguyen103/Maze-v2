import { getDifficultyBand } from "../../questions/quest-levels.js";

/**
 * @typedef {{
 *   getRun: () => { status: string },
 *   getRunRecords: () => any[],
 *   getQuestProgress: () => any,
 *   togglePause: () => void,
 *   announce: (message: string) => void,
 *   openRunReplay: (record: any, trigger: HTMLElement, resumeRun: boolean) => unknown,
 *   openWorkshop: (selection: any) => unknown
 * }} AtlasOpenerDeps
 */

/** @type {Promise<ReturnType<typeof import("../quest-atlas-view.js").createQuestAtlasView>> | null} */
let atlasViewPromise = null;
let atlasOpening = false;
let atlasViewRetry = false;
let atlasProjectionRetry = false;
let resumeAfterAtlas = false;
/** @type {typeof import("../run-replay.js").buildRunReplayTimeline | null} */
let buildRunReplayTimeline = null;

/**
 * Opens the Quest Atlas dialog. Loaded when the Explorer first opens the Atlas.
 * @param {AtlasOpenerDeps} deps
 * @param {HTMLElement} trigger
 * @param {{ resumePausedRun?: boolean }} [options]
 */
export async function showQuestAtlas(
  deps,
  trigger,
  { resumePausedRun = false } = {}
) {
  const { getRun, togglePause, announce } = deps;
  if (atlasOpening) {
    return;
  }
  atlasOpening = true;
  const pauseForAtlas = getRun().status === "active";
  resumeAfterAtlas = pauseForAtlas || resumePausedRun;
  if (pauseForAtlas) {
    togglePause();
  }
  const retrying = atlasViewRetry;
  try {
    // Two scopes on purpose. Building the view attaches listeners to
    // `#atlas-dialog`, so only a failure of the import or of that build may
    // discard the cached promise. A failure anywhere after it — projecting
    // the Atlas, reading retained Trails — would leave those listeners
    // attached and let the next open add a second set, without bound.
    let atlasView;
    try {
      if (!atlasViewPromise) {
        /** @type {Promise<typeof import("../quest-atlas-view.js")>} */
        const viewModule = retrying
          // @ts-expect-error Vite treats the query as a distinct retry chunk.
          ? import("../quest-atlas-view.js?retry=1")
          : import("../quest-atlas-view.js");
        atlasViewRetry = true;
        atlasViewPromise = viewModule.then(
          ({ createQuestAtlasView }) => createQuestAtlasView({
            onWatchTrail: (landmarkId, returnTarget) => {
              const record = replayRecordForLandmark(deps, landmarkId);
              if (!record) {
                announce(
                  "That Trail is no longer retained on this device."
                );
                return;
              }
              void deps.openRunReplay(record, returnTarget, false);
            },
            onWorkshop: (selection, returnTarget) => {
              const resumePausedRun = resumeAfterAtlas;
              resumeAfterAtlas = false;
              void deps.openWorkshop({
                ...selection,
                origin: "atlas",
                trigger: returnTarget,
                resumePausedRun
              });
            },
            onClose: () => {
              if (resumeAfterAtlas && getRun().status === "paused") {
                togglePause();
              }
              resumeAfterAtlas = false;
            }
          })
        );
      }
      atlasView = await atlasViewPromise;
    } catch {
      atlasViewPromise = null;
      if (resumeAfterAtlas && getRun().status === "paused") {
        togglePause();
      }
      resumeAfterAtlas = false;
      announce(
        retrying
          ? "Echo Atlas is unavailable. Reload to try again."
          : "Echo Atlas could not open. Continue the Quest and try again."
      );
      return;
    }
    const { projectAtlas } = await (atlasProjectionRetry
      // @ts-expect-error Vite treats the query as a distinct retry chunk.
      ? import("../quest-atlas.js?retry=1")
      : import("../quest-atlas.js"));
    atlasProjectionRetry = true;
    const watchTrailLandmarkIds = await compatibleReplayLandmarkIds(deps);
    atlasView.show(await projectAtlas(deps.getQuestProgress(), {
      watchTrailLandmarkIds,
    }), trigger);
  } catch {
    if (resumeAfterAtlas && getRun().status === "paused") {
      togglePause();
    }
    resumeAfterAtlas = false;
    announce(
      "Echo Atlas could not open. Continue the Quest and try again."
    );
  } finally {
    atlasOpening = false;
  }
}

/**
 * @param {AtlasOpenerDeps} deps
 * @param {string} landmarkId
 */
function replayRecordForLandmark(deps, landmarkId) {
  const questProgress = deps.getQuestProgress();
  return deps.getRunRecords().find(
    (record) =>
      isCompatibleRunReplay(record) &&
      record.questId === questProgress.questId &&
      record.questLevelId === questProgress.levelId &&
      record.labyrinthNumber !== undefined &&
      `${getDifficultyBand(record.labyrinthNumber).id}-` +
        `${record.labyrinthNumber}` === landmarkId
  ) ?? null;
}

/** @param {AtlasOpenerDeps} deps */
async function compatibleReplayLandmarkIds(deps) {
  try {
    if (!buildRunReplayTimeline) {
      ({ buildRunReplayTimeline } = await import("../run-replay.js"));
    }
  } catch {
    return new Set();
  }
  const questProgress = deps.getQuestProgress();
  return new Set(
    deps.getRunRecords()
      .filter(
        (record) =>
          isCompatibleRunReplay(record) &&
          record.questId === questProgress.questId &&
          record.questLevelId === questProgress.levelId &&
          record.labyrinthNumber !== undefined
      )
      .map(
        (record) =>
          `${getDifficultyBand(record.labyrinthNumber ?? 1).id}-` +
          `${record.labyrinthNumber}`
      )
  );
}

/** @param {{ replay?: unknown }} record */
function isCompatibleRunReplay(record) {
  if (!record.replay || !buildRunReplayTimeline) {
    return false;
  }
  try {
    buildRunReplayTimeline(/** @type {any} */ (record));
    return true;
  } catch {
    return false;
  }
}
