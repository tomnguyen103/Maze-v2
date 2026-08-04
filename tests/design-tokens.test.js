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
