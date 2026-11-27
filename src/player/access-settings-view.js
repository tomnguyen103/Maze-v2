import {
  DEFAULT_ACCESS_SETTINGS,
  loadAccessSettings,
  saveAccessSettings
} from "./access-settings.js";
import {
  loadExplorerFigure,
  saveExplorerFigure
} from "./explorer-figure.js";
import { createQuietExpeditionSettings } from "./quiet-expedition.js";

/**
 * @typedef {ReturnType<typeof loadAccessSettings>} AccessSettings
 * @typedef {Parameters<typeof loadAccessSettings>[0]} AccessSettingsStorage
 */

/**
 * @param {{
 *   storage?: AccessSettingsStorage,
 *   loadArt?: () => Promise<{ default: { drawFigure: Function } | null } | null>,
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
  loadArt = () => import("@look/board-art.js"),
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
    trailCompass: requiredElement("access-trail-compass", HTMLInputElement),
    narrationPace: requiredElement(
      "access-narration-pace",
      HTMLSelectElement
    ),
    quietPreset: requiredElement(
      "access-quiet-expedition",
      HTMLButtonElement
    ),
    reset: requiredElement("access-settings-reset", HTMLButtonElement),
    status: requiredElement("access-settings-status", HTMLElement),
    title: requiredElement("access-settings-title", HTMLElement)
  };
  const picker = document.getElementById("access-explorer-figure");
  const figureRadios = /** @type {HTMLInputElement[]} */ ([
    ...(picker?.querySelectorAll('input[name="explorerFigure"]') ?? [])
  ]);
  let savedSettings = loadAccessSettings(storage);
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  onApply(savedSettings);
  syncControls(savedSettings);
  syncFigure(loadExplorerFigure(storage));
  void showFigurePicker().catch(() => {});

  elements.form.addEventListener("change", () => {
    elements.status.textContent = "Previewing. Save to keep these settings.";
    onApply(readControls(elements));
  });
  elements.quietPreset.addEventListener("click", () => {
    const preset = createQuietExpeditionSettings(readControls(elements));
    syncControls(preset);
    onApply(preset);
    elements.status.textContent =
      "Quiet Expedition previewing. Save to keep this calm presentation.";
  });
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      // The pick saves first, so the repaint in onApply draws it.
      if (picker && !picker.hidden) saveExplorerFigure(readFigure(), storage);
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
      syncFigure("clover");
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
    syncFigure(loadExplorerFigure(storage));
    onApply(savedSettings);
    onClose();
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  });

  /** @param {string} figure */
  function syncFigure(figure) {
    for (const radio of figureRadios) radio.checked = radio.value === figure;
  }

  function readFigure() {
    return figureRadios.find((radio) => radio.checked)?.value ?? "clover";
  }

  // The picker stays hidden when the look has no art (Pilot) or the art fails.
  async function showFigurePicker() {
    if (!picker) return;
    const art = (await loadArt())?.default;
    if (!art) return;
    const ratio = globalThis.devicePixelRatio || 1;
    const flat =
      globalThis.matchMedia?.("(forced-colors: active)").matches ||
      readControls(elements).highContrast;
    for (const radio of figureRadios) {
      const canvas = radio.parentElement?.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) continue;
      const side = Math.round(canvas.width * ratio);
      canvas.width = canvas.height = side;
      art.drawFigure(context, radio.value, "idle", side, flat);
    }
    picker.hidden = false;
  }

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
      syncFigure(loadExplorerFigure(storage));
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
 *   reducedEffects: HTMLInputElement,
 *   trailCompass: HTMLInputElement,
 *   narrationPace: HTMLSelectElement
 * }} elements
 * @returns {AccessSettings}
 */
function readControls(elements) {
  return {
    version: 2,
    highContrast: elements.highContrast.checked,
    largeMarks: elements.largeMarks.checked,
    readerFriendlyQuestions: elements.readerType.checked,
    reducedEffects: elements.reducedEffects.checked,
    trailCompassEnabled: elements.trailCompass.checked,
    narrationPace: /** @type {AccessSettings["narrationPace"]} */ (
      elements.narrationPace.value
    )
  };
}

/**
 * @param {AccessSettings} settings
 * @param {{
 *   highContrast: HTMLInputElement,
 *   largeMarks: HTMLInputElement,
 *   readerType: HTMLInputElement,
 *   reducedEffects: HTMLInputElement,
 *   trailCompass: HTMLInputElement,
 *   narrationPace: HTMLSelectElement
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
    ),
    trailCompass: requiredElement("access-trail-compass", HTMLInputElement),
    narrationPace: requiredElement(
      "access-narration-pace",
      HTMLSelectElement
    )
  }
) {
  elements.highContrast.checked = settings.highContrast;
  elements.largeMarks.checked = settings.largeMarks;
  elements.readerType.checked = settings.readerFriendlyQuestions;
  elements.reducedEffects.checked = settings.reducedEffects;
  elements.trailCompass.checked = settings.trailCompassEnabled;
  elements.narrationPace.value = settings.narrationPace;
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
