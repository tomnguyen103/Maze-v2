# Keep Quest progression outside deterministic Runs

## Status

Accepted

## Context

A Quest now spans twenty increasingly difficult Labyrinths, but a seeded Run
must still replay one exact Labyrinth. Question history must also survive
Labyrinth wins, retries, refreshes, and provider fallback so a Question never
repeats during the active Quest.

## Decision

Keep a Run as one deterministic Labyrinth attempt. A separate locally persisted
Quest Progress record owns the selected Quest Level, Labyrinth Number,
Quest-wide used map fingerprints, used Question IDs, and the next Question
ordinal. Labyrinth configuration is derived from Quest Level plus Labyrinth
Number through five four-Labyrinth Difficulty Bands. Starting or retrying a
Labyrinth creates a new seeded Run from that derived configuration and rejects
any map fingerprint already used in the Quest; winning advances Quest Progress,
while defeat preserves its Labyrinth Number.

Question providers continue to reproduce reviewed deterministic Question cards.
The client and server identify the requested Difficulty Band and Question
ordinal, and the accepted Question ID is added to Quest Progress before it is
shown. This keeps provider output outside deterministic Run generation while
making Question uniqueness a Quest-level invariant.

## Consequences

- A Run Record stores its Labyrinth Number so seed replay uses the same
  difficulty configuration rather than defaulting to Labyrinth 1.
- Vitality, Pulses, and the free Question Skip reset with each Labyrinth.
- Refreshing or reopening the game can resume the active Quest.
- Starting a new Quest deliberately replaces the previous active Quest.
- Question content must provide enough deterministic reviewed variation for a
  full twenty-Labyrinth Quest.
