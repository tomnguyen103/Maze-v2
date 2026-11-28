import { describe, expect, it } from "vitest";
import { MIN_TILE, followOffset } from "../src/game/canvas-renderer.js";

describe("board tile floor and follow offset (B-10)", () => {
  it("keeps a tile at 24 CSS px or more, so a size 15 board needs 360 px", () => {
    expect(MIN_TILE).toBe(24);
    expect(15 * MIN_TILE).toBe(360);
    // A 323 px frame content box gives 21.5 px tiles, which is under the floor.
    expect(323 / 15).toBeLessThan(MIN_TILE);
  });

  it("scrolls the least that brings a span into view", () => {
    // View 300 px, current offset 100: the view covers 100 to 400.
    expect(followOffset(150, 24, 100, 300)).toBe(100);
    expect(followOffset(50, 24, 100, 300)).toBe(50);
    expect(followOffset(390, 24, 100, 300)).toBe(114);
  });
});
