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

/** Linear sRGB channels of an `oklch()` literal (oklch to OKLab to linear sRGB). */
function linearRgb(/** @type {string} */ literal) {
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
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

/** WCAG 2 relative luminance of linear sRGB channels. */
function lumaOf(/** @type {number[]} */ rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** WCAG 2 relative luminance of an `oklch()` literal. */
function luminance(/** @type {string} */ literal) {
  return lumaOf(linearRgb(literal));
}

const encode = (/** @type {number} */ c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

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

/** Contrast of a translucent ink over an opaque ground, mixed in gamma-encoded sRGB as the canvas does. */
function alphaRatio(
  /** @type {Map<string, string>} */ mode,
  /** @type {string} */ foreground,
  /** @type {number} */ alpha,
  /** @type {string} */ background
) {
  const inkRgb = linearRgb(resolve(mode, foreground));
  const groundRgb = linearRgb(resolve(mode, background));
  // The canvas mixes in gamma-encoded sRGB, so the test does the same.
  const mixedRgb = inkRgb.map((c, i) => decode(alpha * encode(c) + (1 - alpha) * encode(groundRgb[i])));
  const mixed = lumaOf(mixedRgb);
  const ground = lumaOf(groundRgb);
  const [high, low] = [mixed, ground].sort((x, y) => y - x);
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

  // ADR 0067 board paper forms: the pairs of the spec contrast table. The spec measured the mock hex
  // colours, so each token ratio may differ by a few tenths; every pair stays above its 3:1 duty.
  it.each([
    ["--board-ink", "--board-passage", 12.81, "Land outline on Passage"],
    ["--board-ink", "--board-land", 6.19, "Land outline on Land"],
    ["--board-ink", "--sky", 6.31, "Land outline on Fog"],
    ["--sky-deep", "--board-passage", 3.59, "Fog edge on Passage"],
    ["--board-echo", "--board-paper", 5.27, "Echo digit on the Echo disc"],
    ["--board-echo", "--board-passage", 4.97, "Echo disc on Passage"]
  ])("board paper: %s on %s is %s:1", (fg, bg, expected) => {
    expect(Math.abs(ratio(light, fg, bg) - Number(expected))).toBeLessThan(0.4);
  });

  it.each([
    ["--twilight-passage", 5.31],
    ["--sea-glass-passage", 5.81],
    ["--dusk-passage", 5.49],
    ["--access-passage", 5.89]
  ])("Fog edge (ink at 75%%) on %s is about %s:1", (passage, expected) => {
    expect(Math.abs(alphaRatio(light, "--board-ink", 0.75, passage) - Number(expected))).toBeLessThan(0.4);
  });

  it("computes the same ratio as the plan for a known pair", () => {
    expect(ratio(light, "--ink", "--paper")).toBeCloseTo(12.44, 0);
  });
});
