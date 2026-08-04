# Vitest worker loss must fail the local gate

## Problem

The Vitest command could exit successfully after losing a worker, leaving a
partial test run looking green. The local gate therefore needed two independent
checks: an explicit worker-loss failure and a committed expected file/test
manifest. The gate implementation is in `scripts/vitest-gate.mjs:8-160`, and
the manifest is `scripts/vitest-test-count.json:1-6`.

## What did not work

The repository's original eight-worker default used Vitest's fork pool. On this
Windows workstation, a direct run with the fork pool emitted `Worker exited
unexpectedly` and reported only 1,289 passed tests while exiting nonzero. A
JSON reporter was also unsuitable for the manifest because its suite totals
included imported suites rather than the configured test-file count. The gate
now parses Vitest's human-facing summary instead, and the regression tests cover
worker loss, split child-process output, wrapper wiring, caller overrides, failed
tests, unaccounted totals, and a short run in `tests/vitest-gate.test.js:67-244`.

## Root cause

The unreliable boundary was the fork-pool worker fan-out on this Windows
workstation; the precise operating-system termination cause was not exposed by
Vitest. A second reliability issue was in the wrapper: listening for the child
`exit` event could race the final reporter bytes. The wrapper now waits for
`close` in `scripts/run-vitest-gate.mjs:83-86`, after stdout and stderr close,
and scans a rolling overlap in `scripts/run-vitest-gate.mjs:62-71` so a
worker-loss marker split across data events cannot evade detection.

## Fix and proof

Vitest test runs use one thread and disable file-level parallelism in
`vite.config.mjs:5-14`, while `package.json:13-14` invokes the checked-in
wrapper and provides the explicit focused path. The wrapper rejects caller
filters or overrides in `scripts/vitest-gate.mjs:12-24`; focused development
runs use `npm run test:focused -- <file or filter>`. It records worker-loss text
with a rolling overlap before retaining the final output tail in
`scripts/run-vitest-gate.mjs:62-71`, then rejects worker loss, failed tests,
missing summaries, unaccounted tests, and unexpected file/test totals through
the exported wrapper seam in `scripts/run-vitest-gate.mjs:98-114` and
`scripts/vitest-gate.mjs:82-123`. Full runs on Node 22.23.1
passed with 139 passed test files, 8 skipped files, 1,309 passed tests, 18
skipped tests, and 1,327 total tests after the three wrapper regression tests;
the checked-in manifest records those totals.

## Later

The gate had two more defects in the same reading path — a merged stdout/stderr
buffer and an unpinned `skipped` count. See
[the gate failing a green run](gate-summary-parsed-from-merged-streams.md).
