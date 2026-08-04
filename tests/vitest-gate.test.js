import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalGateArgs,
  assertVitestGate,
  parseVitestSummary
} from "../scripts/vitest-gate.mjs";
import { runVitest, runVitestGate } from "../scripts/run-vitest-gate.mjs";

const EXPECTED = {
  testFiles: 147,
  tests: 1324,
  skipped: 18
};

function summary(overrides = {}) {
  return {
    testFiles: 147,
    tests: 1324,
    passed: 1306,
    failed: 0,
    skipped: 18,
    ...overrides
  };
}

function reporterOutput() {
  return "Test Files  139 passed | 8 skipped (147)\nTests  1306 passed | 18 skipped (1324)";
}

/** @param {string[]} stdoutChunks @param {string[]} [stderrChunks] */
function fakeChild(stdoutChunks = [], stderrChunks = []) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter()
  });
  queueMicrotask(() => {
    for (const chunk of stdoutChunks) {
      child.stdout.emit("data", Buffer.from(chunk));
    }
    for (const chunk of stderrChunks) {
      child.stderr.emit("data", Buffer.from(chunk));
    }
    child.emit("close", 0, null);
  });
  return child;
}

describe("Vitest gate validation", () => {
  it("parses the file and test totals from Vitest's summary", () => {
    expect(
      parseVitestSummary(
        "Test Files  139 passed | 8 skipped (147)\nTests  1306 passed | 18 skipped (1324)"
      )
    ).toEqual(summary());
  });

  it("parses a summary even when the terminal injects color codes", () => {
    expect(
      parseVitestSummary(
        "\u001b[32m Test Files\u001b[0m  139 passed | 8 skipped (147)\n" +
          "\u001b[32m      Tests\u001b[0m  1306 passed | 18 skipped (1324)"
      )
    ).toEqual(summary({ tests: 1324, passed: 1306 }));
  });

  it("rejects filters and overrides on the canonical full-suite run", () => {
    expect(() => assertCanonicalGateArgs([])).not.toThrow();
    expect(() =>
      assertCanonicalGateArgs(["tests/vitest-gate.test.js"])
    ).toThrow("does not accept filters or overrides");
    expect(() =>
      assertCanonicalGateArgs(["--testNamePattern=not-a-real-test"])
    ).toThrow("does not accept filters or overrides");
  });

  it("fails when a worker exits even if Vitest reports success", () => {
    expect(() =>
      assertVitestGate({
        summary: summary(),
        output: "Worker exited unexpectedly",
        expected: EXPECTED
      })
    ).toThrow("Worker exited unexpectedly");
  });

  it("fails when the runner captures worker loss before output retention", () => {
    expect(() =>
      assertVitestGate({
        summary: summary(),
        output: "",
        expected: EXPECTED,
        workerLossDetected: true
      })
    ).toThrow("Worker exited unexpectedly");
  });

  it("fails when the run reports fewer tests than the expected manifest", () => {
    expect(() =>
      assertVitestGate({
        summary: summary({ tests: 1262, passed: 1262, skipped: 0 }),
        output: "",
        expected: EXPECTED
      })
    ).toThrow("expected 1324 tests, received 1262");
  });

  it("fails when Vitest reports any failed tests", () => {
    expect(() =>
      assertVitestGate({
        summary: summary({ failed: 1, passed: 1304 }),
        output: "",
        expected: EXPECTED
      })
    ).toThrow("Vitest reported 1 failed tests.");
  });

  it("fails when passed, failed, and skipped do not account for the total", () => {
    expect(() =>
      assertVitestGate({
        summary: summary({ passed: 1300 }),
        output: "",
        expected: EXPECTED
      })
    ).toThrow("accounted for 1318");
  });

  it("accepts a complete run with the expected file and test totals", () => {
    expect(
      assertVitestGate({ summary: summary(), output: "", expected: EXPECTED })
    ).toEqual({
      testFiles: 147,
      tests: 1324,
      passed: 1306,
      skipped: 18
    });
  });

  it("detects a worker-loss marker split across child-process chunks", async () => {
    const result = await runVitest({
      spawnProcess: () => fakeChild(["Worker exited ", "unexpectedly"]),
      writeStdout: () => {},
      writeStderr: () => {}
    });

    expect(result.workerLossDetected).toBe(true);
  });

  it("wires the package runner result through the canonical gate", async () => {
    await expect(
      runVitestGate({
        expected: EXPECTED,
        run: async () => ({
          code: 0,
          signal: null,
          output: reporterOutput(),
          workerLossDetected: true
        })
      })
    ).rejects.toThrow("Worker exited unexpectedly");
  });

  it("keeps npm test pointed at the canonical wrapper", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    );

    expect(packageJson.scripts.test).toBe("node scripts/run-vitest-gate.mjs");
  });
});

describe("skipped-count pin", () => {
  it("refuses a manifest with no `skipped` pin", () => {
    expect(() =>
      assertVitestGate({
        summary: summary(),
        output: "",
        expected: { testFiles: 147, tests: 1324 }
      })
    ).toThrow("must pin `skipped`");
  });

  it("fails when a run moves tests from executed to skipped", () => {
    expect(() =>
      assertVitestGate({
        summary: summary({ passed: 1300, skipped: 24 }),
        output: "",
        expected: EXPECTED
      })
    ).toThrow("expected 18 skipped tests, received 24");
  });

  it("lets an armed integration lane opt the pin out explicitly", () => {
    expect(
      assertVitestGate({
        summary: summary({ passed: 1324, skipped: 0 }),
        output: "",
        expected: { ...EXPECTED, skipped: null }
      })
    ).toMatchObject({ skipped: 0 });
  });

  it("keeps the manifest's `skipped` a number, not a placeholder", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../scripts/vitest-test-count.json", import.meta.url),
        "utf8"
      )
    );
    expect(typeof manifest.skipped).toBe("number");
  });
});

describe("summary parsing", () => {
  it("reads the counts when stderr interleaves into the summary line", () => {
    // Reproduces the false gate failure: a test writing to stderr landed
    // inside the summary line, so the end-of-line anchor never matched.
    const interleaved =
      "Test Files  139 passed | 8 skipped (147)stderr | leaked\n" +
      "Tests  1306 passed | 18 skipped (1324) trailing glyph";
    expect(parseVitestSummary(interleaved)).toMatchObject({
      testFiles: 147,
      tests: 1324,
      passed: 1306,
      skipped: 18
    });
  });

  it("parses the summary from stdout when stderr carries its own numbers", async () => {
    const result = await runVitest({
      spawnProcess: () => fakeChild([reporterOutput()], ["Tests  1 passed (1)"]),
      writeStdout: () => {},
      writeStderr: () => {}
    });
    expect(parseVitestSummary(result.output)).toMatchObject({ tests: 1324 });
  });
});
