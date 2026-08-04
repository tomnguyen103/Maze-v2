import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** @param {string} relative */
function source(relative) {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8"
  );
}

/**
 * oklch() to sRGB, so a token's real contrast can be asserted rather than
 * eyeballed.
 *
 * @param {number} lightness
 * @param {number} chroma
 * @param {number} hue
 * @returns {[number, number, number]}
 */
function oklchToRgb(lightness, chroma, hue) {
  const h = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (/** @type {number} */ value) => {
    const gamma =
      value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(gamma * 255)));
  };
  return [
    channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ];
}

/** @param {[number, number, number]} rgb */
function relativeLuminance([r, g, b]) {
  const [red, green, blue] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * @param {[number, number, number]} foreground
 * @param {[number, number, number]} background
 */
function contrast(foreground, background) {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background)
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** @param {string} name */
function token(name) {
  const tokens = source("tokens.css");
  const match = tokens.match(
    new RegExp(
      name + String.raw`:\s*oklch\(([\d.]+)% ([\d.]+) ([\d.]+)`
    )
  );
  if (!match) throw new Error(`${name} is not an oklch token.`);
  return oklchToRgb(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
}

describe("A11Y-06/07/08 — the pairing, not just the hue", () => {
  it("gives danger and success a weight that reads on paper", () => {
    // The fill weights measured 4.38:1 and 4.32:1 against `--color-paper`,
    // which is the surface both are actually shown on.
    for (const name of ["--color-warden-text", "--color-gate-text"]) {
      expect(contrast(token(name), token("--color-paper"))).toBeGreaterThan(4.5);
      expect(contrast(token(name), token("--color-stone"))).toBeGreaterThan(4.5);
    }
  });

  it("uses those weights where the text is", () => {
    const css = source("src/daylight.css");
    const error = css.slice(css.indexOf('.lifetime-status[data-state="error"]'));
    expect(error.slice(0, 90)).toContain("--color-warden-text");
    const success = css.slice(
      css.indexOf('.lifetime-status[data-state="success"]')
    );
    expect(success.slice(0, 140)).toContain("--color-gate-text");
  });

  it("makes the Tide Door glyph legible on its own legend", () => {
    // Electric pear on sea-glass measured 1.17:1.
    const css = source("src/daylight.css");
    const glyph = css.slice(css.indexOf(".legend-mark--tide-door::before"));
    expect(glyph.slice(0, 200)).toContain("--color-signal-deep");
    expect(
      contrast(token("--color-signal-deep"), token("--color-echo-soft"))
    ).toBeGreaterThan(4.5);
  });
});

describe("A11Y-F — focus is visible however it moved", () => {
  it("keeps a ring for script-moved focus, not only keyboard focus", () => {
    const css = source("src/daylight.css");
    expect(css).toMatch(/^:focus \{/m);
    expect(css).toMatch(/^:focus-visible \{/m);
  });

  it("lets the skip link's target take focus", () => {
    // Without `tabindex="-1"` the link moved the scroll position and left
    // focus where it was, which is the failure the probe recorded.
    expect(source("index.html")).toContain(
      '<article class="labyrinth-panel" id="labyrinth" tabindex="-1">'
    );
  });
});

describe("A11Y-02 — a held key is one action", () => {
  it("ignores OS key repeat", () => {
    const main = source("src/main.js");
    const handler = main.slice(main.indexOf('addEventListener("keydown"'));
    expect(handler.slice(0, 700)).toContain("event.repeat");
  });
});

describe("FE-UI-1 — the primary call to action stays on screen", () => {
  it("wraps the command bar rather than overflowing it", () => {
    const css = source("src/daylight.css");
    const actions = css.slice(css.indexOf(".command-bar__actions,"));
    expect(actions.slice(0, 400)).toContain("flex-wrap: wrap");
    expect(actions.slice(0, 400)).toContain("min-width: 0");
  });
});

describe("DASH-20/22/35 — the Constellation ramp reads as a ramp", () => {
  it("steps monotonically from Quiet to Bright", () => {
    const bands = ["--color-band-1", "--color-band-2", "--color-band-3"].map(
      (name) => relativeLuminance(token(name))
    );
    // Sequential, single hue, darker as the band rises. The old colours ran
    // the other way: "Bright" was darker than "Glowing".
    expect(bands[0]).toBeGreaterThan(bands[1]);
    expect(bands[1]).toBeGreaterThan(bands[2]);
  });

  it("separates the lowest band from the surface it sits on", () => {
    // Quiet used to inherit `--color-stone` exactly: 1.00:1, invisible.
    expect(token("--color-band-1")).not.toEqual(token("--color-stone"));
    expect(
      contrast(token("--color-band-1"), token("--color-stone"))
    ).toBeGreaterThan(1.05);
  });

  it("keeps the caption legible on every band", () => {
    // The caption is `--color-ink-muted`; on the old "BRIGHT" band it
    // measured 1.95:1.
    for (const name of ["--color-band-1", "--color-band-2", "--color-band-3"]) {
      expect(
        contrast(token("--color-ink-muted"), token(name))
      ).toBeGreaterThan(4.5);
      expect(contrast(token("--color-ink"), token(name))).toBeGreaterThan(4.5);
    }
  });

  it("is used by the markers rather than the old semantic fills", () => {
    const css = source("src/classroom/classroom.css");
    const markers = css.slice(css.indexOf(".classroom-constellation-marker"));
    expect(markers).toContain("--color-band-1");
    expect(markers).toContain("--color-band-2");
    expect(markers).toContain("--color-band-3");
    // `--color-gate` is success, not a magnitude.
    expect(markers.slice(0, 1200)).not.toContain("--color-gate");
  });
});
