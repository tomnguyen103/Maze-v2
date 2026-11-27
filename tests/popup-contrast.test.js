import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(root + "src/looks/popup/tokens.css", "utf8").replace(
  /\r\n/g,
  "\n"
);

/** The declarations of the block that starts at `selector`, up to its closing brace. */
function declarations(/** @type {string} */ selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end += 1) {
    if (css[end] === "{") depth += 1;
    if (css[end] === "}") depth -= 1;
    if (depth === 0) break;
  }
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const match of css.slice(open + 1, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

const light = declarations(":root {");
const night = new Map([...light, ...declarations(':root[data-theme="dark"]')]);

/** Resolves `var(--x)` chains to the final oklch literal. */
function resolve(/** @type {Map<string, string>} */ mode, /** @type {string} */ name) {
  let value = mode.get(name);
  for (let depth = 0; value?.startsWith("var("); depth += 1) {
    if (depth > 8) throw new Error(`var cycle at ${name}`);
    value = mode.get(value.slice(4, -1).trim());
  }
  if (!value) throw new Error(`${name} is not defined`);
  return value;
}

/** WCAG 2 relative luminance of an `oklch()` literal (oklch to OKLab to linear sRGB). */
function luminance(/** @type {string} */ literal) {
  const match = literal.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
  if (!match) throw new Error(`not an opaque oklch literal: ${literal}`);
  const lightness = Number(match[1]) / 100;
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function ratio(
  /** @type {Map<string, string>} */ mode,
  /** @type {string} */ foreground,
  /** @type {string} */ background
) {
  const [high, low] = [
    luminance(resolve(mode, foreground)),
    luminance(resolve(mode, background))
  ].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Each pair is [foreground token, background token, bar]. Bars follow plan section 4.2. */
/** @type {[string, string, number][]} */
const LIGHT_PAIRS = [
  ["--ink", "--paper", 7],
  ["--ink", "--card", 7],
  ["--ink-soft", "--paper", 7],
  ["--ink", "--sun", 7],
  ["--ink", "--sky", 4.5],
  ["--ink", "--meadow", 4.5],
  ["--coral-deep", "--paper", 4.5],
  ["--cover-deep", "--card", 7],
  ["--cover-deep", "--paper", 7],
  ["--color-on-fill", "--cover-fill", 7],
  ["--fur", "--meadow", 3],
  ["--fur", "--sky", 3],
  ["--focus", "--paper", 3],
  ["--focus", "--card", 3],
  ["--focus", "--cover", 3],
  // Constellation band captions: surface.css gives the bright band full ink.
  ["--color-ink-muted", "--color-band-1", 4.5],
  ["--color-ink-muted", "--color-band-2", 4.5],
  ["--color-ink", "--color-band-3", 4.5]
];

/** @type {[string, string, number][]} */
const NIGHT_PAIRS = [
  ["--ink", "--paper", 7],
  ["--ink", "--card", 7],
  ["--ink-soft", "--paper", 7],
  ["--ink-soft", "--card", 7],
  ["--coral-deep", "--paper", 4.5],
  ["--coral-deep", "--card", 4.5],
  ["--cover-deep", "--paper", 7],
  ["--cover-deep", "--card", 7],
  ["--color-on-fill", "--cover-fill", 7],
  ["--focus", "--paper", 3],
  ["--focus", "--card", 3],
  ["--color-ink-muted", "--color-band-1", 4.5],
  ["--color-ink-muted", "--color-band-2", 4.5],
  ["--color-ink-muted", "--color-band-3", 4.5],
  ["--color-ink", "--color-band-3", 4.5]
];

describe("Popup contrast (WCAG 2)", () => {
  it.each(LIGHT_PAIRS)("light: %s on %s reaches %s:1", (fg, bg, bar) => {
    expect(ratio(light, fg, bg)).toBeGreaterThanOrEqual(bar);
  });

  it.each(NIGHT_PAIRS)("Night: %s on %s reaches %s:1", (fg, bg, bar) => {
    expect(ratio(night, fg, bg)).toBeGreaterThanOrEqual(bar);
  });

  it("keeps the ratios that fail alone failing, so each such mark needs an ink outline", () => {
    expect(ratio(light, "--ink", "--coral")).toBeLessThan(4.5);
    expect(ratio(light, "--coral", "--paper")).toBeLessThan(3);
    expect(ratio(light, "--meadow", "--paper")).toBeLessThan(3);
    expect(ratio(light, "--sky", "--paper")).toBeLessThan(3);
    expect(ratio(light, "--clover", "--meadow")).toBeLessThan(3);
  });

  it("computes the same ratio as the plan for a known pair", () => {
    expect(ratio(light, "--ink", "--paper")).toBeCloseTo(12.44, 0);
  });
});
