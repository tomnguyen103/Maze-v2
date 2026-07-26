# ADR 0010: Privacy-minimized Lantern Journal continuity

- Status: Accepted
- Date: 2026-07-26

## Context

Echo Maze needs a child-safe way to show which learning objectives have been
practiced and to offer optional review outside a scored Run. The Journal must
survive ordinary browser use and authenticated play without becoming a record
of a child's exact answers or changing the deterministic game.

## Decision

The Lantern Journal stores a bounded set of coarse outcome events. Each event
contains only:

- a generated UUID-shaped event ID;
- a normalized bundled reviewed Question ID whose allowlisted metadata must
  match. Its ordinal is reduced to the eight learning-objective anchors, so it
  cannot retain a Run position or date-derived Daily ordinal;
- an allowlisted topic ID and learning-objective ID;
- one of the five established difficulty bands; and
- one coarse outcome: correct, wrong, hint, or skip.

The Journal does not store prompt text, selected-answer IDs, answer text, child
identity, timestamps, diagnoses, free-form notes, scores, vitality, timer
values, or location inside a maze. It retains at most 200 events and derives
the visible counts deterministically from those events.

Guest Journals remain local to the browser. On the first selection of an
authenticated account, the guest Journal migrates once into that account and
the guest copy is removed. Each authenticated account has its own local key and
cloud copy; one account never reads another account's local Journal. Local and
cloud copies merge by unique event ID. The client serializes sync work and
invalidates stale responses after every local mutation. The server upsert also
unions events atomically, so simultaneous devices cannot replace each other's
unique outcomes.

Clearing is immediate locally. For an authenticated account, the client also
replaces the cloud copy with an empty Journal and advances an account-scoped
clear generation. The generation is sync metadata outside every learning event;
it contains no child response, time, Run position, or learning fact. A device
whose generation is older must adopt the cleared cloud state rather than union
or upload its stale local events. If the clear cannot complete, the account
remains in a pending-clear state and retries later.

The cloud row references `player_access` with `ON DELETE CASCADE`. The signed
Clerk account-deletion transaction first takes the same per-user database lock
as account-creating writes and records a SHA-256 tombstone, then removes all
account-bound rows. The tombstone retains no raw Clerk identity and prevents an
authenticated request that was already in flight from recreating data after
deletion.

Practice is optional and uses a different bundled, reviewed Question for the
same learning objective. Practice records only another coarse Journal outcome.
It receives no mutable Run object and cannot change score, vitality, timer,
access, Quest progress, or Echo Atlas progress.

## Consequences

- Families get a readable learning summary without a transcript of child input.
- Guests keep a useful local Journal, while signed-in players get documented
  per-account continuity.
- Clearing remains trustworthy across devices and during temporary network
  failures.
- Aggregate counts can be rebuilt and tested from the bounded event set.
- Browser storage denial cannot block a deterministic Warden action; the
  Journal remains available in memory for the current tab and reports that
  device persistence is unavailable.
- Practice stays visibly and technically separate from competitive gameplay.
