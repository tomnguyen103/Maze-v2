export const ACCESS_SETTINGS_STORAGE_KEY =
  "echo-maze:explorer-access-settings:v1";

export const DEFAULT_ACCESS_SETTINGS = Object.freeze({
  version: 1,
  highContrast: false,
  largeMarks: false,
  readerFriendlyQuestions: false,
  reducedEffects: false
});

/**
 * @typedef {{
 *   version: 1,
 *   highContrast: boolean,
 *   largeMarks: boolean,
 *   readerFriendlyQuestions: boolean,
 *   reducedEffects: boolean
 * }} AccessSettings
 * @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} AccessSettingsStorage
 */

/**
 * @param {AccessSettingsStorage} [storage]
 * @returns {AccessSettings}
 */
export function loadAccessSettings(storage = globalThis.localStorage) {
  try {
    return normalizeAccessSettings(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    );
  } catch {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
}

/**
 * @param {AccessSettings} settings
 * @param {AccessSettingsStorage} [storage]
 * @returns {AccessSettings}
 */
export function saveAccessSettings(
  settings,
  storage = globalThis.localStorage
) {
  const normalized = normalizeAccessSettings(settings);
  storage.setItem(ACCESS_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * @param {AccessSettings} settings
 * @param {HTMLElement} [root]
 */
export function applyAccessSettings(
  settings,
  root = document.documentElement
) {
  const normalized = normalizeAccessSettings(settings);
  root.dataset.accessContrast = normalized.highContrast
    ? "strong"
    : "default";
  root.dataset.accessMarks = normalized.largeMarks ? "large" : "default";
  root.dataset.accessType = normalized.readerFriendlyQuestions
    ? "reader"
    : "default";
  root.dataset.accessEffects = normalized.reducedEffects
    ? "reduced"
    : "system";
}

/** @param {unknown} value @returns {AccessSettings} */
function normalizeAccessSettings(value) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
  const candidate =
    /** @type {Partial<AccessSettings> & { version?: unknown }} */ (value);
  if (
    candidate.version !== 1 ||
    typeof candidate.highContrast !== "boolean" ||
    typeof candidate.largeMarks !== "boolean" ||
    typeof candidate.readerFriendlyQuestions !== "boolean" ||
    typeof candidate.reducedEffects !== "boolean"
  ) {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
  return {
    version: 1,
    highContrast: candidate.highContrast,
    largeMarks: candidate.largeMarks,
    readerFriendlyQuestions: candidate.readerFriendlyQuestions,
    reducedEffects: candidate.reducedEffects
  };
}
