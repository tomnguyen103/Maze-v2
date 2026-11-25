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

  it("US-02.1 centres each coastline line on its band edge and hatches only the Land band", () => {
    for (const edge of [50, 75]) {
      expect(rule).toContain(`var(--color-coastline) calc(${edge}% - 1px) calc(${edge}% + 1px)`);
    }
    expect(rule.match(/var\(--color-coastline\)/g)).toHaveLength(2);
    expect(rule).toContain("var(--color-land) 50% 75%");
    // A tile of this width at this offset starts at (100% - width) * offset, so it spans 50% to 75%.
    const hatch = rule.match(/repeating-linear-gradient\(.*?\) ([\d.]+)% 0 \/ ([\d.]+)% 100% no-repeat/);
    const [offset, width] = [Number(hatch?.[1]), Number(hatch?.[2])];
    const start = ((100 - width) * offset) / 100;
    expect(start).toBeCloseTo(50, 1);
    expect(start + width).toBeCloseTo(75, 1);
  });
});
