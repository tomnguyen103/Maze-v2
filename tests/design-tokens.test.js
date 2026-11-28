import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Generated output, never authored: mirrors `eslint.config.mjs`'s ignores. */
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

/** Static design mockups: never served, ignored by `eslint.config.mjs` too. */
const MOCKUPS = "docs/design/mockups/";

/** Every stylesheet and HTML document the browser actually loads. */
const SHEETS = globSync("**/*.{css,html}", {
  cwd: root,
  exclude: (path) =>
    GENERATED.some((dir) => path.split(/[\\/]/).includes(dir)) ||
    path.replace(/\\/g, "/").startsWith(MOCKUPS)
});

describe("custom properties", () => {
  it("never reads one that is neither defined nor given a fallback", () => {
    /** @type {Set<string>} */
    const defined = new Set();
    /** @type {Map<string, Set<string>>} */
    const readWithoutFallback = new Map();

    for (const relative of SHEETS) {
      const source = readFileSync(root + relative, "utf8");
      for (const match of source.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
        defined.add(match[1]);
      }
      // `var(--x)` with no comma has no fallback: an undefined property makes
      // the whole declaration invalid at computed-value time, silently.
      for (const match of source.matchAll(
        /var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g
      )) {
        const sites = readWithoutFallback.get(match[1]) ?? new Set();
        sites.add(relative);
        readWithoutFallback.set(match[1], sites);
      }
    }

    const undefinedReads = [...readWithoutFallback]
      .filter(([property]) => !defined.has(property))
      .map(([property, sites]) => `${property} (${[...sites].join(", ")})`)
      .sort();

    expect(undefinedReads).toEqual([]);
  });

  it("keeps every property a script sets at run time fallback-guarded", () => {
    // These exist only once JS has written them, so CSS must degrade on its
    // own for the first paint and for any element the script never reaches.
    const scriptSet = [
      "--constellation-size",
      "--constellation-x",
      "--constellation-y",
      "--lens-columns",
      "--lens-position"
    ];
    /** @type {string[]} */
    const unguarded = [];
    for (const relative of SHEETS) {
      const source = readFileSync(root + relative, "utf8");
      for (const property of scriptSet) {
        const bare = new RegExp(`var\\(\\s*${property}\\s*\\)`);
        if (bare.test(source)) unguarded.push(`${property} (${relative})`);
      }
    }
    expect(unguarded).toEqual([]);
  });
});

