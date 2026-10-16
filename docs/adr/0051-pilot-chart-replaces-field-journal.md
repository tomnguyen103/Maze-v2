# 0051: Replace the Field Journal identity with the Pilot Chart

- Status: Accepted
- Date: 2026-10-15

## Context

The Field Journal identity (ADR 0046) set ivory paper, charcoal ink, and amber
actions. Play testing showed three reading problems. The live Run numbers sat
under the Title block, so the eye left the board to read them. The amber action
fill needed a hairline border to reach 3:1. Warm tints on every panel blurred
the rank between the board, the controls, and the notes.

## Decision

1. Every surface takes the Pilot Chart identity: white chart paper, black ink,
   hatched ink walls, three blue water screens, and magenta for lights only. The
   palette lives in `tokens.css` and `design.md`.
2. The play screen takes one reading order: Readout, board, Action rail, Title
   block, Chart notes. `GLOSSARY.md` defines the four terms.
3. The primary button fills with ink. The Pulse light is the only magenta
   control. Its label is accent ink at 4.5:1.
4. Type moves to Archivo for display, Atkinson Hyperlegible Next for body, and
   Geist Mono for the Readout numbers, seeds, code, and IDs.
5. Every `index.html` id, the theme storage key, the maze geometry, and the
   rulesets stay unchanged.

## Consequences

- `src/daylight.css` is a new sheet. Split sheets keep their token reads.
- `tests/audit-accessibility.test.js` and `tests/design-tokens.test.js` pin the
  palette values, the contrast pairs, and the glossary terms.
- ADR 0046 stays as history. Its test keeps its text unchanged.
- The Stitch project keeps its id. No Pilot Chart comp exists yet.
