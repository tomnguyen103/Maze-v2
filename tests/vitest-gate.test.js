import { describe, expect, it } from "vitest";
import {
  assertCanonicalGateArgs,
  assertVitestGate,
  parseVitestSummary
} from "../scripts/vitest-gate.mjs";

const EXPECTED = {
  testFiles: 147,
  tests: 1321
};

function summary(overrides = {}) {
  return {
    testFiles: 147,
    tests: 1321,
    passed: 1303,
    failed: 0,
    skipped: 18,
    ...overrides
  };
}

describe("Vitest gate validation", () => {
  it("parses the file and test totals from Vitest's summary", () => {
    expect(
      parseVitestSummary(
        "Test Files  139 passed | 8 skipped (147)\nTests  1303 passed | 18 skipped (1321)"
      )
    ).toEqual(summary());
  });

  it("parses a summary even when the terminal injects color codes", () => {
    expect(
      parseVitestSummary(
        "\u001b[32m Test Files\u001b[0m  139 passed | 8 skipped (147)\n" +
          "\u001b[32m      Tests\u001b[0m  1303 passed | 18 skipped (1321)"
      )
    ).toEqual(summary({ tests: 1321, passed: 1303 }));
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

  it("fails when the run reports fewer tests than the expected manifest", () => {
    expect(() =>
      assertVitestGate({
        summary: summary({ tests: 1262, passed: 1262, skipped: 0 }),
        output: "",
        expected: EXPECTED
      })
    ).toThrow("expected 1321 tests, received 1262");
  });

  it("accepts a complete run with the expected file and test totals", () => {
    expect(
      assertVitestGate({ summary: summary(), output: "", expected: EXPECTED })
    ).toEqual({
      testFiles: 147,
      tests: 1321,
      passed: 1303,
      skipped: 18
    });
  });
});