describe("Popup identity", () => {
  // Checked-out files may use CRLF on Windows; compare LF text only.
  const read = (/** @type {string} */ relative) =>
    readFileSync(root + relative, "utf8").replace(/\r\n/g, "\n");

  /** Adopted palette values from the design.md Palette table, light then Night. */
  const PALETTE_VALUES = [
    "oklch(96.6% 0.024 85.8)",
    "oklch(98.6% 0.014 84.6)",
    "oklch(30.5% 0.07 310.3)",
    "oklch(44.3% 0.058 311.6)",
    "oklch(73.4% 0.177 137.9)",
    "oklch(75.1% 0.141 241.4)",
    "oklch(68.5% 0.206 32.5)",
    "oklch(54% 0.166 32.2)",
    "oklch(90.1% 0.106 84.7)",
    "oklch(20% 0.05 310)",
    "oklch(26% 0.055 310)",
    "oklch(95% 0.03 86)",
    "oklch(78% 0.14 32)"
  ];

  it("names Popup as the design identity in design.md", () => {
    const design = read("design.md");
    expect(design).toContain("Popup identity (ADR 0065)");
    expect(design).not.toMatch(/Pilot Chart|Journey system/);
  });

  it("keeps the Stitch project id in the design.md frontmatter", () => {
    const design = read("design.md");
    expect(design.startsWith("---\nstitch-project: 3244739478942983822\n")).toBe(true);
  });

  it("lists every adopted palette value in design.md", () => {
    const design = read("design.md");
    const missing = PALETTE_VALUES.filter((value) => !design.includes(value));
    expect(missing).toEqual([]);
  });

  it("lists invariants I1 to I7 in design.md", () => {
    const design = read("design.md");
    const missing = ["I1", "I2", "I3", "I4", "I5", "I6", "I7"].filter(
      (id) => !new RegExp(`\\|\\s*${id}\\s*\\|`).test(design)
    );
    expect(missing).toEqual([]);
  });

  it("names the adopted type families and shape limits in design.md", () => {
    const design = read("design.md");
    for (const literal of [
      "Chewy",
      "Andika",
      "Geist Mono",
      "40px",
      "16px",
      "768px"
    ]) {
      expect(design).toMatch(new RegExp(String.raw`(?<![\d.])${literal}`));
    }
  });

  it("defines Popup and the play-screen terms in GLOSSARY.md", () => {
    const glossary = read("GLOSSARY.md");
    for (const term of ["Popup", "Readout", "Action rail", "Title block", "Chart notes"]) {
      expect(glossary).toMatch(new RegExp(`\\*\\*${term}\\*\\*:`));
    }
    expect(glossary).not.toMatch(/\*\*Journey\*\*:/);
  });

  it("records the Popup ADR supersede chain (R8)", () => {
    const adr65 = read("docs/adr/0065-popup-book-replaces-pilot-chart.md");
    const adr66 = read("docs/adr/0066-popup-board-contract.md");
    expect(adr65).toContain("Supersedes ADR 0051");
    expect(adr66).toContain("Supersedes ADR 0052");
    expect(read("docs/adr/0051-pilot-chart-replaces-field-journal.md")).toMatch(
      /^- Status: .*Superseded by ADR 0065/m
    );
    expect(read("docs/adr/0052-pilot-chart-board-contract.md")).toMatch(
      /^- Status: .*Superseded by ADR 0066/m
    );
  });

  it("defines each new Popup term in GLOSSARY.md (D15)", () => {
    const glossary = read("GLOSSARY.md");
    for (const term of [
      "Pull-tab",
      "Paper card",
      "Stamp sheet",
      "Tunnel book",
      "Chart layer",
      "Fog layer"
    ]) {
      expect(glossary).toContain(`**${term}**:`);
    }
  });

  it("states the board contract in design.md (US-01.1, US-01.2)", () => {
    const design = read("design.md");
    for (const literal of [
      "Chart devices",
      "Neatline",
      "Grid reference",
      "Scale bar",
      "Ruled ledger",
      "Stamps",
      "Compass rose",
      "76rem",
      "64px",
      "Button tiers",
      "Empty state",
      "12px minimum",
      "coastline",
      "oklch(60% 0.12 140)",
      "oklch(30.5% 0.07 310.3 / 30%)",
      "oklch(30.5% 0.07 310.3 / 75%)",
      "oklch(45% 0.13 243 / 30%)",
      "with an ink outline"
    ]) {
      expect(design, literal).toContain(literal);
    }
    expect(design).not.toContain("Passage tiles: chart paper with an ink hairline");
  });

  it("defines the chart device terms in GLOSSARY.md and records ADR 0052", () => {
    const glossary = read("GLOSSARY.md");
    for (const term of ["Neatline", "Grid reference", "Coastline", "Title block"]) {
      expect(glossary).toMatch(new RegExp(`\\*\\*${term}\\*\\*:`));
    }
    const adr = read("docs/adr/0052-pilot-chart-board-contract.md");
    for (const decision of ["water passages", "3:1", "Stitch", "Menu", "trail"]) {
      expect(adr).toContain(decision);
    }
  });

  it("keeps the game-rule terms in GLOSSARY.md", () => {
    const glossary = read("GLOSSARY.md");
    for (const term of ["Labyrinth", "Warden Challenge", "Gate", "Region Hue"]) {
      expect(glossary).toMatch(new RegExp(`\\*\\*${term}\\*\\*:`));
    }
  });

  it("records the decision in ADR 0046", () => {
    const adr = read("docs/adr/0046-field-journal-replaces-island-journey.md");
    expect(adr).toContain(
      "# 0046: Replace the island Journey with the Field Journal identity"
    );
    expect(adr).toContain("- Status: Accepted");
    expect(adr).toContain("- Date: 2026-10-08");
    for (const heading of ["## Context", "## Decision", "## Consequences"]) {
      expect(adr).toContain(heading);
    }
  });
});

