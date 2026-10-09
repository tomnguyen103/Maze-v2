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

/** Every stylesheet and HTML document the browser actually loads. */
const SHEETS = globSync("**/*.{css,html}", {
  cwd: root,
  exclude: (path) => GENERATED.some((dir) => path.split(/[\\/]/).includes(dir))
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

describe("Field Journal identity", () => {
  // Checked-out files may use CRLF on Windows; compare LF text only.
  const read = (relative) =>
    readFileSync(root + relative, "utf8").replace(/\r\n/g, "\n");

  /** Adopted palette values from the spec Palette table, light then Night. */
  const PALETTE_VALUES = [
    "oklch(97.5% 0.012 85)",
    "oklch(99% 0.006 85)",
    "oklch(24% 0.015 60)",
    "oklch(42% 0.02 60)",
    "oklch(78% 0.15 75)",
    "oklch(20% 0.03 60)",
    "oklch(47% 0.11 65)",
    "oklch(19% 0.012 65)",
    "oklch(23% 0.012 65)",
    "oklch(94% 0.012 85)",
    "oklch(76% 0.015 80)",
    "oklch(82% 0.13 80)"
  ];

  it("names Field Journal as the design identity in design.md", () => {
    const design = read("design.md");
    expect(design).toContain("Field Journal");
    expect(design).not.toMatch(/Journey system/);
  });

  it("keeps the Stitch project id in the design.md frontmatter", () => {
    const design = read("design.md");
    expect(design.startsWith("---\nstitch-project: 3244739478942983822\n---")).toBe(
      true
    );
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
      "Bricolage Grotesque",
      "Geist Mono",
      "40px",
      "16px",
      "768px"
    ]) {
      expect(design).toContain(literal);
    }
  });

  it("defines Field Journal and no longer defines Journey in GLOSSARY.md", () => {
    const glossary = read("GLOSSARY.md");
    expect(glossary).toMatch(/\*\*Field Journal\*\*:/);
    expect(glossary).not.toMatch(/\*\*Journey\*\*:/);
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
