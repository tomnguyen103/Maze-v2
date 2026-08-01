import { stripVTControlCharacters } from "node:util";

const WORKER_LOSS_PATTERN = /worker exited unexpectedly/i;

/**
 * @param {string} output
 */
export function containsWorkerLoss(output) {
  return WORKER_LOSS_PATTERN.test(stripVTControlCharacters(output));
}

/**
 * Keep `npm test` as an unfilterable full-suite gate. Focused development runs
 * use `npm run test:focused -- <file or filter>` instead.
 *
 * @param {string[]} args
 */
export function assertCanonicalGateArgs(args) {
  if (args.length > 0) {
    throw new Error(
      "The canonical Vitest gate does not accept filters or overrides. Use `npm run test:focused -- <file or filter>` for a focused run."
    );
  }
}

/**
 * @typedef {Object} VitestSummary
 * @property {number} testFiles
 * @property {number} tests
 * @property {number} passed
 * @property {number} failed
 * @property {number} skipped
 */

/**
 * Parse the stable summary emitted by Vitest's dot reporter.
 *
 * @param {string} output
 * @returns {VitestSummary}
 */
export function parseVitestSummary(output) {
  const files = parseSummaryLine(output, "Test Files");
  const tests = parseSummaryLine(output, "Tests");
  if (!files || !tests) {
    throw new Error("Vitest did not emit a complete test summary.");
  }
  return {
    testFiles: files.total,
    tests: tests.total,
    passed: tests.passed,
    failed: tests.failed,
    skipped: tests.skipped
  };
}

/**
 * @param {string} output
 * @param {string} label
 */
function parseSummaryLine(output, label) {
  const lines = stripVTControlCharacters(output)
    .split(/\r?\n/)
    .filter(
      (candidate) =>
        candidate.trim().startsWith(label) && /\(\d+\)\s*$/.test(candidate)
    );
  const line = lines.at(-1);
  if (!line) return null;
  const total = line.match(/\((\d+)\)\s*$/)?.[1];
  if (!total) return null;
  return {
    total: Number(total),
    passed: Number(line.match(/(\d+) passed/)?.[1] ?? 0),
    failed: Number(line.match(/(\d+) failed/)?.[1] ?? 0),
    skipped: Number(line.match(/(\d+) skipped/)?.[1] ?? 0)
  };
}

/**
 * @param {{ summary: VitestSummary, output: string, expected: { testFiles: number, tests: number }, workerLossDetected?: boolean }} input
 */
export function assertVitestGate({
  summary,
  output,
  expected,
  workerLossDetected = false
}) {
  if (workerLossDetected || containsWorkerLoss(output)) {
    throw new Error(
      "Vitest Worker exited unexpectedly; the test gate cannot trust this run."
    );
  }

  if (summary.failed !== 0) {
    throw new Error(`Vitest reported ${summary.failed} failed tests.`);
  }

  if (summary.testFiles !== expected.testFiles) {
    throw new Error(
      `Vitest expected ${expected.testFiles} test files, received ${summary.testFiles}.`
    );
  }

  if (summary.tests !== expected.tests) {
    throw new Error(
      `Vitest expected ${expected.tests} tests, received ${summary.tests}.`
    );
  }

  const accountedTests = summary.passed + summary.failed + summary.skipped;
  if (accountedTests !== summary.tests) {
    throw new Error(
      `Vitest reported ${summary.tests} total tests but accounted for ${accountedTests} (passed ${summary.passed}, failed ${summary.failed}, skipped ${summary.skipped}).`
    );
  }

  return {
    testFiles: summary.testFiles,
    tests: summary.tests,
    passed: summary.passed,
    skipped: summary.skipped
  };
}
