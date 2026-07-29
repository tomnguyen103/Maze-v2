// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { createCanvasRenderer } from "../src/game/canvas-renderer.js";
import { createRun } from "../src/game/game-session.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";

describe("Canvas renderer", () => {
  it("draws numbered Echo Bridge pairs through Fog", () => {
    /** @type {string[]} */
    const labels = [];
    const gradient = { addColorStop: vi.fn() };
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn((text) => labels.push(text)),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      translate: vi.fn()
    };
    const canvas = {
      getBoundingClientRect: () => ({ width: 640, height: 640 }),
      getContext: () => context,
      height: 640,
      width: 640
    };
    const run = createRun("VISIBLE-BRIDGE-PAIRS", {
      ...getLabyrinthConfig("trail-scout", 9),
      ruleset: getQuestRunRuleset(9)
    });

    createCanvasRenderer(
      /** @type {HTMLCanvasElement} */ (
        /** @type {unknown} */ (canvas)
      )
    ).render({
      ...run,
      pulseVisible: [],
      revealed: []
    });

    expect(labels).toEqual(
      run.echoBridges.map((bridge) => String(bridge.echoIndex + 1))
    );
  });

  it("draws every Tide Door and its shared visible phase through Fog", () => {
    /** @type {string[]} */
    const labels = [];
    const gradient = { addColorStop: vi.fn() };
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn((text) => labels.push(text)),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      translate: vi.fn()
    };
    const canvas = {
      getBoundingClientRect: () => ({ width: 640, height: 640 }),
      getContext: () => context,
      height: 640,
      width: 640
    };
    const run = createRun("VISIBLE-TIDE-PHASE", {
      ...getLabyrinthConfig("trail-scout", 13),
      ruleset: getQuestRunRuleset(13)
    });

    createCanvasRenderer(
      /** @type {HTMLCanvasElement} */ (
        /** @type {unknown} */ (canvas)
      )
    ).render({ ...run, pulseVisible: [], revealed: [] });

    expect(labels.filter((label) => label === "OPEN")).toHaveLength(
      run.tideDoors.length
    );
  });
});
