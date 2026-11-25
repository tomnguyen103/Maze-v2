# A CRLF shebang line stops Vitest from loading a script

## Problem

On a Windows checkout with `core.autocrlf=true`, the test file
`tests/classify-lifetime-purchases.test.js` failed at collection with
"SyntaxError: Invalid or unexpected token". The gate then reported two
fewer tests than `scripts/vitest-test-count.json` expects.

## What did not work

Node itself imports `scripts/classify-lifetime-purchases.mjs` without an
error, so a direct `node -e "import(...)"` check hides the defect.

## Root cause

The script starts with a `#!/usr/bin/env node` line. Git checks out the
file with CRLF line endings. A throwaway check with the Vite SSR transform
(the transform Vitest uses) shows the difference. With LF, the output keeps
the `#!` line first. With CRLF, the output puts generated code before the
`#!` line, so the `#!` line is no longer at the start of the module and
the parser rejects it. This was observed, not traced into the Vite source.

## Fix

`.gitattributes` makes `scripts/*.mjs` check out with LF on every
platform. To repair an existing checkout, strip the CR characters from
`scripts/*.mjs`; the index already holds LF, so no content changes.

## How to recognise it again

A test file fails at collection with "Invalid or unexpected token" and no
line number, on Windows only, and the module it imports starts with `#!`.
