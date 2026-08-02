# P2.3 Class Constellation

## Contract

Class Constellation is a Teacher-only, privacy-thresholded view for one Class
Expedition. It is a constellation of the four assigned Labyrinth milestones,
not a route map. It is available only when the existing Classroom Run Grant
aggregates show at least 20 distinct Students have escaped at least one
assigned Labyrinth. A milestone is shown only after at least 5 distinct
Students have escaped that milestone.

The projection shows only the three Daily Trail Constellation density bands:
Quiet, Glowing, and Bright. It never returns or renders exact counts,
percentages, Student identity, provider identifiers, Run IDs, answer data,
timestamps, ranking, or route/action data. Below the publication gate it
returns `Paths are still forming`.

The data source is the existing terminal `classroom_run_grants` aggregate.
No raw Run Action Log is accepted, stored, or sent to a new endpoint. No new
personal table is introduced; account deletion and Membership removal keep
using the existing grant cascade. The new SQL reader is bounded to one
Teacher's selected Classroom and Expedition through the existing transaction
context and forced-RLS definer pattern.

## Acceptance criteria

- Teacher reads for one selected Expedition return only `published` and
  milestone-band fields; Students, Members of another Classroom, and direct
  unauthenticated requests receive no projection.
- 19 distinct escaped Students produce the forming state; 20 unlocks the
  publication gate; a milestone with 4 contributors stays hidden and one with
  5 is eligible.
- Band projection is relative to the busiest visible milestone and exposes no
  number or percentage. Shuffling Student identities or route-like input
  cannot change the public shape because no identity or route input is
  accepted.
- The migration reader contains no route, answer, prompt, timestamp, ranking,
  username, or provider-identity output and uses the selected Classroom and
  Teacher membership checks.
- The Teacher Classroom card has loading, forming, published, error, desktop,
  mobile, keyboard-focus, and reduced-motion-safe states. It says milestone
  bands rather than implying a replay or a child-level map.
- Unit, route, migration, RLS/privacy, and browser tests cover the contract.
- The local gate remains green: lint, typecheck, test, build, bundle, and the
  required desktop/mobile Classroom browser checks.

## Implementation decisions

1. **Source** -> existing terminal Classroom Run Grant rows, not client route
   markers. *Source: live `0021_class_expeditions.sql`; the current Class Play
   client submits only terminal outcomes.*
2. **Audience** -> Teachers for one Expedition. *Source: `Classroom` and
   `Teacher` glossary terms plus the existing `read_class_expedition_progress`
   authority boundary.*
3. **Thresholds** -> reuse Daily constants 20 and 5. *Source: ADR 0033 and
   the P2.3 roadmap row; the fixed four-milestone view has no public live
   route delta, so it does not add a separate publication snapshot.*
4. **Projection** -> four milestone bands relative to the visible peak, with
   no exact values. *Source: `shared/constellation.js` and its existing band
   projection tests.*
5. **Persistence** -> no new personal or archive table. *Source: existing
   Membership and Grant cascades plus the privacy requirement to avoid route
   reconstruction.*
6. **Release boundary** -> add migration and rollback documentation, but do
   not apply it to a live database. *Source: repository external-authority
   rules.*

## Ticket plan and verification receipts

This feature is one PR batch (A); tickets are planning units, not separate PRs.

### Ticket A1: projection and privacy contract

Blocked by: none after the spec is published.

Red receipt: the new `tests/class-constellation.test.js` assertions fail before
the projection module exists.

Green receipt: the focused projection suite passes with forming, threshold,
relative-band, and identity/route-shape cases.

### Ticket A2: bounded Teacher reader and route

Blocked by: A1.

Red receipt: the new route and migration assertions fail before the
`/constellation` path and SQL reader exist.

Green receipt: focused route and migration suites pass, including non-Teacher
and cross-Classroom denial fixtures.

### Ticket A3: Classroom presentation and release proof

Blocked by: A2.

Red receipt: the new Classroom controller and E2E assertions fail before the
Teacher card renders the forming and published states.

Green receipt: focused desktop/mobile Classroom browser checks pass; full local
gate and local review are recorded in the PR and coverage ledger.
