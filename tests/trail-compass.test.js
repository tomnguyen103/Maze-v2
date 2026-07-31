// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  describeCompassAction,
  describeCompassState,
  describeListenTargets,
  createTrailCompass
} from "../src/game/trail-compass.js";
import { createRun, applyAction } from "../src/game/game-session.js";

/** @param {Record<string, unknown>} [input] */
function runFixture(input = {}) {
  return createRun("compass-seed-1", {
    size: 9,
    echoCount: 3,
    wardenCount: 2,
    ...input
  });
}

describe("Trail Compass descriptions", () => {
  it("describes the current tile, legal revealed exits, and resources", () => {
    const run = runFixture();
    const text = describeCompassState(run);
    expect(text).toContain(
      `row ${run.explorer.row + 1}, column ${run.explorer.col + 1}`
    );
    expect(text).toMatch(/Exits?:/);
    expect(text).toContain(`Vitality ${run.explorer.vitality}`);
    expect(text).toContain(`Pulses ${run.pulses}`);
  });

  it("never describes a Fog-hidden Echo, Warden, or Gate", () => {
    const run = runFixture();
    const revealed = new Set([...run.revealed, ...run.pulseVisible]);
    const hiddenEchoes = run.echoes.filter(
      (echo) => !revealed.has(`${echo.row},${echo.col}`)
    );
    const hiddenWardens = run.wardens.filter(
      (warden) => !revealed.has(`${warden.row},${warden.col}`)
    );
    const gateHidden = !revealed.has(`${run.gate.row},${run.gate.col}`);
    // The fixture must actually have hidden state for this test to bite.
    expect(hiddenEchoes.length + hiddenWardens.length).toBeGreaterThan(0);
    const text = describeCompassState(run);
    for (const echo of hiddenEchoes) {
      expect(text).not.toContain(
        `row ${echo.row + 1}, column ${echo.col + 1}`
      );
    }
    for (const warden of hiddenWardens) {
      expect(text).not.toContain(
        `row ${warden.row + 1}, column ${warden.col + 1}`
      );
    }
    if (gateHidden) {
      expect(text).not.toMatch(/Gate/);
    }
    expect(describeListenTargets(run).every((target) =>
      ["echo", "gate", "warden"].includes(target.kind)
    )).toBe(true);
    for (const target of describeListenTargets(run)) {
      expect(revealed.has(target.key)).toBe(true);
    }
  });

  it("describes each Trail Twist state without leaking hidden geometry", () => {
    for (const [atlasRegionId, revision] of [
      ["foundation", "echo-hush-v1"],
      ["developing", "windways-v1"],
      ["capable", "echo-bridges-v1"],
      ["advanced", "tide-doors-v1"],
      ["mastery", "warden-bells-v1"]
    ]) {
      const run = runFixture({
        ruleset: { atlasRegionId, revision }
      });
      const text = describeCompassState(run);
      expect(typeof text).toBe("string");
      if (revision === "tide-doors-v1" && run.tideDoors.length > 0) {
        expect(text).toMatch(/Tide Doors/);
      }
      if (revision === "echo-hush-v1") {
        expect(text).toMatch(/Echo Hush/);
      }
    }
  });

  it("summarizes one action result in one concise status", () => {
    const run = runFixture();
    const moved = applyAction(run, { type: "move", direction: "right" });
    const status = describeCompassAction(moved);
    expect(typeof status).toBe("string");
    expect(status.length).toBeGreaterThan(0);
    expect(status.length).toBeLessThan(240);
    expect(status.split("\n")).toHaveLength(1);
  });
});

describe("Trail Compass controller", () => {
  it("describes on demand, listens on demand, and dispatches no Run action", async () => {
    document.body.innerHTML = `
      <div id="trail-compass" hidden>
        <button id="compass-describe" type="button">Describe Trail</button>
        <button id="compass-listen" type="button">Listen</button>
      </div>
    `;
    let run = runFixture();
    const announce = vi.fn();
    const playCue = vi.fn();
    const compass = createTrailCompass({
      getRun: () => run,
      announce,
      playCue
    });
    expect(document.getElementById("trail-compass")?.hidden).toBe(false);

    document.getElementById("compass-describe")?.click();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(String(announce.mock.calls[0][0])).toContain("row");

    // Tones follow revealed entities and an explicit Listen press, never the
    // press alone and never automatically. Nothing is revealed in this Run, so
    // Listen says so and still plays nothing. Asserted as an exact absence:
    // `toBeGreaterThanOrEqual(0)` could not have failed either way.
    expect(playCue).not.toHaveBeenCalled();
    document.getElementById("compass-listen")?.click();
    expect(announce).toHaveBeenCalledTimes(2);
    expect(String(announce.mock.calls[1][0])).toContain("Nothing revealed");
    expect(playCue).not.toHaveBeenCalled();

    const before = JSON.stringify(run);
    compass.onTransition(run);
    expect(JSON.stringify(run)).toBe(before);
    expect(announce).toHaveBeenCalledTimes(3);
  });
});
