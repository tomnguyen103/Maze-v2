# The only CI failed a green run, twice, for the same reason

## Problem

`npm test` — the canonical gate, and the only CI this repository has, since
GitHub Actions are disabled — reported failure on a run in which every test
passed. Two separate defects produced it, both in how the gate reads Vitest's
output rather than in any test. The A+ audit filed the first as `Q-14`.

A third defect in the same file was the mirror image: a run in which 18 tests
never executed reported `gate passed`. That is `T-01`.

## What did not work

Retrying. The failure is input-dependent, not flaky — it reproduces whenever a
test writes to stderr while the reporter is writing its summary, which depends
on test ordering and on how the operating system interleaves two pipes.

Reading the summary more loosely also does not work on its own. The parser has
to know which stream it is reading.

## Root cause

**1. One buffer for two streams.** `runVitest` merged the child's stdout and
stderr into a single `output` string (`scripts/run-vitest-gate.mjs:63`, before
this change). Vitest writes its summary to stdout and a test's `console.error`
to stderr. Two pipes have no ordering guarantee between them, so a stderr chunk
could land inside the summary line:

```
Test Files  170 passed | 8 skipped (178)stderr | tests/admin-route.test.js
```

**2. The parser anchored on end-of-line.** `parseSummaryLine` required
`/\(\d+\)\s*$/` (`scripts/vitest-gate.mjs:67`, before this change). With
anything appended after the counts, the line no longer matched, no summary was
found, and the gate threw "Vitest did not emit a complete test summary" —
against a run that had just passed 1,500 tests.

**3. The manifest pinned totals but not `skipped`.** `assertVitestGate` checked
`testFiles`, `tests`, and that `passed + failed + skipped` accounted for the
total. Every one of those holds when a test moves from executed to skipped, so
the database and object-store lanes could go dark without the gate noticing —
and they had. `tests/classroom-rls.integration.test.js:29`, the repository's
forced-RLS cross-tenant denial assertion, executed nowhere.

The worker-loss detector had the same interleaving bug in a subtler place: one
`workerLossScanTail` was shared by both stream handlers, so a stdout tail could
be spliced onto a stderr chunk and fabricate a match.

## Fix

- `scripts/run-vitest-gate.mjs` keeps `stdout` and `stderr` in separate
  buffers and hands the parser stdout alone. Worker-loss scanning still covers
  both streams, but with one scan tail per stream.
- `scripts/vitest-gate.mjs` reads the total from the last `(N)` on the line
  instead of from end-of-line.
- `scripts/vitest-test-count.json` pins `skipped`, and `assertVitestGate`
  refuses a manifest that omits it. An armed integration lane opts the exact
  count out — arming a lane moves tests from skipped to executed — but the
  pinned number then acts as a ceiling, so nothing else can go dark.
- `npm run test:db` (`scripts/run-database-lane.mjs`) runs the lanes for real.
  It refuses to start without the environment they need and fails if a lane it
  was asked to run executed nothing. See `docs/testing-database-lane.md`.

## How to recognise it again

A gate failure whose message is about the *shape* of Vitest's output rather
than about a test — "did not emit a complete test summary", a count that is off
by exactly the size of one lane — is a parser or manifest problem, not a test
problem. Check which stream the text came from before touching a test.

## A fourth defect, found while fixing the first three

`runVitestGate` parsed the summary *before* checking the child's exit status,
so a Vitest process that died partway through — printing dots and then
nothing — was reported as "Vitest did not emit a complete test summary". That
is the symptom, not the cause, and it sent the first investigation looking at
the parser instead of at the child.

Reproduced once during this work: a `npm run check` run ended after roughly a
sixth of the suite with no summary, while `npm test` on its own passed
immediately before and after, and three further `npm run check` runs passed.
The status check now runs first (`scripts/run-vitest-gate.mjs`), so the next
occurrence names the exit code or signal instead of blaming the parser.
