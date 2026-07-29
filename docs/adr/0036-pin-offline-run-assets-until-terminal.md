# 0036: Pin offline Run assets until terminal state

- Status: Accepted
- Date: 2026-07-29

## Context

An Offline Continuity Receipt binds one deterministic ruleset and immutable
reviewed content pack. Activating a newly cached app shell or evicting old assets
mid-Run could mix engine behavior, break exact recovery, or make later server
replay disagree with the player-visible outcome. Permanently freezing updates
would create a separate security and maintenance risk.

## Decision

The active receipt pins one versioned offline cache containing the required app
shell, deterministic ruleset, reviewed Run pack, and preselected Lantern Trail.
A service worker may download a newer accepted version in the background but
must not activate it, route the active Run through it, or evict pinned assets
while that Run is non-terminal.

After terminal state and durable storage of the pending verification package,
the staged version may activate. New receipts always use the newest server-
accepted version. Reconnection never silently migrates a non-terminal Run.

The server may refuse further continuation of a version blocked for security.
On learning of that block, the client pauses the Run and preserves Active Run
Recovery; it does not reinterpret prior actions under new rules. No server block
can be learned while fully disconnected, so ADR 0034's bounded receipt window
limits that unavoidable freshness gap.

Pinned assets are deleted only when no non-terminal Run or durable pending
verification package references them.

Account-scoped pinned content is also deleted on sign-out or account deletion.
Only public shell, font, and non-account assets may remain across accounts.

## Consequences

- One offline Run sees one coherent engine and content contract.
- Updates may be delayed until a safe terminal handoff.
- Critical version blocks preserve player state but require reconnection before
  continuation.
- Cache reference counting, staged activation, eviction, rollback, storage
  pressure, and recovery across browser restarts require tests.
