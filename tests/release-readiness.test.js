import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coverage = readFileSync(
  "docs/plans/implementation-coverage.md",
  "utf8"
);

/** @param {string} line */
function tableCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

describe("release readiness evidence", () => {
  it("gives every C01-C30 requirement one allowed final status", () => {
    const lines = coverage.split(/\r?\n/);
    const headerLineIndex = lines.findIndex(
      (line) =>
        line.startsWith("| ID |") && line.includes("| Final status |")
    );
    const header = tableCells(lines[headerLineIndex] ?? "");
    const statusIndex = header.indexOf("Final status");
    const rows = lines
      .slice(headerLineIndex + 2)
      .filter((line) => /^\| C\d{2} \|/.test(line))
      .slice(0, 30)
      .map(tableCells);

    expect(headerLineIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(rows.map(([id]) => id)).toEqual(
      Array.from({ length: 30 }, (_, index) =>
        `C${String(index + 1).padStart(2, "0")}`
      )
    );
    for (const row of rows) {
      expect([
        "Delivered",
        "Deferred - external approval",
        "Not applicable",
        "Pending remote-main proof"
      ]).toContain(row[statusIndex]);
    }
    expect(
      rows.find(([id]) => id === "C27")?.[statusIndex]
    ).toBe("Deferred - external approval");
  });
});
