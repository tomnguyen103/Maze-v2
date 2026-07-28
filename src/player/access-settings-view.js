import {
  DEFAULT_ACCESS_SETTINGS,
  loadAccessSettings,
  saveAccessSettings
} from "./access-settings.js";

/**
 * @typedef {ReturnType<typeof loadAccessSettings>} AccessSettings
 * @typedef {Parameters<typeof loadAccessSettings>[0]} AccessSettingsStorage
 */

/**
 * @param {{
 *   storage?: AccessSettingsStorage,
 *   onApply?: (settings: AccessSettings) => void,
 *   onClose?: () => void,
 *   onSave?: (settings: AccessSettings) => void | Promise<{
 *     settings?: AccessSettings,
 *     close?: boolean,
 *     message?: string
 *   }>
 * }} [options]
 */
export function createAccessSettingsView({
  storage = globalThis.localStorage,
  onApply = () => {},
  onClose = () => {},
  onSave = () => {}
} = {}) {
  const elements = {
    close: requiredElement("access-settings-close", HTMLButtonElement),
    dialog: requiredElement("access-settings-dialog", HTMLDialogElement),
    form: requiredElement("access-settings-form", HTMLFormElement),
    highContrast: requiredElement("access-high-contrast", HTMLInputElement),
    largeMarks: requiredElement("access-large-marks", HTMLInputElement),
    readerType: requiredElement("access-reader-type", HTMLInputElement),
    reducedEffects: requiredElement(
      "access-reduced-effects",
      HTMLInputElement
    ),
    reset: requiredElement("access-settings-reset", HTMLButtonElement),
    status: requiredElement("access-settings-status", HTMLElement),
    title: requiredElement("access-settings-title", HTMLElement)
  };
  let savedSettings = loadAccessSettings(storage);
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  onApply(savedSettings);
  syncControls(savedSettings);

  elements.form.addEventListener("change", () => {
    elements.status.textContent = "Previewing. Save to keep these settings.";
    onApply(readControls(elements));
  });
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      savedSettings = saveAccessSettings(readControls(elements), storage);
      onApply(savedSettings);
      elements.status.textContent = "Saving settings…";
      const result = await onSave(savedSettings);
      if (result?.settings) {
        savedSettings = saveAccessSettings(result.settings, storage);
        syncControls(savedSettings);
        onApply(savedSettings);
      }
      elements.status.textContent = result?.message ?? "Settings saved.";
      if (result?.close !== false) {
        elements.dialog.close();
      }
    } catch {
      elements.status.textContent =
        "Settings could not be saved. Your current presentation is still active.";
    }
  });
  elements.reset.addEventListener("click", async () => {
    try {
      savedSettings = saveAccessSettings(DEFAULT_ACCESS_SETTINGS, storage);
      syncControls(savedSettings);
      onApply(savedSettings);
      elements.status.textContent = "Restoring canonical design…";
      const result = await onSave(savedSettings);
      if (result?.settings) {
        savedSettings = saveAccessSettings(result.settings, storage);
        syncControls(savedSettings);
        onApply(savedSettings);
      }
      elements.status.textContent =
        result?.close === false
          ? result.message ?? "Settings could not be reset."
          : "Canonical design restored.";
    } catch {
      elements.status.textContent =
        "Settings could not be reset. Your current presentation is still active.";
    }
  });
  elements.close.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) {
      elements.dialog.close();
    }
  });
  elements.dialog.addEventListener("close", () => {
    onApply(savedSettings);
    onClose();
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  });

  return {
    /** @param {AccessSettings} settings */
    replaceSavedSettings(settings) {
      savedSettings = saveAccessSettings(settings, storage);
      syncControls(savedSettings);
      onApply(savedSettings);
    },
    /** @param {HTMLElement} trigger */
    show(trigger) {
      returnFocus = trigger;
      syncControls(savedSettings);
      elements.status.textContent = "";
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
      elements.title.focus();
    }
  };
}

/**
 * @param {{
 *   highContrast: HTMLInputElement,
 *   largeMarks: HTMLInputElement,
 *   readerType: HTMLInputElement,
 *   reducedEffects: HTMLInputElement
 * }} elements
 * @returns {AccessSettings}
 */
function readControls(elements) {
  return {
    version: 1,
    highContrast: elements.highContrast.checked,
    largeMarks: elements.largeMarks.checked,
    readerFriendlyQuestions: elements.readerType.checked,
    reducedEffects: elements.reducedEffects.checked
  };
}

/**
 * @param {AccessSettings} settings
 * @param {{
 *   highContrast: HTMLInputElement,
 *   largeMarks: HTMLInputElement,
 *   readerType: HTMLInputElement,
 *   reducedEffects: HTMLInputElement
 * }} [elements]
 */
function syncControls(
  settings,
  elements = {
    highContrast: requiredElement("access-high-contrast", HTMLInputElement),
    largeMarks: requiredElement("access-large-marks", HTMLInputElement),
    readerType: requiredElement("access-reader-type", HTMLInputElement),
    reducedEffects: requiredElement(
      "access-reduced-effects",
      HTMLInputElement
    )
  }
) {
  elements.highContrast.checked = settings.highContrast;
  elements.largeMarks.checked = settings.largeMarks;
  elements.readerType.checked = settings.readerFriendlyQuestions;
  elements.reducedEffects.checked = settings.reducedEffects;
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {new (...args: never[]) => T} Type
 * @returns {T}
 */
function requiredElement(id, Type) {
  const element = document.getElementById(id);
  if (!(element instanceof Type)) {
    throw new Error(`Missing #${id}.`);
  }
  return element;
}
