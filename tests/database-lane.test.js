import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertLaneExecuted,
  AUDIT_SINK_LANE_ENV,
  DATABASE_LANE_ENV,
  missingEnv,
  planDatabaseLane
} from "../scripts/run-database-lane.mjs";

const FULL_DATABASE_ENV = {
  RUN_DATABASE_INTEGRATION: "1",
  DATABASE_URL: "postgres://runtime@localhost/echo_maze",
  DATABASE_ADMIN_URL: "postgres://owner@localhost/echo_maze"
};

describe("database lane planning", () => {
  it("runs the PostgreSQL lanes when the whole environment is present", () => {
    expect(planDatabaseLane(FULL_DATABASE_ENV)).toEqual({
      patterns: ["tests/*.integration.test.js"],
      problems: []
    });
  });

  it("refuses to start when nothing is configured, rather than passing empty", () => {
    const { patterns, problems } = planDatabaseLane({});
    expect(patterns).toEqual([]);
    expect(problems.join(" ")).toContain("Nothing to run");
  });

  it("names what is missing when the environment is half configured", () => {
    const { patterns, problems } = planDatabaseLane({
      RUN_DATABASE_INTEGRATION: "1",
      DATABASE_URL: "postgres://runtime@localhost/echo_maze"
    });
    expect(patterns).toEqual([]);
    expect(problems.join(" ")).toContain("DATABASE_ADMIN_URL");
  });

  it("names what is missing when only part of the object-store lane is set", () => {
    const { problems } = planDatabaseLane({
      ...FULL_DATABASE_ENV,
      RUN_AUDIT_SINK_INTEGRATION: "1"
    });
    expect(problems.join(" ")).toContain("AUDIT_CHECKPOINT_TEST_BUCKET");
  });

  it("can run the object-store lane on its own", () => {
    const sinkOnly = Object.fromEntries(
      Object.keys(AUDIT_SINK_LANE_ENV).map((name) => [name, "set"])
    );
    expect(planDatabaseLane(sinkOnly)).toEqual({
      patterns: ["tests/audit-checkpoint-s3.integration.test.js"],
      problems: []
    });
  });

  it("treats an empty string as absent", () => {
    expect(missingEnv({ DATABASE_URL: "" }, DATABASE_LANE_ENV)).toContain(
      "DATABASE_URL"
    );
    expect(Object.keys(AUDIT_SINK_LANE_ENV)).toContain(
      "AUDIT_CHECKPOINT_TEST_BUCKET"
    );
  });
});

/** @param {string} tests */
function reporterOutput(tests) {
  return `Test Files  8 passed (8)\n${tests}`;
}

describe("database lane execution", () => {
  it("fails when every test in the lane was skipped", () => {
    expect(() =>
      assertLaneExecuted(reporterOutput("Tests  0 passed | 18 skipped (18)"))
    ).toThrow("No test in the database lane executed");
  });

  it("passes when the lane actually ran", () => {
    expect(assertLaneExecuted(reporterOutput("Tests  18 passed (18)"))).toEqual({
      passed: 18
    });
  });

  it("fails loudly when Vitest emitted no summary at all", () => {
    expect(() => assertLaneExecuted("")).toThrow("did not emit a test summary");
  });
});

describe("the documented operator command", () => {
  it("matches the script the runbook tells an operator to run", async () => {
    const [packageJson, runbook] = await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8").then(
        JSON.parse
      ),
      readFile(
        new URL("../docs/testing-database-lane.md", import.meta.url),
        "utf8"
      )
    ]);
    expect(packageJson.scripts["test:db"]).toBe(
      "node scripts/run-database-lane.mjs"
    );
    expect(runbook).toContain("npm run test:db");
    for (const name of [
      ...Object.keys(DATABASE_LANE_ENV),
      ...Object.keys(AUDIT_SINK_LANE_ENV)
    ]) {
      expect(runbook).toContain(name);
    }
  });
});
