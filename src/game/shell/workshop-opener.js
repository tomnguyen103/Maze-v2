/** @typedef {"play" | "journal" | "atlas"} WorkshopOrigin */

/**
 * @typedef {{
 *   getRun: () => { status: string },
 *   togglePause: () => void,
 *   announce: (message: string) => void,
 *   journalDialog: HTMLDialogElement,
 *   practiceDialog: HTMLDialogElement,
 *   workshopButton: HTMLElement,
 *   setReopenJournal: (reopen: boolean) => void,
 *   openLanternJournal: (options: { resumePausedRun: boolean }) => Promise<void>,
 *   showQuestAtlas: (trigger: HTMLElement, options: { resumePausedRun: boolean }) => Promise<void>,
 *   recordLearningOutcome: (question: any, outcome: "correct" | "wrong" | "hint" | "skip") => void
 * }} WorkshopDeps
 */

/** @type {Promise<ReturnType<typeof import("../../learning/lantern-trail-view.js").createLanternTrailView>> | null} */
let lanternTrailViewPromise = null;
let lanternTrailViewRetry = false;
let lanternTrailViewFailedTwice = false;
let resumeAfterWorkshop = false;
let workshopOpenPending = false;

/**
 * Opens the Lantern Trail Workshop. Loaded when the Explorer first opens it.
 * @param {WorkshopDeps} deps
 * @param {{
 *   levelId?: string,
 *   difficultyBand: string,
 *   learningObjectiveId?: string,
 *   origin: WorkshopOrigin,
 *   trigger: HTMLElement,
 *   resumePausedRun?: boolean
 * }} selection
 */
export async function openWorkshop(deps, selection) {
  const { journalDialog, practiceDialog, getRun, togglePause } = deps;
  if (workshopOpenPending || practiceDialog.open) return;
  // The Journal closed while this chunk loaded, so the Explorer moved on.
  if (selection.origin === "journal" && !journalDialog.open) return;
  workshopOpenPending = true;
  try {
    if (selection.origin === "journal") {
      resumeAfterWorkshop = journalDialog.dataset.resumeRun === "true";
      deps.setReopenJournal(true);
      delete journalDialog.dataset.resumeRun;
      if (journalDialog.open) {
        journalDialog.close();
      }
    } else {
      const pauseForWorkshop = getRun().status === "active";
      resumeAfterWorkshop =
        pauseForWorkshop || Boolean(selection.resumePausedRun);
      if (pauseForWorkshop) {
        togglePause();
      }
    }
    const view = await loadLanternTrailView(deps);
    view.show({
      ...selection,
      levelId: selection.levelId ?? levelIdForLearningObjective(selection.learningObjectiveId ?? "")
    });
  } catch {
    deps.announce(
      lanternTrailViewFailedTwice
        ? "Lantern Trail Workshop is unavailable. Reload to try again."
        : "Lantern Trail Workshop is unavailable. Try again."
    );
    await navigateAfterWorkshop(deps, selection.origin, selection.trigger);
  } finally {
    workshopOpenPending = false;
  }
}

/** @param {WorkshopDeps} deps */
function loadLanternTrailView(deps) {
  if (!lanternTrailViewPromise) {
    const retrying = lanternTrailViewRetry;
    const viewModule = retrying
      // @ts-expect-error Vite treats the query as a distinct retry chunk.
      ? import("../../learning/lantern-trail-view.js?retry=1")
      : import("../../learning/lantern-trail-view.js");
    lanternTrailViewRetry = true;
    lanternTrailViewPromise = viewModule
      .then(({ createLanternTrailView }) =>
        createLanternTrailView({
          onNavigate: (
            /** @type {WorkshopOrigin} */ destination,
            /** @type {HTMLElement | null} */ returnTarget
          ) => {
            void navigateAfterWorkshop(deps, destination, returnTarget);
          },
          onRecord: (
            /** @type {any} */ question,
            /** @type {"correct" | "wrong" | "hint" | "skip"} */ outcome
          ) => {
            deps.recordLearningOutcome(question, outcome);
          }
        })
      )
      .catch((error) => {
        lanternTrailViewPromise = null;
        lanternTrailViewFailedTwice ||= retrying;
        throw error;
      });
  }
  return lanternTrailViewPromise;
}

/**
 * @param {WorkshopDeps} deps
 * @param {WorkshopOrigin} destination
 * @param {HTMLElement | null} returnTarget
 */
async function navigateAfterWorkshop(deps, destination, returnTarget) {
  const resumeRun = resumeAfterWorkshop;
  resumeAfterWorkshop = false;
  deps.setReopenJournal(false);
  if (destination === "journal") {
    await deps.openLanternJournal({ resumePausedRun: resumeRun });
    return;
  }
  if (destination === "atlas") {
    await deps.showQuestAtlas(deps.workshopButton, {
      resumePausedRun: resumeRun
    });
    return;
  }
  if (resumeRun && deps.getRun().status === "paused") {
    deps.togglePause();
  }
  returnTarget?.focus({ preventScroll: true });
}


/** @param {string} learningObjectiveId */
function levelIdForLearningObjective(learningObjectiveId) {
  if (learningObjectiveId.startsWith("bright-")) return "bright-start";
  if (learningObjectiveId.startsWith("scout-")) return "trail-scout";
  if (learningObjectiveId.startsWith("master-")) return "maze-master";
  return "";
}
