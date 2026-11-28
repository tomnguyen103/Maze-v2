import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { followOffset, tileFloor } from "../src/game/canvas-renderer.js";

describe("board tile floor and follow offset (B-10)", () => {
  it("gives only the play board a tile floor from the board size and device ratio", () => {
    const css = readFileSync(new URL("../src/daylight.css", import.meta.url), "utf8");
    const replayCss = readFileSync(new URL("../src/game/run-replay.css", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../src/game/canvas-renderer.js", import.meta.url), "utf8");
    // The renderer publishes the size; the play board rule turns it into a min-width.
    expect(renderer).toContain('canvas.style.setProperty("--board-size"');
    const board = css.match(/#maze-canvas \{[^}]*touch-action: none;[^}]*\}/)?.[0] ?? "";
    expect(renderer).toContain('canvas.style.setProperty("--tile-floor"');
    expect(board).toContain("min-width: calc(var(--board-size, 0) * var(--tile-floor, 24px));");
    // The Run Replay canvas must fit a 375 px dialog, so it has no floor.
    expect(replayCss).not.toMatch(/--board-size|--tile-floor/);
    // The renderer is shared with the Run Replay canvas, so it never sets a width floor itself.
    expect(renderer).not.toMatch(/style\.minWidth|style\.cssText|["']min-width["']/);
    const replayCanvas = replayCss.match(/\.run-replay-canvas \{[^}]*\}/g) ?? [];
    expect(replayCanvas.length).toBeGreaterThan(0);
    for (const block of replayCanvas) expect(block).not.toMatch(/min-width:(?!\s*0;)/);
  });

  it("gives each tile at least 48 device px and 24 px (spike decision 3)", () => {
    expect(tileFloor(1)).toBe(48);
    expect(tileFloor(1.5)).toBe(32);
    expect(tileFloor(2)).toBe(24);
    expect(tileFloor(3)).toBe(24);
  });

  it("scrolls the least that brings a span into view", () => {
    // View 300 px, current offset 100: the view covers 100 to 400.
    expect(followOffset(150, 24, 100, 300)).toBe(100);
    expect(followOffset(50, 24, 100, 300)).toBe(50);
    expect(followOffset(390, 24, 100, 300)).toBe(114);
  });
});
