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

Before implementation, record the failing browser/unit test that proves the
preset and active-play semantic surface are absent or stale. The first green
receipt must name desktop and mobile cases plus focus-return coverage.
