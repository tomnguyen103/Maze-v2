# 0011: Keep Explorer Access Settings device-local and presentation-only

## Status

Accepted

## Context

Echo Maze already respects browser zoom, keyboard input, visible focus, and the
operating system's reduced-motion preference. Explorers who need stronger Fog
contrast, larger maze marks, or calmer Question typography should not need to
find browser or operating-system controls before playing.

These preferences must not become hidden difficulty controls or another source
of deterministic Run state.

## Decision

- Explorer Access Settings use one versioned record in device-local storage.
- The saved fields are limited to stronger contrast, larger maze marks,
  reader-friendly Question text, and reduced visual effects.
- Defaults are the canonical `design.md` and `tokens.css` presentation.
- Checkbox changes preview immediately. Save persists the preview, Cancel
  restores the saved presentation, and Reset persists the canonical defaults.
- Stronger contrast changes only visual tokens.
- Larger marks changes only the drawing scale for Explorer, Echo, Gate, and
  Warden shapes. Canvas dimensions, tile size, hit detection, and geometry do
  not change.
- Reader-friendly type changes only Question-family font, spacing, and line
  height.
- Reduced effects forces the same short, non-spatial behavior used for reduced
  motion. The operating-system preference is honored even when the saved
  setting is off.
- Settings remain device-local. They do not enter Player Profile, Quest
  Progress, Run Records, shared links, score submissions, or server storage.
- Every control uses native labeled form elements and remains keyboard
  operable.

## Consequences

- Presentation can update during a Run without changing its outcome or replay.
- A different device starts with the locked design defaults.
- Reset is deterministic and requires no migration or network request.
- Future settings must remain presentation-only or require a separate gameplay
  decision and contract.
