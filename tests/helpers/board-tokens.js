import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Every token the canvas renderer reads as a colour or a font. */
export const BOARD_TOKENS = [
  "--color-coastline", "--color-danger-line", "--color-board-echo", "--color-board-echo-text",
  "--color-board-ink", "--color-board-casing", "--color-board-explorer", "--color-board-explorer-disc",
  "--color-board-explorer-ring", "--font-body", "--font-utility", "--color-fog", "--color-fog-edge", "--color-fog-soft",
  "--color-board-gate", "--color-land-lip", "--color-land", "--color-board-light",
  "--color-board-light-on-fill", "--color-night-deep", "--color-on-fill", "--color-passage",
  "--color-board-warden", "--color-board-cover", "--color-board-cover-ink", "--board-paper"
];

/** @returns {Map<string, string>} the light-scope rows of the Popup tokens file */
function lightRows() {
  const css = readFileSync(resolve(process.cwd(), "src/looks/popup/tokens.css"), "utf8");
  const light = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  return new Map([...light.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((hit) => [hit[1], hit[2].trim()]));
}

/** @param {string} name @returns {string} the light value after each var() reference */
export function resolveBoardToken(name) {
  const value = lightRows().get(name) ?? "";
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolveBoardToken(reference[1]) : value;
}

/** Sets the light-scope value of each board token on the body, unless the test set it already. */
export function seedBoardTokens() {
  for (const name of BOARD_TOKENS) {
    if (!document.body.style.getPropertyValue(name)) document.body.style.setProperty(name, resolveBoardToken(name));
  }
}
