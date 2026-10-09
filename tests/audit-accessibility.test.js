import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Generated output is not authored. Mirrors `tests/design-tokens.test.js`. */
const GENERATED = [
  "node_modules",
  "dist",
  ".vercel",
  ".git",
  "graphify-out",
  ".codegraph",
  ".ua",
  "playwright-report",
  "test-results",
  "coverage"
];

/** Every stylesheet the repo authors. */
function cssFiles() {
  return globSync("**/*.css", {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    exclude: (path) => GENERATED.some((dir) => path.split(/[\\/]/).includes(dir))
  });
}

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
    const css = source("src/game/game-dialogs.css");
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

describe("A11Y-01 — Trail Compass is discoverable before Settings is opened", () => {
  it("gives keyboard and screen-reader players a skip-link to Settings", () => {
    // The Trail Compass region is `display: none` until enabled, so nothing
    // in the accessible tree mentioned it existed unless a player already
    // knew to open Settings. A second skip-link, reachable before anything
    // else on the page, names it and points at the fix.
    const html = source("index.html");
    const skipLinks = html.slice(html.indexOf("Skip to the Labyrinth"));
    expect(skipLinks.slice(0, 250)).toContain(
      '<button class="skip-link" id="trail-compass-discover" type="button">'
    );
    expect(skipLinks.slice(0, 250)).toContain("Trail Compass");
    expect(skipLinks.slice(0, 250)).toContain("Settings");
  });

  it("wires the skip-link to the same flow as the Settings button", () => {
    const main = source("src/main.js");
    const wiring = main.slice(
      main.indexOf("elements.trailCompassDiscover.addEventListener")
    );
    expect(wiring.slice(0, 200)).toContain("elements.settingsButton.click()");
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

describe("FE-UI-2 — .primary-button has a real hit target on every tag", () => {
  it("gives the class its own geometry instead of relying on the button tag", () => {
    // The admin denial gate's only way back is `<a class="primary-button">`,
    // which measured 141x21px because the sizing rule only matched `button`.
    const css = source("src/daylight.css");
    expect(css).toMatch(/button,\s*\.primary-button\s*\{/);
    const rule = css.slice(css.search(/button,\s*\.primary-button\s*\{/));
    expect(rule.slice(0, 400)).toContain("min-height: 2.8125rem");
    expect(rule.slice(0, 400)).toContain("min-width: 2.8125rem");
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

describe("TYPE — body copy has a real 16px floor", () => {
  it("defines a named type scale instead of one compact token", () => {
    const tokens = source("tokens.css");
    expect(tokens).toContain("--text-body: 1rem;");
    expect(tokens).toContain("--text-label: 0.875rem;");
  });

  it("raises the shared dialog intro, guidance, and status text to the floor", () => {
    // These were 0.72rem-0.9rem: 133 sub-16px dialog text nodes was the
    // audit's evidence. This is the prose a player reads to understand or
    // decide something, not a badge or a mono stat readout — those keep
    // their own smaller, intentional sizes.
    //
    // Normalized to LF: most tracked files in this repo (including this
    // one) check out CRLF, but that is a checkout detail, not something
    // these anchors should depend on.
    const daylight = source("src/daylight.css").replace(/\r\n/g, "\n");
    const bodyCopySelectors = [
      ".trail-compass p {",
      ".objective-copy {",
      ".field-note {"
    ];
    for (const selector of bodyCopySelectors) {
      const rule = daylight.slice(daylight.indexOf(selector));
      const closingBrace = rule.indexOf("}");
      expect(rule.slice(0, closingBrace)).toContain("var(--text-body)");
    }

    // The game dialog rules load with the game chunk, not the shared sheet.
    const dialogs = source("src/game/game-dialogs.css").replace(/\r\n/g, "\n");
    const dialogCopySelectors = [
      ".dialog-intro,",
      ".access-settings-status {",
      ".learning-deck-picker > p {",
      ".level-dialog__note {",
      // Not just ".question-hint {" — that substring also opens inside
      // `:root[data-access-type="reader"] .question-hint {`, an unrelated
      // reader-mode override earlier in the file.
      ".question-hint {\n  width",
      // Not just ".access-settings-preset p {" — declared twice, once
      // with no font-size (margin: 0 only) before this one.
      ".access-settings-preset p {\n  color"
    ];
    for (const selector of dialogCopySelectors) {
      const rule = dialogs.slice(dialogs.indexOf(selector));
      const closingBrace = rule.indexOf("}");
      expect(rule.slice(0, closingBrace)).toContain("var(--text-body)");
    }

    // The First Light Tutorial dialog rules load with the game chunk, not the shared sheet.
    const firstLight = source("src/game/first-light.css").replace(/\r\n/g, "\n");
    for (const selector of [".first-light-route span {", ".first-light-boundary {"]) {
      const rule = firstLight.slice(firstLight.indexOf(selector));
      expect(rule.slice(0, rule.indexOf("}"))).toContain("var(--text-body)");
    }

    // `.access-setting small` is declared twice — once in a selector group
    // with no font-size, once on its own with the description copy's size —
    // so this one needs its own, more specific anchor.
    const settingSmall = dialogs.slice(
      dialogs.indexOf(".access-setting small {\n  margin-top")
    );
    expect(settingSmall.slice(0, settingSmall.indexOf("}"))).toContain(
      "var(--text-body)"
    );

    const classroom = source("src/classroom/classroom.css").replace(
      /\r\n/g,
      "\n"
    );
    // Not just ".classroom-form__status {" — that substring also opens
    // inside two earlier `[data-state="..."]` variant selectors.
    const classroomRule = classroom.slice(
      classroom.indexOf(".classroom-form__status {\n  min-height")
    );
    expect(classroomRule.slice(0, classroomRule.indexOf("}"))).toContain(
      "var(--text-body)"
    );
  });
});

/** @param {string} block @param {string} name */
function declared(block, name) {
  const line = block
    .split(/\r?\n/)
    .find((text) => text.trim().startsWith(name + ":"));
  const value = line?.match(/oklch\([^)]*\)/)?.[0];
  if (!value) throw new Error(`${name} has no oklch() value`);
  return value;
}

/** @param {string} value */
function rgbOf(value) {
  const [lightness, chroma, hue] = (value.match(/[\d.]+/g) ?? []).map(Number);
  return oklchToRgb(lightness / 100, chroma, hue);
}

/** Adopted values from the spec Palette table, light theme. */
const FIELD_JOURNAL_LIGHT = {
  "--color-paper": "oklch(97.5% 0.012 85)",
  "--color-panel": "oklch(99% 0.006 85)",
  "--color-ink": "oklch(24% 0.015 60)",
  "--color-ink-muted": "oklch(42% 0.02 60)",
  "--color-ink-faint": "oklch(50% 0.02 60)",
  "--color-signal": "oklch(78% 0.15 75)",
  "--color-signal-deep": "oklch(47% 0.11 65)",
  "--color-accent-ink": "oklch(20% 0.03 60)"
};

/** Adopted values from the spec Palette table, Night theme. */
const FIELD_JOURNAL_NIGHT = {
  "--color-paper": "oklch(19% 0.012 65)",
  "--color-panel": "oklch(23% 0.012 65)",
  "--color-ink": "oklch(94% 0.012 85)",
  "--color-ink-muted": "oklch(76% 0.015 80)",
  "--color-ink-faint": "oklch(68% 0.015 80)",
  "--color-signal": "oklch(78% 0.15 75)",
  "--color-signal-deep": "oklch(82% 0.13 80)",
  "--color-accent-ink": "oklch(20% 0.03 60)"
};

const TEXT_PAIRS = [
  ["--color-ink", "--color-paper"],
  ["--color-ink", "--color-panel"],
  ["--color-ink-muted", "--color-paper"],
  ["--color-ink-faint", "--color-paper"],
  ["--color-accent-ink", "--color-signal"],
  ["--color-signal-deep", "--color-paper"]
];

describe("US-01 — Field Journal palette tokens", () => {
  const css = source("tokens.css");
  const systemNightStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const forcedNightStart = css.indexOf(':root[data-theme="dark"]');
  const lightBlock = css.slice(0, systemNightStart);
  const systemNight = css.slice(systemNightStart, forcedNightStart);
  const forcedNight = css.slice(forcedNightStart);

  it("sets the adopted Field Journal values in light (US-01.1)", () => {
    for (const [name, value] of Object.entries(FIELD_JOURNAL_LIGHT)) {
      expect(declared(lightBlock, name), name).toBe(value);
    }
  });

  it("holds 4.5:1 for text and 3:1 for the focus ring in light and Night (US-01.2)", () => {
    for (const block of [lightBlock, systemNight, forcedNight]) {
      for (const [text, ground] of TEXT_PAIRS) {
        expect(
          contrast(rgbOf(declared(block, text)), rgbOf(declared(block, ground)))
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(
          rgbOf(declared(block, "--color-signal-deep")),
          rgbOf(declared(block, "--color-paper"))
        )
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("removes every --color-sky alias from tokens and the stylesheets (US-01.3)", () => {
    expect(css).not.toMatch(/--color-sky/);
    for (const relative of [
      "src/admin/admin.css",
      "src/classroom/classroom.css",
      "src/daylight.css",
      "src/game/game-dialogs.css",
      "src/game/quest-atlas.css",
      "src/game/run-replay.css",
      "src/learning/lantern-trail.css"
    ]) {
      expect(source(relative), relative).not.toMatch(/var\(--color-sky/);
    }
  });

  it("gives the system and forced Night blocks the same palette values (US-01.4)", () => {
    for (const [name, value] of Object.entries(FIELD_JOURNAL_NIGHT)) {
      expect(declared(systemNight, name), name).toBe(value);
      expect(declared(forcedNight, name), name).toBe(value);
    }
  });

  it("mixes colours in oklab when one side is white or hueless (US-01.5)", () => {
    const oklchMixes = cssFiles().filter((relative) =>
      /color-mix\(\s*in\s+(?:oklch|lch|hsl|hwb)\b/.test(source(relative))
    );
    expect(oklchMixes).toEqual([]);
  });

  it("holds 4.5:1 for the text on a signal-deep fill in light and Night", () => {
    for (const block of [lightBlock, systemNight, forcedNight]) {
      expect(
        contrast(
          rgbOf(declared(block, "--color-on-signal-deep")),
          rgbOf(declared(block, "--color-signal-deep"))
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never pairs a signal-deep fill with any text colour but on-signal-deep", () => {
    const offenders = [];
    for (const relative of cssFiles()) {
      for (const rule of source(relative).replace(/\r\n/g, "\n").split("}")) {
        const open = rule.lastIndexOf("{");
        const body = rule.slice(open + 1);
        const signalDeepFill =
          /(?:^|[\s;])(?:background|background-color|--fill)\s*:[^;]*var\(--color-signal-deep\)/.test(body);
        if (
          signalDeepFill &&
          /(?:^|[\s;])color\s*:/.test(body) &&
          !/(?:^|[\s;])color\s*:\s*var\(--color-on-signal-deep\)/.test(body)
        ) {
          offenders.push(`${relative}: ${rule.slice(0, open).trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Dialog and learning stylesheets that ticket 06 restyles. */
const SURFACE_SHEETS = [
  "src/daylight.css",
  "src/game/game-dialogs.css",
  "src/game/run-replay.css",
  "src/game/first-light.css",
  "src/game/daily-constellation.css",
  "src/learning/lantern-trail.css"
];

describe("US-06 — dialogs and learning surfaces use Field Journal tokens", () => {
  const css = source("tokens.css");
  const systemNightStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const forcedNightStart = css.indexOf(':root[data-theme="dark"]');
  const blocks = [
    css.slice(0, systemNightStart),
    css.slice(systemNightStart, forcedNightStart),
    css.slice(forcedNightStart)
  ];

  it("fills no pressed or selected control with signal-deep (US-06.1)", () => {
    const offenders = [];
    for (const relative of SURFACE_SHEETS) {
      for (const rule of source(relative).replace(/\r\n/g, "\n").split("}")) {
        const open = rule.lastIndexOf("{");
        if (
          /(?:^|[\s;])(?:background|background-color|--fill)\s*:[^;]*var\(--color-signal-deep\)/.test(
            rule.slice(open + 1)
          )
        ) {
          offenders.push(`${relative}: ${rule.slice(0, open).trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("holds 3:1 for the focus ring on the dialog panel in light and Night (US-06.2)", () => {
    for (const block of blocks) {
      expect(
        contrast(
          rgbOf(declared(block, "--color-focus")),
          rgbOf(declared(block, "--color-panel"))
        )
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws every dialog focus outline in the focus token (US-06.2)", () => {
    const offenders = [];
    for (const relative of SURFACE_SHEETS) {
      for (const match of source(relative).matchAll(/outline:\s*([^;]+);/g)) {
        const value = match[1];
        if (!/^(?:none|0)$|transparent/.test(value.trim()) && !value.includes("var(--color-focus)")) {
          offenders.push(`${relative}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps lifetime state text at 4.5:1 on the dialog and the offer card (US-06.3)", () => {
    for (const block of blocks) {
      for (const text of [
        "--color-ink",
        "--color-ink-muted",
        "--color-warden-text",
        "--color-gate-text"
      ]) {
        for (const ground of ["--color-panel", "--color-stone-raised", "--color-stone"]) {
          expect(
            contrast(rgbOf(declared(block, text)), rgbOf(declared(block, ground))),
            `${text} on ${ground}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps the bright and glowing Constellation tiles at 3:1 on the map ground (US-06.1)", () => {
    const ground = token("--color-night-deep");
    const signal = token("--color-signal");
    const css = source("src/game/daily-constellation.css");
    expect(css).toMatch(/\.daily-constellation__map \{[^}]*background: var\(--color-night-deep\)/);
    expect(contrast(signal, ground)).toBeGreaterThanOrEqual(3);
    // The glowing band draws at 0.62 opacity; blend it over the ground.
    const glowing = signal.map((channel, index) => 0.62 * channel + 0.38 * ground[index]);
    expect(contrast(/** @type {[number, number, number]} */ (glowing), ground)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the amber action label and the signal-deep label at 4.5:1 (US-06.2)", () => {
    for (const block of blocks) {
      for (const [text, ground] of [
        ["--color-accent-ink", "--color-signal"],
        ["--color-on-signal-deep", "--color-signal-deep"]
      ]) {
        expect(
          contrast(rgbOf(declared(block, text)), rgbOf(declared(block, ground))),
          `${text} on ${ground}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
