# Ticket: Warden Tactics Lab Workshop route and accessible view

Parent spec: [#166](https://github.com/tomnguyen103/Maze-v2/issues/166)
Ticket issue: [#168](https://github.com/tomnguyen103/Maze-v2/issues/168)
Spec: `docs/specs/echo-maze-warden-tactics-lab.md`
PR batch: E
Blocked by: #167

## Slice

Add the lazy-loaded Tactics Lab destination inside Workshop. Render the fixed
drill cards and production-engine feedback in the locked Echo Maze field-guide
system, with semantic status copy and safe focus transitions.

## Acceptance

- Workshop opens the Tactics Lab without changing the existing Play, Atlas, or
  Journal routes.
- Every card can be selected, run, restarted, and exited with keyboard or
  pointer/touch input.
- The view has a readable text equivalent for every Warden mode and Trail Twist;
  color, motion, or position is never the only signal.
- Focus returns to the invoking control; 320/390/768/1440 layouts and 200%
  text do not hide actions or create page-level horizontal overflow.
- Reduced motion removes nonessential travel while preserving the same state
  and feedback.

## Verification receipt

Before implementation, record the observed failing browser/unit test and line
in the commit body or this ticket's closing comment. The first green receipt
must name the desktop/mobile browser checks.
