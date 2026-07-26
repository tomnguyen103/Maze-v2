# ADR 0009: Synchronize Quest Progress only at Quest boundaries

## Status

Accepted

## Context

Lifetime Membership and authenticated profiles can follow an Explorer across
devices, but Quest Progress is still device-local. Syncing a live Run would
mix network state into deterministic gameplay and would expose position,
timing, current Question, and Warden state that the product does not need.

Existing local Quest Progress already owns the bounded facts needed to resume
at the next Labyrinth and preserve Quest-wide map and Question uniqueness.
Cloud recovery must keep that contract useful offline, migrate existing local
records, and avoid silently replacing a different Quest.

## Decision

- Give every newly started Quest an opaque Quest ID. Compatible legacy local
  records receive a stable derived legacy ID when loaded.
- Store one authenticated Cloud Quest Progress record per Clerk identity with
  schema version, Quest ID, Quest Level, Labyrinth boundary, completed count,
  bounded map fingerprints, bounded reviewed Question IDs, next ordinal,
  completion state, optimistic Quest Revision, and update time.
- Never store an active Run locator, seed, Explorer position, elapsed time,
  Moves, Vitality, Pulses, Warden state, current Question, Question text,
  answers, hints, or free-form child data in Cloud Quest Progress.
- An empty cloud record accepts compatible local progress idempotently.
- Records with the same Quest ID merge monotonically: the furthest valid
  boundary wins, completion never moves backward, uniqueness sets are unioned,
  and the next Question ordinal never decreases.
- Records with different Quest IDs never merge automatically. The interface
  shows both Quest Levels and last completed boundaries and requires the
  Explorer to keep either the local or cloud Quest.
- Cloud writes use an expected Quest Revision. A stale write returns the
  current record; the client merges a same-Quest conflict and retries once, or
  asks for an explicit choice for a different Quest.
- Local Quest Progress remains the playable source. Network failures keep the
  boundary snapshot in a device-local retry queue and never block signed-out or
  offline play. Retry occurs after authentication, browser `online`, a new
  Quest choice, and a terminal Labyrinth result.
- Signing out leaves local Quest Progress on the device and stops cloud
  requests. Account deletion must delete the Clerk-keyed Cloud Quest Progress
  row through the signed Clerk `user.deleted` webhook and the transactional
  account-deletion store; it does not erase another signed-out device's local
  storage.

## Consequences

- Another authenticated browser can restore the correct next Labyrinth without
  recreating an in-progress Run.
- Same-Quest device changes preserve every remembered map and reviewed Question
  ID, so Quest-wide uniqueness survives recovery.
- A different-Quest conflict temporarily blocks automatic cloud replacement
  until the Explorer chooses one record.
- The Cloud Quest API and database migration require strict bounds,
  authorization, no-store responses, parameterized SQL, and optimistic
  conflict tests.
- Atlas regions and Sigils remain derived from Quest Progress; cloud storage
  does not add an Atlas state table.
