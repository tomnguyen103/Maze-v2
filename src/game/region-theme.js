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
  }),
  developing: Object.freeze({
    id: "windcall-ridge",
    name: "Windcall Ridge",
    motif: "Rising wind and bright trail ribbons",
    wardenGuild: "Kitewatch Guild",
    ambientLabel: "Windcall reed chorus",
    sigilName: "Rising Wind Sigil"
  }),
  capable: Object.freeze({
    id: "sunspan-crossing",
    name: "Sunspan Crossing",
    motif: "Joined arches and clear blue spans",
    wardenGuild: "Spanwatch Guild",
    ambientLabel: "Sunspan string chorus",
    sigilName: "Joined Path Sigil"
  })
});

/** @param {string} atlasRegionId */
export function getRegionTheme(atlasRegionId) {
  return REGION_THEMES[atlasRegionId] ?? null;
}
