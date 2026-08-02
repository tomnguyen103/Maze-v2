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

Red receipt: the first full `npm run check` reached the Vitest gate with 161
passed / 8 skipped files and 1,417 passed / 18 skipped tests, then failed with
`Vitest expected 168 test files, received 169.` The manifest must be refreshed
to the observed 169-file / 1,435-test run before the final green receipt is
recorded.
