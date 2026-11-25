import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/game/game-dialogs.css", "utf8").replace(/\r\n/g, "\n");
const rule = css.match(/\.access-maze-preview \{([^}]*)\}/)?.[1] ?? "";

describe("Access preview band", () => {
  it("US-02.1 paints the wall sample as Land with a hatch, so the Gate keeps 3:1", () => {
    expect(rule).toContain("var(--color-land)");
    expect(rule).toContain("var(--color-hatch)");
  });

  it("US-02.1 keeps coastline ink to a thin edge, never a fill band", () => {
    expect(rule).not.toMatch(/var\(--color-coastline\) 50% 75%/);
    expect(rule).toMatch(/var\(--color-coastline\)/);
  });
});
