# 0002: Persist terminal attempts and guarantee fresh Labyrinths

## Status

Accepted

## Context

Run Records currently save only successful escapes. A defeated Run disappears,
even though the domain defines a Run as ending through escape, defeat, or
restart. This makes the Records feature look broken to players who have not
escaped yet.

New run already chooses a random seed, but its small seed vocabulary allows a
collision and the interface does not guarantee that the next rendered
Labyrinth differs from the current one. Exact seed replay must still reproduce
the same Labyrinth.

## Decision

Persist terminal escape and defeat outcomes. Each Run Record stores its outcome
and collected-Echo count in addition to elapsed time, Moves, and seed. Existing
records without those fields migrate as successful escapes.

Rank successful escapes before defeats. Escapes rank by elapsed time, then
Moves. Defeats rank by collected Echoes, then elapsed time and Moves. Keep the
best outcome for a repeated seed. Manual restart and New run do not save an
abandoned Run.

New run excludes the current seed and compares the generated Labyrinth
fingerprint before presenting it. It retries with another cryptographic seed if
the candidate Labyrinth matches the current one. Direct URL seeds and Record
replay remain deterministic.

## Consequences

- Players see progress saved before their first escape.
- A quick defeat cannot outrank a successful escape.
- Legacy local Records remain readable without a destructive migration.
- New run always changes both the visible seed and the Labyrinth layout.
- Seed sharing and deterministic browser tests remain intact.
