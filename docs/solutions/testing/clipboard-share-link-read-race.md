# Clipboard share-link reads must wait for capture

## Problem

The `origin/main` desktop/mobile browser matrix failed four existing Region
share/recovery cases with `TypeError: Invalid URL`. Each case clicked
`#seed-copy` and immediately passed the captured value to `new URL` in
`tests/e2e/game.spec.js`.

## What did not work

- Treating the click as synchronous and reading the injected clipboard value in
  the next page evaluation. The test passed when the browser happened to settle
  the write first, but that ordering was not guaranteed.
- Re-running the full suite without changing the observation point. That only
  changed scheduling and left the race intact.

## Root cause

The browser-facing contract is asynchronous: the mocked
`navigator.clipboard.writeText` resolves after setting the captured value, while
the old test read `window.__copiedShareLink` immediately after the click. An
empty value is not a valid URL, so the failure was in test synchronization, not
Region ruleset construction.

## Fix

PR #197 adds `captureClipboard` and `readCapturedClipboard` helpers that install
the mock before navigation and poll until the value matches an absolute HTTP(S)
URL (`tests/e2e/game.spec.js:620-647`). The Region cases call the setup helper
before loading the page and use the polling reader before constructing `URL`
(`tests/e2e/game.spec.js:2894-2913`, `2975-3034`, `3343-3407`, and
`3506-3628`).

## Verification

The baseline `origin/main` matrix reproduced four failures with 236 passed and
22 skipped across 262 cases. The PR branch passed the full desktop/mobile
matrix with 246 passed and 22 skipped across 268 cases.

## Transferable lesson

When a browser test observes an asynchronous side effect, synchronize on the
side effect's valid invariant rather than assuming that the initiating click
has completed it.
