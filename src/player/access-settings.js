export const ACCESS_SETTINGS_STORAGE_KEY =
  "echo-maze:explorer-access-settings:v1";

export const NARRATION_PACES = Object.freeze([
  "standard",
  "slower",
  "faster"
]);

export const DEFAULT_ACCESS_SETTINGS = Object.freeze({
  version: 2,
  highContrast: false,
  largeMarks: false,
  readerFriendlyQuestions: false,
  reducedEffects: false,
  trailCompassEnabled: false,
  narrationPace: "standard"
});

/**
 * @typedef {"standard" | "slower" | "faster"} NarrationPace
 * @typedef {{
 *   version: 2,
 *   highContrast: boolean,
 *   largeMarks: boolean,
 *   readerFriendlyQuestions: boolean,
 *   reducedEffects: boolean,
 *   trailCompassEnabled: boolean,
 *   narrationPace: NarrationPace
 * }} AccessSettings
 * @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} AccessSettingsStorage
 */

/**
 * @param {AccessSettingsStorage} [storage]
 * @returns {AccessSettings}
 */
export function loadAccessSettings(storage) {
  try {
    storage ??= globalThis.localStorage;
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
  storage
) {
  storage ??= globalThis.localStorage;
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
  root.dataset.accessCompass = normalized.trailCompassEnabled
    ? "trail"
    : "off";
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
    /** @type {Partial<Record<keyof AccessSettings, unknown>>} */ (value);
  if (
    (candidate.version !== 1 && candidate.version !== 2) ||
    typeof candidate.highContrast !== "boolean" ||
    typeof candidate.largeMarks !== "boolean" ||
    typeof candidate.readerFriendlyQuestions !== "boolean" ||
    typeof candidate.reducedEffects !== "boolean"
  ) {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
  if (candidate.version === 1) {
    // ADR 0031: existing four-field records migrate deterministically to
    // Trail Compass Off and Standard narration pace.
    if (
      "trailCompassEnabled" in candidate ||
      "narrationPace" in candidate
    ) {
      return { ...DEFAULT_ACCESS_SETTINGS };
    }
    return {
      version: 2,
      highContrast: candidate.highContrast,
      largeMarks: candidate.largeMarks,
      readerFriendlyQuestions: candidate.readerFriendlyQuestions,
      reducedEffects: candidate.reducedEffects,
      trailCompassEnabled: false,
      narrationPace: "standard"
    };
  }
  if (
    typeof candidate.trailCompassEnabled !== "boolean" ||
    !NARRATION_PACES.includes(
      /** @type {NarrationPace} */ (candidate.narrationPace)
    )
  ) {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
  return {
    version: 2,
    highContrast: candidate.highContrast,
    largeMarks: candidate.largeMarks,
    readerFriendlyQuestions: candidate.readerFriendlyQuestions,
    reducedEffects: candidate.reducedEffects,
    trailCompassEnabled: candidate.trailCompassEnabled,
    narrationPace: /** @type {NarrationPace} */ (candidate.narrationPace)
  };
}
