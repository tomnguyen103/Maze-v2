import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bundle budget", () => {
  it("US-04.7 pins the game JavaScript row at 42 KB gzip", () => {
    const script = readFileSync("scripts/check-bundle-budget.mjs", "utf8");
    const row = script.slice(script.indexOf('label: "game JavaScript"'));
    // Read the whole literal, so a value such as 42.5 or 42e3 fails the pin.
    expect(Number(row.match(/maxKb:\s*([^\s,}]+)/)?.[1])).toBe(42);
  });
});
