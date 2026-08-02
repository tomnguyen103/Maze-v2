# Ticket: expose Quiet Expedition through the player path

Parent spec: `docs/specs/echo-maze-quiet-expedition.md`
Parent issue: [#176](https://github.com/tomnguyen103/Maze-v2/issues/176)
Ticket issue: [#178](https://github.com/tomnguyen103/Maze-v2/issues/178)
PR batch: H
Blocked by: #177

## Slice

Add the explicit Settings preset and the active-play semantic treatment. Give
Trail Compass a clear Quiet Expedition heading and explanation, keep the
existing no-Canvas-focus controls, and remove stale Compass UI when the user
turns the setting off.

## Acceptance

- Settings previews the preset without saving until the user submits the form.
- Save and cancel preserve the existing Access Settings behavior and focus
  return.
- Active Personal Play exposes the Quiet Expedition status and Trail Compass
  controls when enabled; they are hidden when disabled.
- Normal and Gate Warden Challenges, Echoes, Pulse, Trail Twists, Atlas,
  Journal, Practice, and recovery remain reachable through existing controls.
- No new Run action, status payload, network request, or durable record is
  introduced.

## Verification receipt

The pre-change characterization was the missing `#access-quiet-expedition`
control and the absent false branch in `syncTrailCompass`; both left the
requested preset/path unavailable or stale. Green receipt: focused Access
Settings tests pass (15 tests total), and
`tests/e2e/game.spec.js` — `enters Quiet Expedition without changing the
Personal Run` — passes on desktop and mobile (2/2), covering preset preview,
save, no Run-storage mutation, Compass semantics, Atlas, Journal, and
Practice.
