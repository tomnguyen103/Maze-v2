# Intermittent Vitest worker loss during the pre-push gate

## Symptom

The pre-push hook stopped during `npm run test` after printing Vitest dots and
test stderr, but before printing the expected summary. The hook rejected the
push with `Vitest did not emit a complete test summary.` No test assertion
failure was reported.

## What did not work

- Treating the blocked push as a green test run was unsafe because the output
  was incomplete.
- Re-running the push immediately would have repeated the full hook without
  first confirming whether the test process was still failing.

## Root cause

The first pre-push invocation produced a partial Vitest child-process result on
the Windows workstation. The exact OS-level trigger was not reproducible: a
standalone `npm run test` immediately afterward completed with the expected
`166 passed | 8 skipped` file summary and `1470 passed | 18 skipped` test
summary. The successful rerun makes the evidence consistent with a transient
worker/process failure; no test assertion failure was observed, and the first
failure does not establish that no source regression was involved.

The repository intentionally runs Vitest in one thread with file parallelism
disabled because the default Windows fork pool has lost workers before
(`vite.config.mjs:24-29`). The gate reports missing or incomplete manifest
summaries at `scripts/vitest-gate.mjs:41-45` and rejects worker-loss markers
and other completeness failures at `scripts/vitest-gate.mjs:88-112`.

## Recovery

1. Stop any stalled review/test child processes that belong to this task.
2. Run `npm run test` by itself and require the complete manifest summary.
3. Re-run the full `npm run check` and then retry the normal `git push`; never
   bypass the pre-push hook.

## Verification

The recovery run completed with 166 passing test files, 8 skipped files, 1470
passing tests, and 18 skipped tests. The focused Quest II Run Record replay
browser test also passed on desktop and mobile.
