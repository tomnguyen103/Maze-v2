import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bundle budget", () => {
  it("US-04.7 pins the game JavaScript row at 42 KB gzip", () => {
    const script = readFileSync("scripts/check-bundle-budget.mjs", "utf8");
    const row = script.slice(script.indexOf('label: "game JavaScript"'));
    expect(row.match(/maxKb: (\d+)/)?.[1]).toBe("42");
  });
});
