# 0001: Readable deterministic Warden modes

## Status

Accepted

## Context

Wardens currently follow a deterministic shortest-path rule, but their distant
movement increases separation from the Explorer. That behavior looks random to
the player and does not support the requested feeling of a thinking opponent.

Echo Maze also promises that a seed can replay the same Labyrinth. A remote AI
service, non-deterministic model, or real-time clock dependency would break that
promise and make gameplay tests unreliable.

## Decision

Each Warden exposes one of three player-readable modes:

- **Patrol**: approach an uncollected Echo or the Gate without occupying it.
- **Hunt**: follow the shortest passage path to a nearby Explorer.
- **Intercept**: follow the shortest passage path toward the Explorer's likely
  next position, inferred from the Explorer's last valid direction.

Wardens move at most one passage tile after each valid Explorer action. Their
choices remain derived from the Run seed, current Run state, and fixed tuning
thresholds. They cannot occupy an uncollected Echo or the Gate. The interface
reports the strongest active mode without revealing hidden Warden positions.

The initial Hunt and Intercept distance thresholds are tuning hypotheses. They
must be covered by deterministic behavior tests and checked during browser
playtesting before release.

## Consequences

- Warden behavior becomes more legible, tactical, and replayable.
- Seeded Runs remain deterministic and need no network or model dependency.
- The Run state gains the Explorer's last valid direction and each Warden's
  current mode.
- Difficulty can be tuned through mode thresholds without replacing the path
  selection algorithm.
- Personal Run Records rank real outcomes by time and Moves instead of adding
  an arbitrary points formula.
