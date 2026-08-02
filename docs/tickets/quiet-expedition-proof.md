# Ticket: prove Quiet Expedition privacy and release gates

Parent spec: `docs/specs/echo-maze-quiet-expedition.md`
Parent issue: [#176](https://github.com/tomnguyen103/Maze-v2/issues/176)
Ticket issue: [#179](https://github.com/tomnguyen103/Maze-v2/issues/179)
PR batch: H
Blocked by: #178

## Slice

Add the integrated proof for the Quiet Expedition composition and refresh the
roadmap coverage ledger and release evidence with real local/browser results.

## Acceptance

- Unit tests prove preset composition and unchanged-field behavior.
- Desktop and mobile keyboard journeys cover active Play movement, Pulse,
  Warden Challenge feedback, Atlas, Journal, Practice, and recovery.
- Reduced-motion, 200% text, narrow layout, and no-hidden-state assertions pass.
- Privacy assertions prove no answer, selected option, route, timer, profile,
  or Lens text enters durable or network state through the preset.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `npm run check:bundle` pass, with the test-count manifest refreshed.
- Local Standards/Spec and Security & Reliability reviews are clean; CodeRabbit
  completes before merge.

## Verification receipt

Red receipts: the Quiet-only run reached the Vitest gate with 161 passed / 8
skipped files and 1,417 passed / 18 skipped tests, then failed with
`Vitest expected 168 test files, received 169.` After merging the reviewed Echo
Lens pack, the combined run reached 161 passed / 8 skipped files and 1,420
passed / 18 skipped tests, then failed with `Vitest expected 1,435 tests,
received 1,438.` The tracked manifest is now refreshed to the observed
169-file / 1,438-test combined run; the final green receipt is recorded below.

Green receipt (2026-08-02, after merging PR #175):

- `npm run check`: lint and typecheck passed; Vitest reported 161 passed / 8
  skipped files and 1,420 passed / 18 skipped tests (1,438 total); build
  passed; bundle budgets passed with game JavaScript at 29.33 KB gzip / 30 KB.
- `npm run test:e2e`: 238 passed / 22 intentional skips (260 total) across
  desktop and mobile browser profiles, including Quiet Expedition, keyboard,
  reduced-motion, 200%-text, narrow-fold, semantic, privacy, and existing
  Echo Lens journeys.
- The local Standards/Spec and Security & Reliability review found no
  unresolved real findings; CodeRabbit remains the required remote PR gate.
