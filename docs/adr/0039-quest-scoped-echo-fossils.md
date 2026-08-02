# ADR 0039: Quest-scoped Echo Fossils as a reviewed Atlas memory layer

- Status: Accepted
- Date: 2026-08-01

## Context

The Echo Atlas makes Quest position visible, but a completed Labyrinth currently
leaves only coarse Run Record data and the derived Atlas landmark. The product
needs a quiet sense that an Explorer's journey mattered without adding a
currency, a collectible economy, an answer transcript, or another progress
authority.

The memory must remain safe for a child-facing game. Existing Quest Progress is
the only Quest progression source, Lantern Journal stores coarse learning
outcomes, and Run Replay is device-local and identity-scoped. Cloud Quest
Continuity already supplies the Labyrinth-boundary synchronization seam.

## Decision

- An Echo Fossil is a reviewed, immutable record created only for a terminal
  Personal Labyrinth outcome (`escaped` or `defeated`). It is keyed by a
  generated fossil ID and scoped to one Quest ID and Labyrinth Number.
- The persisted payload is limited to a schema version, Quest identity,
  Labyrinth Number, Atlas Region ID, coarse journey state, Warden outcome,
  reviewed field-note ID/text, and visual-stamp ID. The client never submits
  prompt text, selected options, Question IDs, route actions, elapsed time,
  Vitality, score, or a learner assessment.
- The Fossil catalog is bundled and reviewed. Client input selects only an
  allowlisted catalog entry from the terminal outcome and cannot author the
  note or stamp.
- The active Quest owns the collection. A new Quest ID starts an empty
  collection; fossils are not a historical archive and do not affect Quest
  Progress, Journal, Run Records, Run Replay, Run Access, or score.
- Guests retain fossils in a guest-scoped local key. An authenticated account
  uses an account-scoped local key and may migrate guest fossils once, then
  reads and unions the account's cloud collection. Cloud writes are queued
  only from the existing Labyrinth terminal boundary. Cloud reads at account
  selection restore the Atlas but never change local Quest Progress.
- The server stores account fossils in a separate row/table with forced
  account isolation and an allowlisted normalized payload. Repeated fossil IDs
  are idempotent; concurrent devices union distinct fossil IDs and never
  replace an existing reviewed record with client text.
- Export includes the normalized personal Fossil Collection. Account deletion
  removes it and verifies that no fossil rows remain. Sign-out changes the
  selected local scope so the next Explorer cannot see the previous account's
  fossils.
- If local persistence or cloud sync is unavailable, deterministic play and
  the terminal result continue. The Atlas reports that fossil memory is
  unavailable rather than inventing a stamp or blocking the Run.

## Consequences

- The Atlas can show a meaningful, reviewed memory at a completed landmark
  without becoming a second progression system.
- The collection is bounded by the current Quest and a small per-Quest cap;
  retrying the same terminal outcome is idempotent.
- Adding or revising a field note requires a new catalog revision and tests;
  old persisted fossils remain readable because their text and stamp are
  retained in the normalized reviewed payload.
- Classroom Play does not create Personal Fossils in this first slice. A
  classroom memory feature requires its own tenant and privacy review.
