# 0035: Replay offline Runs before accepting cloud or shared outcomes

- Status: Accepted
- Date: 2026-07-29

## Context

A valid Offline Continuity Receipt proves that one exact Run was admitted; it
does not prove that browser-supplied terminal facts are correct. Accepting an
offline score, Quest boundary, or learning outcome directly would create a
weaker trust path than the existing server-replayed Verified Daily flow.
Regional Trail Twists also cannot be encoded by the Classic Rules-only Run
Action Log version 1 used by Verified Daily.

## Decision

An eligible offline Run records a bounded Run Action Log version 2 containing
only the deterministic actions needed to reproduce play against the
receipt-bound ruleset and reviewed content pack. Answer actions identify the
exact Reviewed Question Revision and selected option identifier; the log never
copies Question, choice, Hint, feedback, or Echo Lens text.

After reconnecting, the client submits the signed Offline Continuity Receipt,
its exact content pack identity, and the action log under one stable idempotency
key. The server validates the receipt and replays the full Run. Only a
successful replay may update Cloud Quest Progress, Lantern Journal outcomes, or
a shared score.

The local Run Record is available immediately but is labeled **Pending
verification**. Successful replay removes that label. A terminal replay
rejection preserves the local memory as **Offline—unverified** and cannot change
cloud or shared state. Transport failures remain retryable under the same
idempotency key.

The detailed local action log exists only while verification is pending. It is
a bounded, device-local verification recovery record that may survive a reload
or transport retry; it is explicitly not persistent Run Replay history. The
visible local Run Record retains only the outcome and verification label, not
the pending action log. Successful replay or terminal rejection deletes the log
immediately. After terminal play, the client may retain it for at most 48 hours
and never beyond the receipt's signed nine-day submission deadline. Missing
that deadline deletes the log and leaves only the outcome-only local Run Record
marked **Offline—unverified**. Selected option identifiers and the full route
never enter persistent Run Replay storage.

Verified Daily remains Classic Rules under Run Action Log version 1. It does not
accept regional actions or reuse the offline submission contract.

## Consequences

- A signed receipt cannot be turned into forged cloud progress or score.
- Offline personal play needs a deterministic server replay path for all five
  Trail Twists and every legal action.
- Pending and unverified labels make the trust state visible instead of erasing
  a child's local memory.
- Detailed offline integrity state cannot become permanent route or answer
  history.
- Protocol bounds, malformed actions, option identifiers, content hashes,
  idempotent retries, and visual/nonvisual action parity require tests.
