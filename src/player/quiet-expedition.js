/**
 * Quiet Expedition is a presentation composition, not another Access Settings
 * schema or gameplay mode. Keep these values beside the existing settings
 * contract so the document marker has one derivation path.
 *
 * @typedef {ReturnType<typeof import("./access-settings.js").loadAccessSettings>} AccessSettings
 */

const QUIET_EXPEDITION_COMPONENTS = Object.freeze({
  readerFriendlyQuestions: true,
  reducedEffects: true,
  trailCompassEnabled: true
});

/**
 * Return a new settings record with the explicit Quiet Expedition composition.
 * The caller still decides whether to save the preview.
 *
 * @param {AccessSettings} settings
 * @returns {AccessSettings}
 */
export function createQuietExpeditionSettings(settings) {
  return {
    ...settings,
    ...QUIET_EXPEDITION_COMPONENTS
  };
}

/**
 * @param {Partial<AccessSettings> | null | undefined} settings
 * @returns {boolean}
 */
export function isQuietExpeditionSettings(settings) {
  return Boolean(
    settings?.readerFriendlyQuestions &&
      settings.reducedEffects &&
      settings.trailCompassEnabled
  );
}
