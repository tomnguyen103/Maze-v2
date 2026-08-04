import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * The deterministic core: the modules a Run's outcome is reproduced from.
 * `server/run-replay.js` rebuilds a Run from its seed and action log alone and
 * derives the score rather than accepting one, so anything these modules read
 * that the replay cannot also read — a clock, entropy, the runtime's collation
 * data — is a correctness defect. It surfaces as two machines disagreeing,
 * which is the hardest kind of bug to reproduce and the easiest to introduce.
 *
 * The audit's Q-16 asks for this as an ESLint rule block. A `config-protection`
 * hook refuses edits to `eslint.config.mjs`, so the same guarantee is enforced
 * here instead: `npm run check` runs the test suite, so a violation still
 * fails the gate. Move it into `eslint.config.mjs` once that hook allows it.
 */
const CORE = globSync(["src/game/**/*.js", "shared/**/*.js"], {
  cwd: root
}).map((path) => path.replaceAll("\\", "/"));

/** The single declared entropy seam, documented in the file itself. */
const ENTROPY_SEAM = "src/game/unique-id.js";

/**
 * @param {string} source
 * @param {RegExp} pattern
 * @returns {number[]} 1-indexed line numbers, comments and strings included —
 *   a false positive in a comment is cheap to reword, a missed call is not.
 */
function linesMatching(source, pattern) {
  return source
    .split(/\r?\n/)
    .map((line, index) => (pattern.test(line) ? index + 1 : 0))
    .filter(Boolean);
}

/** @param {string} relative */
function read(relative) {
  return readFileSync(root + relative, "utf8");
}

describe("the deterministic core", () => {
  it("covers the modules a Run is reproduced from", () => {
    expect(CORE).toContain("src/game/game-session.js");
    expect(CORE).toContain("shared/offline-receipt.js");
    expect(CORE.length).toBeGreaterThan(10);
  });

  it("reads no clock outside an injectable seam", () => {
    // A clock read is allowed in one shape only: the default value of a
    // parameter, which both a caller and a test can replace.
    const injectedDefault =
      /[(,]\s*\w+\s*=\s*(\(\)\s*=>\s*)?new Date\(\)|^\s*\w+\s*=\s*(\(\)\s*=>\s*)?new Date\(\),?\s*$/;
    const clockRead =
      /\bDate\.now\s*\(|\bperformance\.now\s*\(|new\s+Date\s*\(\s*\)/;
    /** @type {string[]} */
    const violations = [];
    for (const relative of CORE) {
      if (relative === ENTROPY_SEAM) continue;
      const lines = read(relative).split(/\r?\n/);
      for (const line of linesMatching(lines.join("\n"), clockRead)) {
        if (injectedDefault.test(lines[line - 1])) continue;
        violations.push(`${relative}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("reads no entropy outside the one declared seam", () => {
    /** @type {string[]} */
    const violations = [];
    for (const relative of CORE) {
      if (relative === ENTROPY_SEAM) continue;
      for (const line of linesMatching(read(relative), /\bMath\.random\s*\(/)) {
        violations.push(`${relative}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("orders by code unit, never by the runtime's collation data", () => {
    /** @type {string[]} */
    const violations = [];
    for (const relative of CORE) {
      const source = read(relative);
      for (const line of linesMatching(source, /\.localeCompare\s*\(/)) {
        violations.push(`${relative}:${line} (localeCompare)`);
      }
      for (const line of linesMatching(source, /\.toLocale[A-Za-z]*\s*\(/)) {
        violations.push(`${relative}:${line} (toLocale*)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not import the app, its surfaces, or the server", () => {
    const forbidden =
      /from\s+"\.\.\/(main\.js|admin\/|classroom\/|landing\/|learning\/|player\/)|from\s+"\.\.\/\.\.\/(server|api)\//;
    /** @type {string[]} */
    const violations = [];
    for (const relative of CORE.filter((path) =>
      path.startsWith("src/game/")
    )) {
      for (const line of linesMatching(read(relative), forbidden)) {
        violations.push(`${relative}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps `shared/` at the bottom of the stack", () => {
    /** @type {string[]} */
    const violations = [];
    for (const relative of CORE.filter((path) =>
      path.startsWith("shared/")
    )) {
      for (const line of linesMatching(read(relative), /from\s+"\.\.\//)) {
        violations.push(`${relative}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("createRun", () => {
  it("refuses a seed that normalizes to nothing instead of inventing one", async () => {
    const { createRun, normalizeSeed } = await import(
      "../src/game/game-session.js"
    );
    expect(normalizeSeed("---")).toBe("");
    expect(() => createRun("---")).toThrow("needs a seed");
    expect(() => createRun("")).toThrow("needs a seed");
  });

  it("still builds the same Labyrinth twice from one seed", async () => {
    const { createRun } = await import("../src/game/game-session.js");
    expect(createRun("ECHO-DETERMINISM").labyrinth).toEqual(
      createRun("ECHO-DETERMINISM").labyrinth
    );
  });
});

describe("compareKeys", () => {
  it("is a total order that does not depend on the runtime's locale", async () => {
    const { compareKeys } = await import("../src/game/compare-keys.js");
    expect(compareKeys("a", "a")).toBe(0);
    expect(compareKeys("a", "b")).toBe(-1);
    expect(compareKeys("b", "a")).toBe(1);
    // `localeCompare` sorts these the other way round under most locales.
    expect(compareKeys("Z", "a")).toBe(-1);
    expect([...["b", "A", "a", "B"]].sort(compareKeys)).toEqual([
      "A",
      "B",
      "a",
      "b"
    ]);
  });
});

describe("replay boundaries", () => {
  it("rejects an unusable seed through the replay error class, not a bare Error", async () => {
    const { verifyRunReplay, verifyOfflineRunReplay, ReplayInputError } =
      await import("../server/run-replay.js");
    const config = { size: 9, echoCount: 1, wardenCount: 0 };
    expect(() =>
      verifyRunReplay(
        { version: 1, actions: [] },
        {
          seed: "---",
          config,
          questionFor: () => {
            throw new Error("unreachable: the seed is refused first");
          }
        }
      )
    ).toThrow(ReplayInputError);
    expect(() =>
      verifyOfflineRunReplay(
        { version: 2, actions: [] },
        { seed: "---", config, questionForRevision: () => null }
      )
    ).toThrow(ReplayInputError);
  });

  it("rejects an unusable seed on the device-local replay too", async () => {
    const { buildRunReplayTimeline, RunReplayError } = await import(
      "../src/game/run-replay.js"
    );
    expect(() =>
      buildRunReplayTimeline({
        seed: "---",
        questLevelId: "bright-start",
        labyrinthNumber: 1,
        replay: { version: 1, actions: [] }
      })
    ).toThrow(RunReplayError);
  });
});
