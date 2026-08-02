# Ticket: Warden Tactics Lab contract and deterministic drill catalog

Parent spec: [#166](https://github.com/tomnguyen103/Maze-v2/issues/166)
Ticket issue: [#167](https://github.com/tomnguyen103/Maze-v2/issues/167)
Spec: `docs/specs/echo-maze-warden-tactics-lab.md`
PR batch: E
Blocked by: none

## Slice

Define the allowlisted Tactics Lab catalog and session contract. Build fixed
scenario setup from the production game boundary, cover Patrol, Hunt, Intercept,
and all five accepted Trail Twist revisions, and expose the observed state
without leaking hidden map or answer data.

## Acceptance

- Four fixed drill cards are available in the documented order.
- Patrol, Hunt, and Intercept use the existing deterministic mode behavior.
- Trail Twist coverage includes Echo Hush, Windways, Echo Bridges, Tide Doors,
  and Warden Bells with their production ruleset revisions.
- Unknown catalog values and malformed setup are rejected.
- Restart returns to the same initial state and no session step persists.
- A full drill cannot mutate Quest, score, Journal, Profile, Records, Replay,
  access, Daily, Classroom, offline, storage, or network state.

## Verification receipt

Before implementation, record the observed failing test name and failure line
in the commit body or this ticket's closing comment. The first green receipt
must name the focused contract test and the full local test count.
