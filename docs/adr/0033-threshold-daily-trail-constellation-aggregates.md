# 0033: Threshold Daily Trail Constellation aggregates

- Status: Accepted
- Date: 2026-07-29

## Context

Daily Trail Constellation turns verified routes into shared route-density art.
A small cohort, exact counts, rare cells, or contribution-by-contribution
updates could make an otherwise aggregate view individually reconstructable.
Guests also lack the stable authenticated identity needed to enforce one
contribution per person and Daily Labyrinth.

## Decision

Only the first verified escape from one authenticated Explorer contributes to a
canonical UTC Daily Labyrinth. Later escapes cannot replace or subtract that
contribution. Guests may view the feature after escaping but do not contribute.

The Constellation remains in a **Paths are still forming** state until at least
20 distinct authenticated Explorers have contributed. Once eligible:

- a cell, passage, or Pulse-use marker is suppressed unless at least 5 distinct
  contributors used it;
- the player sees only **Quiet**, **Glowing**, or **Bright** density bands, never
  exact counts or percentages; and
- the published projection refreshes only after a batch contains at least 10
  additional distinct contributors, never immediately in response to one Run.

Aggregation occurs as part of successful server verification. This feature does
not retain a personal route for later replacement or subtraction and never
exposes an Explorer identifier, username, answer, score, elapsed time, or raw
Run Action Log.

The submitted Run Action Log exists only in request memory for authoritative
replay and aggregation; it is never written to storage, application logs, or
analytics. Persistence is limited to aggregate counters and a route-free
per-Explorer contribution receipt needed for first-escape deduplication. The
receipt is personal data covered by export and account deletion.

The public projection is available only for the current canonical UTC Daily
Labyrinth. Aggregate counters and contribution receipts are hard-deleted 48
hours after that Daily expires. There is no historical Constellation archive.

## Consequences

- Low-traffic Daily Labyrinths honestly show a forming state instead of a
  privacy-weak map.
- Rare route choices and single-contribution differences stay hidden.
- The public view is deliberately approximate and may lag verified play.
- Expired Constellations cannot become a route-history dataset.
- Atomic first-contribution deduplication, thresholding, and batch publication
  require concurrency and reconstruction tests.
- Cleanup, export, and account-deletion tests must prove the 48-hour boundary
  and route-free receipt contract.
