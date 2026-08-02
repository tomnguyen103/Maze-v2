import "./region-theme.css";
import { REGION_MOTIFS } from "./region-metadata.js";

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
    motif: REGION_MOTIFS.foundation,
    wardenGuild: "Bramblewatch Guild",
    ambientLabel: "Mosslight night chorus",
    sigilName: "First Echo Sigil"
  }),
  developing: Object.freeze({
    id: "windcall-ridge",
    name: "Windcall Ridge",
    motif: REGION_MOTIFS.developing,
    wardenGuild: "Kitewatch Guild",
    ambientLabel: "Windcall reed chorus",
    sigilName: "Rising Wind Sigil"
  }),
  capable: Object.freeze({
    id: "sunspan-crossing",
    name: "Sunspan Crossing",
    motif: REGION_MOTIFS.capable,
    wardenGuild: "Spanwatch Guild",
    ambientLabel: "Sunspan string chorus",
    sigilName: "Joined Path Sigil"
  }),
  advanced: Object.freeze({
    id: "tideglass-reach",
    name: "Tideglass Reach",
    motif: REGION_MOTIFS.advanced,
    wardenGuild: "Currentwatch Guild",
    ambientLabel: "Tideglass shell chorus",
    sigilName: "Turning Tide Sigil"
  }),
  mastery: Object.freeze({
    id: "bellroot-summit",
    name: "Bellroot Summit",
    motif: REGION_MOTIFS.mastery,
    wardenGuild: "Chimewatch Guild",
    ambientLabel: "Bellroot dusk chorus",
    sigilName: "Last Light Sigil"
  })
});

/** @param {string} atlasRegionId */
export function getRegionTheme(atlasRegionId) {
  return REGION_THEMES[atlasRegionId] ?? null;
}
