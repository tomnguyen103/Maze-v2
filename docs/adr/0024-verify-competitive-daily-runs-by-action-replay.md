# 0024: Verify competitive Daily Runs by bounded action replay

## Status

Accepted

## Context

ADR 0005 intentionally made the Global Scoreboard casual because bounded
browser-supplied Run facts can still be fabricated. ADR 0012 therefore kept the
Daily Shared Labyrinth local and non-competitive until the server could verify
gameplay. A competitive Daily board must preserve deterministic Runs, the
reviewed Question boundary, Guest play, and every Daily isolation rule without
claiming that ordinary Score Entries have become cheat-resistant.

## Decision

Version 1 introduces a bounded Run Action Log and a pure server replay boundary
around the existing `createRun` and `applyAction` rules. Each ordered entry
contains one allowed state-changing player action plus cumulative Run elapsed
time. Version 1 allows successful Moves, Pulses, Question answers, and Question
Skips. It excludes browser-only presentation, pause, restart, Hint visibility,
provider responses, claimed outcomes, and claimed score facts.

The server owns the accepted Run contract. For a verified Daily submission it
derives the current UTC Daily contract, reconstructs the Run from the canonical
seed and allowed configuration, injects the canonical bundled reviewed Question
sequence, and replays every action. The browser may repeat contract and terminal
facts so mismatches can be diagnosed, but none are authoritative. Unknown,
malformed, impossible, no-op, out-of-order, post-terminal, incomplete,
non-escaped, or divergent submissions are rejected.

Replay input is limited to 64 KiB, 1,024 actions, and four hours of monotonic
cumulative Run time. These are protocol limits, not gameplay tuning. A later
format needs a new version and explicit compatibility decision.

The existing `/api/scores` and Global Scoreboard remain the versioned casual
compatibility path. They continue accepting the bounded ADR 0005 facts and are
never labelled verified. Verified Daily submission and board reads use a
separate Daily route hosted by an existing Vercel function. Signed-out Explorers
can still play and keep a device-local Daily Personal Best, but cannot create a
Verified Daily Entry.

PostgreSQL retains at most one best Verified Daily Entry per Explorer per UTC
date. A higher derived Run Score replaces a lower one; equal score replaces only
when it uses fewer Moves. Ranking is Run Score descending, Moves ascending,
earlier server verification ascending, then a private stable identifier for a
total order. Elapsed time is replayed and validated but is not a competitive
tie-breaker because an offline browser clock is not server-authoritative.
Public results expose only rank, username, Run Score, and Moves.

The accepted submission date is the server's current UTC date. Expired,
future, mismatched, or altered Daily contracts are rejected. Repeating one
idempotency key returns the existing result. A different key may improve the
same Explorer's best entry but cannot create a second ranked row.

## Compatibility, migration, and rollback

The database change is additive: a separate verified-Daily table leaves Player
Profiles, Score Entries, Classroom scores, Quest Progress, Run Access, Run
Records, Daily Personal Bests, and existing exports unchanged. Repository
migration files may be authored and tested here; applying them to a live
database remains an external operational action.

Rolling back the application removes the new routes and interface while leaving
the additive table inert. The casual Global Scoreboard remains available
throughout rollout. The table should not be dropped during an application
rollback because doing so would destroy verified results.

## Consequences

- Competitive Daily claims have a server-derived gameplay basis without
  duplicating the deterministic Run engine.
- The same Daily maze and reviewed Question order remain reproducible offline.
- Daily play still cannot consume Run Access or alter Quest, Atlas, demo,
  Personal Record, cosmetic, Classroom, or ordinary Global Scoreboard state.
- Generated or database-overlaid Questions remain outside deterministic replay;
  ordinary Score Entries therefore remain explicitly casual.
- Streaks, rewards, scarce cosmetics, and historical Daily boards remain
  separate product decisions.
