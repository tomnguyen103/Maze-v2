# Ticket: show Echo Lens after Lantern Trail feedback

Parent spec: [#170](https://github.com/tomnguyen103/Maze-v2/issues/170)  
Ticket issue: [#172](https://github.com/tomnguyen103/Maze-v2/issues/172)  
PR batch: F  
Blocked by: #171

## Slice

Expose the optional reviewed Lens in Lantern Trail feedback and preserve the
fixed Practice sequence, with lazy rendering and an honest no-Lens state.

## Acceptance

- Lens never appears before a Practice answer is committed.
- Correct, wrong, Hint, Skip, Keep Practicing, and completion flows preserve the
  existing fixed three-required/up-to-two-optional sequence.
- Lens rendering changes no Journal event, Quest, score, Vitality, access,
  Profile, or persistent state.
- Keyboard focus, mobile layout, 200% text, and reduced-motion behavior pass.

## Verification receipt

Before implementation, record the failing Practice browser/unit test and line.
The first green receipt must name desktop and mobile Lens-after-feedback cases.
