# The database lane runner found no test files

## Problem

`npm run test:db` failed with "No test files found" on a fully configured
scratch database. The lane runner never ran a single integration test.

## What did not work

Running the same pattern by hand from a shell works, because the shell
expands `tests/*.integration.test.js` into file names before Vitest starts.
That hides the defect.

## Root cause

`scripts/run-database-lane.mjs` passes its file pattern to Vitest through
`spawn` with no shell. Nothing expands the glob. Vitest reads a CLI filter as
a substring of each test file path, not as a glob. No path contains the
literal text `tests/*.integration.test.js`, so the filter matches nothing.

## Fix

- The runner passes the substring `.integration.test.js`.
- `tests/database-lane.test.js` checks that the pattern, read as a substring,
  selects exactly the files whose names end in `.integration.test.js`.

## How to recognise it again

A Vitest filter that contains `*` and arrives through `spawn` or `execFile`
does not expand. Pass a substring or a file list instead.

## Scratch cluster grants

A fresh cluster with every migration applied still fails 7 lane files with
`permission denied for table ...`. No migration file grants the runtime login
access to the tables that the migration role owns. See
`docs/testing-database-lane.md` for the grants a scratch cluster needs.
