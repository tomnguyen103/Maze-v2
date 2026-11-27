/** @typedef {NonNullable<Parameters<typeof import("../../player/access-settings-view.js").createAccessSettingsView>[0]>} AccessSettingsOptions */
/** @type {Promise<ReturnType<typeof import("../../player/access-settings-view.js").createAccessSettingsView>> | null} */
let accessSettingsViewPromise = null;
let accessSettingsOpening = false;
let accessSettingsViewRetry = false;
let resumeAfterAccessSettings = false;

/**
 * Opens Explorer Access Settings. Loaded when the Explorer first opens Settings.
 * @param {{
 *   getRun: () => { status: string },
 *   togglePause: () => void,
 *   announce: (message: string) => void,
 * } & Pick<AccessSettingsOptions, "onApply" | "onSave">} deps
 * @param {HTMLElement} trigger
 */
export async function openAccessSettings(deps, trigger) {
  const { getRun, togglePause, announce } = deps;
  if (accessSettingsOpening) {
    return;
  }
  accessSettingsOpening = true;
  resumeAfterAccessSettings = getRun().status === "active";
  if (resumeAfterAccessSettings) {
    togglePause();
  }
  const retrying = accessSettingsViewRetry;
  try {
    if (!accessSettingsViewPromise) {
      /** @type {Promise<typeof import("../../player/access-settings-view.js")>} */
      const viewModule = retrying
        // @ts-expect-error Vite treats the query as a distinct retry chunk.
        ? import("../../player/access-settings-view.js?retry=1")
        : import("../../player/access-settings-view.js");
      accessSettingsViewRetry = true;
      accessSettingsViewPromise = viewModule.then(
        ({ createAccessSettingsView }) =>
          createAccessSettingsView({
            onApply: deps.onApply,
            onClose: () => {
              if (resumeAfterAccessSettings && getRun().status === "paused") {
                togglePause();
              }
              resumeAfterAccessSettings = false;
            },
            onSave: deps.onSave
          })
      );
    }
    const accessSettingsView = await accessSettingsViewPromise;
    accessSettingsView.show(trigger);
  } catch {
    accessSettingsViewPromise = null;
    if (resumeAfterAccessSettings && getRun().status === "paused") {
      togglePause();
    }
    resumeAfterAccessSettings = false;
    announce(
      retrying
        ? "Explorer Access Settings are unavailable. Reload to try again."
        : "Explorer Access Settings are unavailable. Try again."
    );
  } finally {
    accessSettingsOpening = false;
  }
}

/** @param {any} settings */
export function replaceSavedSettings(settings) {
  void accessSettingsViewPromise
    ?.then((view) => view.replaceSavedSettings(settings))
    .catch(() => {});
}
