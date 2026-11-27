import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Every token the canvas renderer reads as a colour or a font. */
export const BOARD_TOKENS = [
  "--color-coastline", "--color-danger-line", "--color-board-echo", "--color-board-echo-text",
  "--color-board-ink", "--color-board-casing", "--color-board-explorer", "--color-board-explorer-disc",
  "--color-board-explorer-ring", "--font-body", "--font-utility", "--color-fog", "--color-fog-dot",
  "--color-board-gate", "--color-hatch", "--color-ink", "--color-land", "--color-board-light",
  "--color-board-light-on-fill", "--color-night-deep", "--color-on-fill", "--color-passage",
  "--color-pulse", "--color-board-warden"
];

const css = readFileSync(resolve(process.cwd(), "src/looks/pilot/tokens.css"), "utf8");
const light = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const rows = new Map([...light.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((hit) => [hit[1], hit[2].trim()]));

/** @param {string} name @returns {string} */
function resolveToken(name) {
  const value = rows.get(name) ?? "";
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolveToken(reference[1]) : value;
}

/** Sets the light-scope value of each board token on the body, unless the test set it already. */
export function seedBoardTokens() {
  for (const name of BOARD_TOKENS) {
    if (!document.body.style.getPropertyValue(name)) document.body.style.setProperty(name, resolveToken(name));
  }
}
