/** @type {Promise<ReturnType<typeof import("../run-replay-view.js").createRunReplayView>> | null} */
let runReplayViewPromise = null;
let runReplayOpening = false;
let runReplayViewRetry = false;
let resumeAfterRunReplay = false;

/**
 * Opens the Run Replay dialog. Loaded when the Explorer first watches a Trail.
 * @param {{
 *   getRun: () => { status: string },
 *   togglePause: () => void,
 *   announce: (message: string) => void
 * }} deps
 * @param {any} record
 * @param {HTMLElement} trigger
 * @param {boolean} resumeRun
 */
export async function openRunReplay(
  { getRun, togglePause, announce },
  record,
  trigger,
  resumeRun
) {
  resumeAfterRunReplay = resumeRun;
  if (runReplayOpening || !record.replay) {
    return;
  }
  runReplayOpening = true;
  const retrying = runReplayViewRetry;
  try {
    let view;
    try {
      if (!runReplayViewPromise) {
        /** @type {Promise<typeof import("../run-replay-view.js")>} */
        const viewModule = retrying
          // @ts-expect-error Vite treats the query as a distinct retry chunk.
          ? import("../run-replay-view.js?retry=1")
          : import("../run-replay-view.js");
        runReplayViewRetry = true;
        runReplayViewPromise = viewModule.then(
          ({ createRunReplayView }) => createRunReplayView({
            onClose: () => {
              if (resumeAfterRunReplay && getRun().status === "paused") {
                togglePause();
              }
              resumeAfterRunReplay = false;
            }
          })
        );
      }
      view = await runReplayViewPromise;
    } catch {
      runReplayViewPromise = null;
      if (resumeAfterRunReplay && getRun().status === "paused") {
        togglePause();
      }
      resumeAfterRunReplay = false;
      announce(
        retrying
          ? "This Trail is unavailable. Reload to try again."
          : "This Trail is unavailable. Try again."
      );
      return;
    }
    try {
      view.show(record, trigger);
    } catch {
      if (resumeAfterRunReplay && getRun().status === "paused") {
        togglePause();
      }
      resumeAfterRunReplay = false;
      announce(
        "This Trail is corrupt, so it cannot be watched. Play This Seed is still available."
      );
    }
  } finally {
    runReplayOpening = false;
  }
}
