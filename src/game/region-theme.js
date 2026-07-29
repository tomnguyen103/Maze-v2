/** @type {Readonly<Record<string, Readonly<{
 *   id: string,
 *   name: string,
 *   motif: string,
 *   wardenGuild: string,
 *   ambientLabel: string,
 *   sigilName: string
 * }>>>} */
const REGION_THEMES = Object.freeze({
  foundation: Object.freeze({
    id: "mosslight-grove",
    name: "Mosslight Grove",
    motif: "Lantern moss and quiet stone",
    wardenGuild: "Bramblewatch Guild",
    ambientLabel: "Mosslight night chorus",
    sigilName: "First Echo Sigil"
  })
});

/** @param {string} atlasRegionId */
export function getRegionTheme(atlasRegionId) {
  return REGION_THEMES[atlasRegionId] ?? null;
}
