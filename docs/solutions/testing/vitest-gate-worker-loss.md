# Vitest worker loss must fail the local gate

## Problem

The Vitest command could exit successfully after losing a worker, leaving a
partial test run looking green. The local gate therefore needed two independent
checks: an explicit worker-loss failure and a committed expected file/test
manifest. The gate implementation is in `scripts/vitest-gate.mjs:8-123`, and
the manifest is `scripts/vitest-test-count.json:1-5`.

## What did not work

The repository's original eight-worker default used Vitest's fork pool. On this
Windows workstation, a direct run with the fork pool emitted `Worker exited
unexpectedly` and reported only 1,289 passed tests while exiting nonzero. A
JSON reporter was also unsuitable for the manifest because its suite totals
included imported suites rather than the configured test-file count. The gate
now parses Vitest's human-facing summary instead, and the regression tests cover
worker loss, caller overrides, failed tests, unaccounted totals, and a short run
in `tests/vitest-gate.test.js:24-101`.

## Root cause

The unreliable boundary was the fork-pool worker fan-out on this Windows
workstation; the precise operating-system termination cause was not exposed by
Vitest. A second reliability issue was in the wrapper: listening for the child
`exit` event could race the final reporter bytes. The wrapper now waits for
`close` in `scripts/run-vitest-gate.mjs:45-50`, after stdout and stderr close.

## Fix and proof

Vitest test runs use one thread and disable file-level parallelism in
`vite.config.mjs:5-14`, while `package.json:13-14` invokes the checked-in
wrapper and provides the explicit focused path. The wrapper rejects caller
filters or overrides in `scripts/vitest-gate.mjs:12-24`; focused development
runs use `npm run test:focused -- <file or filter>`. It records worker-loss text
from each output chunk before retaining the final output tail in
`scripts/run-vitest-gate.mjs:29-35`, then rejects worker loss, failed tests,
missing summaries, unaccounted tests, and unexpected file/test totals through
`scripts/run-vitest-gate.mjs:54-64` and `scripts/vitest-gate.mjs:82-123`. Full runs on Node 22.23.1 passed with 139 passed test
files, 8 skipped files, 1,306 passed tests, 18 skipped tests, and 1,324 total
tests.
