import { CLASS_EXPEDITION_ACTIVE_KEY } from "../classroom/class-expedition-selection.js";

/** @typedef {"clover" | "pip" | "lumi" | "fen" | "tuck"} ExplorerFigure */
/** @typedef {Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "key" | "length">>} FigureStorage */

// Plain Class Play stores the Classroom under this prefix plus the user id (src/classroom/classroom-selection.js).
const CLASSROOM_SELECTION_PREFIX = "echo-maze:selected-classroom:v1:";

export const EXPLORER_FIGURE_STORAGE_KEY = "echo-maze:explorer-figure:v1";
/** @type {readonly ExplorerFigure[]} */
export const EXPLORER_FIGURES = Object.freeze(["clover", "pip", "lumi", "fen", "tuck"]);

/** @param {unknown} value @returns {value is ExplorerFigure} */
const isFigure = (value) => EXPLORER_FIGURES.includes(/** @type {ExplorerFigure} */ (value));

/**
 * The saved pick, or Clover on a new device, a bad value, or a storage error.
 * @param {FigureStorage | undefined} [storage]
 * @returns {ExplorerFigure}
 */
export function loadExplorerFigure(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(EXPLORER_FIGURE_STORAGE_KEY);
    return isFigure(value) ? value : "clover";
  } catch {
    return "clover";
  }
}

/**
 * Saves the pick and returns it. A value outside the list saves Clover. A storage error propagates.
 * @param {string} figure
 * @param {FigureStorage | undefined} [storage]
 * @returns {ExplorerFigure}
 */
export function saveExplorerFigure(figure, storage = globalThis.localStorage) {
  const value = isFigure(figure) ? figure : "clover";
  storage.setItem(EXPLORER_FIGURE_STORAGE_KEY, value);
  return value;
}

/**
 * The figure to draw. Class Play (plain or a Class Expedition) always draws Clover (D14).
 * @param {FigureStorage | undefined} [storage]
 * @returns {ExplorerFigure}
 */
export function explorerFigureForPlay(storage = globalThis.localStorage) {
  try {
    if (storage.getItem(CLASS_EXPEDITION_ACTIVE_KEY) === "true") return "clover";
    // shortcut: the art has no user id, so any stored Classroom selection counts as Class Play; it errs toward Clover on a shared device.
    for (let index = 0; index < (storage.length ?? 0); index += 1) {
      const key = storage.key?.(index);
      if (key?.startsWith(CLASSROOM_SELECTION_PREFIX) && storage.getItem(key)?.startsWith("org_")) return "clover";
    }
  } catch {
    return "clover";
  }
  return loadExplorerFigure(storage);
}
