import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coverage = readFileSync(
  "docs/plans/implementation-coverage.md",
  "utf8"
);
const releaseReadiness = readFileSync("docs/release-readiness.md", "utf8");
const sourcePlans = [
  "docs/plans/echo-maze-lifetime-membership-and-echo-atlas-master-plan.md",
  "docs/plans/entry-experience-implementation-plan.md",
  "docs/plans/echo-maze-prioritized-feature-roadmap.md",
  "docs/plans/membership-access-implementation-plan.md"
];

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
      .map(tableCells);

    expect(headerLineIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(rows).toHaveLength(30);
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

  it("records current implementation and PR/test evidence in every source plan", () => {
    for (const path of sourcePlans) {
      const plan = readFileSync(path, "utf8");

      expect(plan, path).toContain("**Implementation status (2026-07-26):**");
      expect(plan, path).toContain("PR #56");
      expect(plan, path).toMatch(/`tests\//);
    }
  });

  it("locks the test-mode decision and remote-main evidence fields", () => {
    expect(releaseReadiness).toContain(
      "**Release decision:** test-mode engineering candidate only."
    );
    expect(releaseReadiness).toContain(
      "No live charge, live Product, live Price, or"
    );
    expect(releaseReadiness).toContain("## Remote-main proof");
    expect(releaseReadiness).toMatch(/- closure PR: .+/);
    expect(releaseReadiness).toMatch(/- remote `main` commit: .+/);
  });
});