describe("shared base styles", () => {
  // The shared sheet draws the Popup look only. No island or rope rule remains.
  const daylight = readFileSync(root + "src/daylight.css", "utf8").replace(
    /\r\n/g,
    "\n"
  );

  /** Returns the declarations of every top-level rule for one exact selector. */
  const rules = (/** @type {string} */ selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [
      ...daylight.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, "g"))
    ]
      .map((match) => match[1])
      .join("\n");
  };

  it("draws no island, rope bridge, blob or grid ground (US-01.3)", () => {
    expect(daylight).not.toMatch(/--island\b/);
    expect(readFileSync(root + "src/looks/popup/tokens.css", "utf8")).not.toMatch(/--island\b/);
    expect(daylight).not.toMatch(/rope/i);
    expect(daylight).not.toMatch(/closest-side/);
    expect(daylight).not.toMatch(/--color-paper-grid/);
  });

  it("defines and reads no --color-paper-grid token in any stylesheet (US-01.3)", () => {
    const users = SHEETS.filter((relative) =>
      readFileSync(root + relative, "utf8").includes("--color-paper-grid")
    );
    expect(users).toEqual([]);
  });

  it("keeps every header opaque with no backdrop blur (US-05.3)", () => {
    // Only a dialog's ::backdrop may blur the page behind it. Chrome stays opaque.
    const blurred = [];
    for (const relative of SHEETS.filter((path) => path.endsWith(".css"))) {
      const css = readFileSync(root + relative, "utf8").replace(/\r\n/g, "\n");
      for (const rule of css.split("}")) {
        const open = rule.lastIndexOf("{");
        const selector = rule.slice(0, open);
        if (
          /backdrop-filter:\s*(?!none)\S/.test(rule.slice(open + 1)) &&
          !selector.includes("::backdrop")
        ) {
          blurred.push(`${relative}: ${selector.trim()}`);
        }
      }
    }
    expect(blurred).toEqual([]);
  });

  it("fills the primary button with ink, not the legacy sky-deep token (US-01.3)", () => {
    expect(rules(".primary-button")).toMatch(/--fill:\s*var\(--color-ink\);/);
    expect(rules(".primary-button")).not.toMatch(/--color-signal-deep/);
  });

  it("defines no pill radius and no drop-shadow token", () => {
    // Tags use the 4px radius and surfaces use ink rules, so these tokens have no reader.
    const found = [];
    for (const relative of SHEETS.filter((path) => path.endsWith(".css"))) {
      const css = readFileSync(root + relative, "utf8");
      for (const token of ["--radius-pill", "--shadow-panel", "--shadow-signal", "--color-shadow"]) {
        if (css.includes(token)) found.push(`${token} (${relative})`);
      }
    }
    expect(found).toEqual([]);
  });

  it("sets body text to 16px (I6)", () => {
    expect(rules("body")).toMatch(/font-size:\s*1rem/);
  });
});

describe("popup look tokens", () => {
  const read = (/** @type {string} */ look) =>
    readFileSync(root + `src/looks/${look}/tokens.css`, "utf8").replace(/\r\n/g, "\n");
  const popup = read("popup");

  it("writes every colour as oklch, outside the forced-colors block", () => {
    const outside = popup.slice(0, popup.indexOf("@media (forced-colors: active)"));
    expect(outside).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(/i);
    expect(popup.slice(outside.length)).not.toMatch(/oklch\(/);
  });

  it("keeps the two Night blocks identical", () => {
    const media = popup.slice(
      popup.indexOf("@media (prefers-color-scheme: dark)"),
      popup.indexOf(':root[data-theme="dark"]')
    );
    const forced = popup.slice(
      popup.indexOf(':root[data-theme="dark"]'),
      popup.indexOf("@media (prefers-contrast: more)")
    );
    const body = (/** @type {string} */ block) =>
      [...block.matchAll(/^\s*(--[\w-]+|color-scheme):[^;]+;/gm)].map((match) =>
        match[0].trim()
      );
    expect(body(media)).toEqual(body(forced));
    expect(body(forced).length).toBeGreaterThan(10);
  });

  it("declares a literal --color-paper in the light and both Night blocks", () => {
    expect(popup.match(/^\s*--color-paper: oklch\([^)]*\);/gm)).toHaveLength(3);
  });

  it("answers high contrast and forced colours", () => {
    expect(popup).toContain("@media (prefers-contrast: more)");
    expect(popup).toContain("@media (forced-colors: active)");
  });
});
