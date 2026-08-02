# Ticket: Echo Fossil contract, catalog, and Atlas projection

Spec: #159
PR batch: D
Blocked by: none

## Slice

Define the reviewed fossil schema and catalog, normalize/reject malformed
payloads, and extend the pure Echo Atlas projection with fossil stamps and
reviewed note data. The projection must remain read-only over Quest Progress.

## Acceptance

- Catalog covers five Regions, ordinary and Gate Warden Labyrinths, both
  terminal outcomes, and the final Quest state.
- Normalization rejects unknown fields/values and all forbidden answer, route,
  timing, vitality, score, and ability data.
- Collection is capped at 40 fossils per Quest and idempotent by fossil ID.
- Atlas nodes expose only fossils for their own completed Labyrinth.
- Unit tests cover red-to-green normalization, catalog selection, projection,
  Quest replacement, and no mutation of input progress.

## Verification receipt

Before implementation, record the observed failing test name and failure line
in the commit body or ticket comment. The first green receipt must be recorded
after the contract tests pass.

Red receipt (2026-08-02, before implementation):
`tests/echo-fossils.test.js` failed at line 2 because
`../src/game/quest-fossils.js` did not exist (`Cannot find module`).

Green receipt (2026-08-02):
`npx vitest run tests/echo-fossils.test.js tests/quest-atlas.test.js tests/quest-atlas-view.test.js`
passed: 3 files, 24 tests.
