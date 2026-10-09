import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRegionTheme } from "../src/game/region-theme.js";
import { renderAtlasIllustrationMarkup } from "../src/game/quest-atlas-view.js";

const ATLAS_REGION_IDS = ["foundation", "developing", "capable", "advanced", "mastery"];
const NEUTRAL_WASH = "color-mix(in oklab, var(--color-ink-muted) 30%, var(--color-paper))";
const tokensCss = readFileSync(resolve(process.cwd(), "tokens.css"), "utf8");
const atlasCss = readFileSync(resolve(process.cwd(), "src/game/quest-atlas.css"), "utf8");

/** @param {string} selector */
function scopeOf(selector) {
  const start = tokensCss.indexOf(selector);
  return tokensCss.slice(start, tokensCss.indexOf("}", start));
}
const LIGHT = scopeOf(":root {");
const NIGHT = scopeOf(':root[data-theme="dark"] {');

/**
 * @param {string} scope
 * @param {string} name
 * @returns {string}
 */
function tokenValue(scope, name) {
  const hit = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (hit) return hit[1].trim();
  if (scope === LIGHT) throw new Error(`missing token ${name}`);
  return tokenValue(LIGHT, name);
}

/**
 * @param {string} value
 * @returns {number[]}
 */
function oklabOf(value) {
  const hit = value.match(/^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/);
  if (!hit) throw new Error(`not an oklch value: ${value}`);
  const chroma = Number(hit[3]);
  const hue = (Number(hit[4]) * Math.PI) / 180;
  return [Number(hit[1]) / (hit[2] ? 100 : 1), chroma * Math.cos(hue), chroma * Math.sin(hue)];
}

/**
 * Resolves the two-token `color-mix(in oklab, ...)` form the Atlas uses.
 * @param {string} fill
 * @param {string} scope
 * @returns {number[]}
 */
function mixedOklab(fill, scope) {
  const hit = fill.match(/^color-mix\(in oklab, var\((--[\w-]+)\) (\d+)%, var\((--[\w-]+)\)\)$/);
  if (!hit) throw new Error(`unexpected fill: ${fill}`);
  const weight = Number(hit[2]) / 100;
  const first = oklabOf(tokenValue(scope, hit[1]));
  const second = oklabOf(tokenValue(scope, hit[3]));
  return first.map((channel, index) => weight * channel + (1 - weight) * second[index]);
}

const unit = (/** @type {number} */ value) => Math.min(1, Math.max(0, value));

/** @param {number[]} lab */
function relativeLuminance([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = unit(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = unit(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = unit(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * @param {number[]} first
 * @param {number[]} second
 */
function contrastRatio(first, second) {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function atlasMarkup(ids = ATLAS_REGION_IDS) {
  return renderAtlasIllustrationMarkup(ids);
}

/** @param {string} selector */
function atlasFill(selector) {
  const rule = atlasCss.indexOf(`${selector} {`);
  if (rule < 0) throw new Error(`missing Atlas rule ${selector}`);
  const body = atlasCss.slice(rule, atlasCss.indexOf("}", rule));
  return body.match(/fill:\s*([^;]+);/)?.[1].trim() ?? "";
}

/** @param {string} markup */
function territoryFills(markup) {
  return [...markup.matchAll(/<path class="atlas-illustration__territory"([^>]*)>/g)].map((hit) => {
    const region = hit[1].match(/data-region="([\w-]+)"/)?.[1];
    return atlasFill(region ? `.atlas-illustration__territory[data-region="${region}"]` : ".atlas-illustration__territory");
  });
}

describe("US-07 — Atlas territories", () => {
  it("US-07.1 draws five territories, each with a landmark stamp, a Gate flag and a dashed trail", () => {
    const markup = atlasMarkup();

    expect(territoryFills(markup)).toHaveLength(5);
    expect(markup.match(/atlas-illustration__stamp/g)).toHaveLength(5);
    expect(markup.match(/atlas-illustration__gate/g)).toHaveLength(5);
    expect(markup).toContain('class="atlas-illustration__trail"');
  });

  it("US-07.2 keeps five distinct territory fills at 3:1 against the Atlas ground in light and Night", () => {
    const fills = territoryFills(atlasMarkup());

    expect(new Set(fills).size).toBe(5);
    for (const scope of [LIGHT, NIGHT]) {
      const ground = oklabOf(tokenValue(scope, "--color-paper"));
      for (const fill of fills) {
        expect(contrastRatio(mixedOklab(fill, scope), ground)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("US-07.3 keeps island, bridge, rope and blob words out of the Atlas markup and CSS", () => {
    expect(atlasMarkup()).not.toMatch(/\b(island|bridge|rope|blob)s?\b/i);
    expect(atlasCss).not.toMatch(/\b(island|bridge|rope|blob)s?\b/i);
  });

  it("US-07.2 keeps the Atlas markup free of inline style, which the strict style-src blocks", () => {
    expect(atlasMarkup()).not.toMatch(/\sstyle=/);
  });

  it("US-07.4 returns identical SVG on a rerender with the same progress", () => {
    expect(atlasMarkup()).toBe(atlasMarkup());
  });

  it("US-07.5 falls back to the neutral wash for an unknown Region id without throwing", () => {
    const ids = ["foundation", "not-a-region", "capable", "advanced", "mastery"];

    expect(() => atlasMarkup(ids)).not.toThrow();
    expect(territoryFills(atlasMarkup(ids))[1]).toBe(NEUTRAL_WASH);
  });
});

describe("Region Theme", () => {
  it("authors Region 1 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "foundation",
      revision: "echo-hush-v1",
      label: "Echo Hush"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "mosslight-grove",
      name: "Mosslight Grove",
      motif: "Lantern moss and quiet stone",
      wardenGuild: "Bramblewatch Guild",
      ambientLabel: "Mosslight night chorus",
      sigilName: "First Echo Sigil"
    });
    expect(ruleset).toEqual(before);
  });

  it("authors Region 2 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "developing",
      revision: "windways-v1",
      label: "Windways"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "windcall-ridge",
      name: "Windcall Ridge",
      motif: "Rising wind and bright trail ribbons",
      wardenGuild: "Kitewatch Guild",
      ambientLabel: "Windcall reed chorus",
      sigilName: "Rising Wind Sigil"
    });
    expect(ruleset).toEqual(before);
  });

  it("authors Region 3 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "capable",
      revision: "echo-bridges-v1",
      label: "Echo Bridges"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "sunspan-crossing",
      name: "Sunspan Crossing",
      motif: "Joined arches and clear blue spans",
      wardenGuild: "Spanwatch Guild",
      ambientLabel: "Sunspan string chorus",
      sigilName: "Joined Path Sigil"
    });
    expect(ruleset).toEqual(before);
    expect(getRegionTheme("advanced")).toEqual({
      id: "tideglass-reach",
      name: "Tideglass Reach",
      motif: "Sea-glass channels and alternating tide marks",
      wardenGuild: "Currentwatch Guild",
      ambientLabel: "Tideglass shell chorus",
      sigilName: "Turning Tide Sigil"
    });
  });

  it("authors Region 5 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "mastery",
      revision: "warden-bells-v1",
      label: "Warden Bells"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme("mastery")).toEqual({
      id: "bellroot-summit",
      name: "Bellroot Summit",
      motif: "Beacon bells and resonant stone",
      wardenGuild: "Chimewatch Guild",
      ambientLabel: "Bellroot dusk chorus",
      sigilName: "Last Light Sigil"
    });
    expect(ruleset).toEqual(before);
    expect(getRegionTheme("unknown")).toBeNull();
  });
});
