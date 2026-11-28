import { describe, expect, it } from "vitest";
import { summarizeWardenMode } from "../src/game/warden-mode.js";
import { describeCompassAction } from "../src/game/trail-compass.js";
import { createRun } from "../src/game/game-session.js";

/** @param {string[]} modes */
function runWith(modes) {
  const run = createRun("compass-seed-1", { size: 9, echoCount: 3, wardenCount: 2 });
  run.wardens = modes.map((mode, id) => ({ ...run.wardens[0], id, mode: /** @type {never} */ (mode) }));
  run.event = { type: "moved", message: "Moved right." };
  return run;
}

describe("Warden mode rank (A-42)", () => {
  it("ranks Intercept above Hunt above Lured above Patrol", () => {
    expect(summarizeWardenMode(runWith([]))).toBe("cleared");
    expect(summarizeWardenMode(runWith(["patrol", "lured"]))).toBe("lured");
    expect(summarizeWardenMode(runWith(["lured", "hunt"]))).toBe("hunt");
    expect(summarizeWardenMode(runWith(["lured", "intercept"]))).toBe("intercept");
    expect(summarizeWardenMode(runWith(["hunt", "intercept"]))).toBe("intercept");
  });

  it("names the higher mode in the Trail Compass note", () => {
    expect(describeCompassAction(runWith(["lured", "hunt"]))).toContain("Warden mode: Hunt active.");
    expect(describeCompassAction(runWith(["lured", "intercept"]))).toContain("Warden mode: Intercept active.");
    expect(describeCompassAction(runWith([]))).toContain("Warden mode: Path clear.");
  });
});
