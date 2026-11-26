import { describe, expect, it } from "vitest";
import {
  applyAction,
  createRun,
  explorerCanBeTrapped
} from "../src/game/game-session.js";
import {
  currentRunRuleset,
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeKnownRunRuleset
} from "../src/game/run-ruleset.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { mustRestartOnCurrentRuleset } from "../src/game/active-run-locator.js";

const WINDWAYS_V1 = normalizeKnownRunRuleset({
  atlasRegionId: "developing",
  revision: "windways-v1"
});

// The walk from tests/no-soft-lock.test.js US-01.3 that ends in the v1 pocket.
const TRAP_SEED = "WINDWAY-TRAP-7";

/** @param {ReturnType<typeof createRun>} run */
function walkIntoPocket(run) {
  /** @type {import("../src/game/game-session.js").Direction[]} */
  const directions = [];
  const seen = new Set([`${run.explorer.row},${run.explorer.col}`]);
  /** @type {{ run: typeof run, path: typeof directions }[]} */
  const queue = [{ run: { ...run, wardens: [] }, path: directions }];
  while (queue.length > 0) {
    const current = /** @type {(typeof queue)[number]} */ (queue.shift());
    if (explorerCanBeTrapped(current.run) && current.run.status === "active") {
      const stuck = (["up", "right", "down", "left"]).every((direction) => {
        const next = applyAction(current.run, { type: "move", direction: /** @type {any} */ (direction) });
        return next.explorer.row === current.run.explorer.row &&
          next.explorer.col === current.run.explorer.col;
      });
      if (stuck) return current.run;
    }
    for (const direction of /** @type {const} */ (["up", "right", "down", "left"])) {
      const next = applyAction(current.run, { type: "move", direction });
      const key = `${next.explorer.row},${next.explorer.col}`;
      if (next.status === "active" && !seen.has(key)) {
        seen.add(key);
        queue.push({ run: next, path: [...current.path, direction] });
      }
    }
  }
  return null;
}

describe("Legacy Windway Run recovery", () => {
  it("names a windways-v1 Run as able to trap the Explorer", () => {
    if (!WINDWAYS_V1) throw new Error("windways-v1 must stay known");
    const legacy = createRun(TRAP_SEED, {
      ...getLabyrinthConfig("bright-start", 5),
      ruleset: WINDWAYS_V1
    });
    expect(explorerCanBeTrapped(legacy)).toBe(true);

    // The recovered state in the bug report: the Explorer sits in the pocket and
    // every Move returns it to the same tile.
    const trapped = walkIntoPocket(legacy);
    expect(trapped).not.toBeNull();
    expect(explorerCanBeTrapped(/** @type {any} */ (trapped))).toBe(true);
  });

  it("names a fresh Run of each current ruleset as safe", () => {
    for (const labyrinthNumber of [1, 5, 8, 9, 13, 17, 20]) {
      const run = createRun(`SAFE-${labyrinthNumber}`, {
        ...getLabyrinthConfig("trail-scout", labyrinthNumber),
        ruleset: getQuestRunRuleset(labyrinthNumber)
      });
      expect(explorerCanBeTrapped(run)).toBe(false);
    }
  });

  it("moves a legacy ruleset to the current revision of its Atlas Region", () => {
    if (!WINDWAYS_V1) throw new Error("windways-v1 must stay known");
    expect(currentRunRuleset(WINDWAYS_V1)).toEqual(getQuestRunRuleset(5));
    expect(currentRunRuleset(getQuestRunRuleset(8))).toEqual(getQuestRunRuleset(8));
    expect(currentRunRuleset(getClassicRunRuleset(5))).toEqual(getClassicRunRuleset(5));
  });

  it("rebuilds the same seed on the current revision with no trap", () => {
    if (!WINDWAYS_V1) throw new Error("windways-v1 must stay known");
    const upgraded = createRun(TRAP_SEED, {
      ...getLabyrinthConfig("bright-start", 5),
      ruleset: currentRunRuleset(WINDWAYS_V1)
    });
    expect(upgraded.ruleset.revision).toBe("windways-v2");
    expect(explorerCanBeTrapped(upgraded)).toBe(false);
  });

  it("restarts the player's own legacy Run unless its recovered state is safe", () => {
    if (!WINDWAYS_V1) throw new Error("windways-v1 must stay known");
    const legacy = createRun(TRAP_SEED, {
      ...getLabyrinthConfig("bright-start", 5),
      ruleset: WINDWAYS_V1
    });
    const trapped = /** @type {ReturnType<typeof createRun>} */ (walkIntoPocket(legacy));
    // No recovered Run: a v1 rebuild could trap the Explorer again.
    expect(mustRestartOnCurrentRuleset(WINDWAYS_V1, null)).toBe(true);
    // The recovered Run in the bug report sits in the pocket.
    expect(mustRestartOnCurrentRuleset(WINDWAYS_V1, trapped)).toBe(true);
    // A recovered v1 Run past every Windway risk continues on v1.
    const safe = { ...trapped, windways: [] };
    expect(mustRestartOnCurrentRuleset(WINDWAYS_V1, safe)).toBe(false);
    // Current revisions and Classic Rules never restart.
    expect(mustRestartOnCurrentRuleset(getQuestRunRuleset(8), null)).toBe(false);
    expect(mustRestartOnCurrentRuleset(getClassicRunRuleset(8), trapped)).toBe(false);
  });
});
