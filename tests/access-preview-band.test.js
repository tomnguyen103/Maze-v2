import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/game/game-dialogs.css", "utf8").replace(/\r\n/g, "\n");
const rule = css.match(/\.access-maze-preview \{([^}]*)\}/)?.[1] ?? "";

describe("Access preview band", () => {
  it("US-02.1 paints the wall sample as Land with a lip, so the Gate keeps 3:1", () => {
    expect(rule).toContain("var(--color-land)");
    expect(rule).toContain("var(--color-land-lip)");
    expect(rule).not.toContain("--color-hatch");
  });

  it("US-02.1 keeps coastline ink to a thin edge, never a fill band", () => {
    expect(rule).not.toMatch(/var\(--color-coastline\) 50% 75%/);
    expect(rule).toMatch(/var\(--color-coastline\)/);
  });

  it("US-02.1 starts each 1px coastline line on its band edge and puts the lip only on the Land band", () => {
    for (const edge of [50, 75]) {
      expect(rule).toContain(`var(--color-coastline) ${edge}% calc(${edge}% + 1px)`);
    }
    expect(rule.match(/var\(--color-coastline\)/g)).toHaveLength(2);
    expect(rule).toContain("var(--color-land) 50% 75%");
    // A tile of this width at this offset starts at (100% - width) * offset, so it spans 50% to 75%.
    const lip = rule.match(/var\(--color-land-lip\)\) ([\d.]+)% 100% \/ ([\d.]+)% [\d.]+% no-repeat/);
    const [offset, width] = [Number(lip?.[1]), Number(lip?.[2])];
    const start = ((100 - width) * offset) / 100;
    expect(start).toBeCloseTo(50, 1);
    expect(start + width).toBeCloseTo(75, 1);
  });

  it("US-03.1 draws the Pulse sample as the peeled Fog flap on the first Passage band, never the old Pulse wash", () => {
    const pulse = css.match(/\.access-preview-pulse \{([^}]*)\}/)?.[1] ?? "";
    expect(pulse).not.toContain("--color-pulse");
    expect(pulse).not.toMatch(/inset: 0/);
    expect(pulse).toContain("var(--color-fog-soft)");
    expect(pulse).toContain("var(--color-fog-edge)");
    expect(pulse).toMatch(/width: 25%/);
    // The Fog band spans 0 to 25%; a Pulse tile is charted, so the flap starts on the Passage band.
    expect(pulse).toMatch(/left: 25%/);
  });

  it("US-03.1 draws the Echo sample and the legend Echo as the canvas coral disc, never the old diamond", () => {
    const daylight = readFileSync("src/daylight.css", "utf8").replace(/\r\n/g, "\n");
    for (const [sheet, selector] of [[css, "access-preview-mark--echo"], [daylight, "legend-mark--echo"]]) {
      const body = sheet.match(new RegExp(`\\.${selector} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(body).toContain("var(--color-board-echo)");
      expect(body).toContain("var(--color-board-ink)");
      expect(body).not.toMatch(/rotate\(|var\(--color-echo\)/);
      expect(sheet).toMatch(new RegExp(`\\.${selector}::after \\{[^}]*dashed var\\(--color-board-echo-text\\)`));
    }
  });
});
