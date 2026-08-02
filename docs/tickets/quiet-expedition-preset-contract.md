# Ticket: define the Quiet Expedition preset contract

Parent spec: `docs/specs/echo-maze-quiet-expedition.md`
Parent issue: [#176](https://github.com/tomnguyen103/Maze-v2/issues/176)
Ticket issue: [#177](https://github.com/tomnguyen103/Maze-v2/issues/177)
PR batch: H
Blocked by: none

## Slice

Define the pure presentation preset and its derived marker. Preserve all
existing Access Settings fields, make the preset reversible through the normal
form controls, and keep storage/server contracts unchanged.

## Acceptance

- The preset enables exactly Trail Compass, reader-friendly Question text, and
  reduced visual effects.
- Existing contrast, maze-mark, and narration-pace choices are preserved.
- Invalid settings normalize through the existing contract and do not create a
  second settings schema.
- The derived marker is true only when all three component values are true.
- Unit tests prove no Run, score, timer, Quest, Journal, or storage behavior is
  involved.

## Verification receipt

Red before implementation: `tests/quiet-expedition.test.js` failed at line 5
with `Cannot find module '../src/player/quiet-expedition.js'`. The first green
receipt must include the exact component values and the unchanged-field
assertions.
