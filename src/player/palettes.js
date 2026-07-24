export const EXPLORER_PALETTES = Object.freeze([
  Object.freeze({ id: "teal", label: "Signal teal" }),
  Object.freeze({ id: "sunset", label: "Sunset coral" }),
  Object.freeze({ id: "violet", label: "Quest violet" }),
  Object.freeze({ id: "gold", label: "Lantern gold" })
]);

export const PLAYGROUND_PALETTES = Object.freeze([
  Object.freeze({ id: "daylight", label: "Daylight" }),
  Object.freeze({ id: "twilight", label: "Twilight" }),
  Object.freeze({ id: "sea-glass", label: "Sea glass" }),
  Object.freeze({ id: "dusk", label: "Dusk" })
]);

export const DEFAULT_PLAYER_PROFILE = Object.freeze({
  username: "",
  explorerPalette: "teal",
  playgroundPalette: "daylight"
});

/** @type {Set<string>} */
const EXPLORER_IDS = new Set(EXPLORER_PALETTES.map(({ id }) => id));
/** @type {Set<string>} */
const PLAYGROUND_IDS = new Set(PLAYGROUND_PALETTES.map(({ id }) => id));

/**
 * @param {{ username?: string, explorerPalette?: string, playgroundPalette?: string }} profile
 * @param {{ dataset: DOMStringMap | Record<string, string> }} root
 */
export function applyPlayerPalettes(
  profile,
  root = document.documentElement
) {
  root.dataset.explorerPalette = EXPLORER_IDS.has(profile.explorerPalette ?? "")
    ? profile.explorerPalette
    : DEFAULT_PLAYER_PROFILE.explorerPalette;
  root.dataset.playgroundPalette = PLAYGROUND_IDS.has(
    profile.playgroundPalette ?? ""
  )
    ? profile.playgroundPalette
    : DEFAULT_PLAYER_PROFILE.playgroundPalette;
}
