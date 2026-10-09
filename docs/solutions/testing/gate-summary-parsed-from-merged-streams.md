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

## The intermittent failure, now named

The status-first change above paid for itself. A later `npm run check` failed
with:

```
Vitest gate failed: Vitest exited with code 3221226505 before emitting a summary.
```

`3221226505` is `0xC0000409` — `STATUS_STACK_BUFFER_OVERRUN`, a native crash of
the Node process on Windows, not a test failure and not a parser problem. Under
the old ordering this same run reported "Vitest did not emit a complete test
summary", which is why the first investigation went looking at the parser.

It reproduces in 1 to 3 of 10 full gate runs on this workstation and passes on
the next attempt with no change.

## The trigger, and the bounded retry `[SCHEMA/TOOL]`

### Trigger

The evidence points to the `fetch` client (undici) of Node 24.15.0 on Windows.
The evidence does not prove it. Every HTTP route test sends `fetch` requests to
a loopback server. A plain Node script with no Vitest repeats one cycle 300
times: start a server, send one `fetch` POST, and close the server. That script
crashes with the same `0xC0000409` and an empty stderr.

The contrast with `node:http` is 4 of 40 against 0 of 40. A one-sided Fisher
test gives p ≈ 0.06, so that row alone is weak. The `fetch` variants in the
"Ruled out" table crash at similar rates, and that makes the case stronger.
`node:http` also uses a different llhttp build (native, not WASM), so the
contrast changes two variables.

| Variant | Native crashes |
| :-- | :-- |
| Full gate, before this change | 3 of 10 |
| HTTP route subset (15 files) | 6 of 30 |
| Plain Node repro with `fetch` | 4 of 40 |
| Plain Node repro with `node:http` `request` | 0 of 40 |
| Plain Node repro with no network (timers and CPU only) | 0 of 60 |

### Ruled out

Each row changes one variable and still crashes. So that variable is not the trigger.

| Candidate | Evidence |
| :-- | :-- |
| undici keep-alive sockets | A dispatcher with keep-alive off: 8 of 40 |
| Open server connections at close | `closeAllConnections()` before close: 11 of 40 |
| Request logs | `LOG_LEVEL=silent`: 7 of 40 |
| The dot reporter and its pipes | Crashes still occur with stdout sent to a file |
| The early 413 body-limit path | A normal 200-path cycle crashes too (4 of 20) |
| The WASM trap handler | `--disable-wasm-trap-handler`: 3 of 30 |
| The WASM compiler tier of llhttp | `--liftoff-only` 6 of 70, control 8 of 70 |
| Test isolation | `--isolate=false`: 5 of 30 |

`--pool=forks` keeps the main process alive, but the crash moves into the
worker: 10 of 30 runs report "Worker exited unexpectedly". The gate fails on
worker loss, so `forks` changes the message and not the result.

Port exhaustion contaminates a long repro loop on Windows. Thousands of
loopback connections fill the ephemeral port range with `TIME_WAIT` sockets.
`fetch` then fails with `connect ETIMEDOUT 127.0.0.1:49152` and exit code 1.
That is a JavaScript error, not the native crash. Wait for `TIME_WAIT` to drain
between batches, and count exit 1 apart from `3221226505`.

### Fix

`runVitestGate` retries a run when all three of these conditions are true:

- The exit code is `3221226505`. Node reports a signal kill as code `null`, so
  a signal never matches.
- No worker-loss marker appears.
- The output holds no summary that can be parsed.

The gate makes at most 3 attempts. Each retry prints one stderr line with the
code and the attempt number. The pass line names the retry count. When all 3
attempts crash, the gate fails with the code and the attempt count.

The gate does not retry a run that prints a summary. So a failed test, a count
mismatch, or worker loss in a complete run fails on the first run. Any other
exit code with no summary also fails on the first run.

The retry has one limit. The gate discards the output of a crashed attempt. A
flaky test can fail in that attempt and pass in the next one, and the gate then
passes. A manual re-run has the same limit. A deterministic failure fails every
attempt, so the retry does not hide it.

An armed database or object-store lane runs again on each retry. Its tests use
their own fixtures, so a second run is safe.

The fix measures this way, over 12 full gate runs on 2026-10-09:

| Measure | Result |
| :-- | :-- |
| Vitest runs that crashed natively | 5 of 17 (29%) |
| Gate runs with at least 1 retry | 4 of 12 |
| Gate runs with 2 retries (included in the row above) | 1 of 12 |
| Gate runs that failed | 0 of 12 |

The gate fails only when 3 runs in a row crash. At a 29% crash rate, that is
about 2.4% of gate runs. This number assumes that the attempts are independent.
The sample is small: the 95% interval for the crash rate is about 13% to 53%,
so the gate failure rate is between about 0.2% and 15%. Each pass line names its
retry count, so a rise in the crash rate stays visible.

### Remove the retry when

Both of these conditions are true:

1. A Node version stops the crash in the plain Node `fetch` repro. Run the
   repro loop against the new version and count `3221226505` exits. The
   result must be 0 of 40.
2. 10 full gate runs on that version show no native crash.

A version change needs an owner download, so this work did not test one. When
both conditions are true, remove the retry and the `[SCHEMA/TOOL]` label from
this section's heading.
