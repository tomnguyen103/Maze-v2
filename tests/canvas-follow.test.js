import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { followOffset } from "../src/game/canvas-renderer.js";

describe("board tile floor and follow offset (B-10)", () => {
  it("gives only the play board a 24 px tile floor from the board size", () => {
    const css = readFileSync(new URL("../src/daylight.css", import.meta.url), "utf8");
    const replayCss = readFileSync(new URL("../src/game/run-replay.css", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../src/game/canvas-renderer.js", import.meta.url), "utf8");
    // The renderer publishes the size; the play board rule turns it into a min-width.
    expect(renderer).toContain('canvas.style.setProperty("--board-size"');
    const board = css.match(/#maze-canvas \{[^}]*touch-action: none;[^}]*\}/)?.[0] ?? "";
    expect(board).toContain("min-width: calc(var(--board-size, 0) * 24px);");
    // The Run Replay canvas must fit a 375 px dialog, so it has no floor.
    expect(replayCss).not.toContain("--board-size");
  });

  it("scrolls the least that brings a span into view", () => {
    // View 300 px, current offset 100: the view covers 100 to 400.
    expect(followOffset(150, 24, 100, 300)).toBe(100);
    expect(followOffset(50, 24, 100, 300)).toBe(50);
    expect(followOffset(390, 24, 100, 300)).toBe(114);
  });
});
