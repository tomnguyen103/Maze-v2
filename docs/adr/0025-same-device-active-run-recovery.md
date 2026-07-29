# 0025: Recover one active Run on the same device

- Status: Accepted
- Date: 2026-07-28

Exact Active Run Recovery uses one bounded, versioned, device-local recovery
record and reconstructs state through the canonical Run rules. The record may
temporarily retain the normalized reviewed-card content originally accepted for
an unresolved active Challenge. Later editing or unpublishing cannot replace
that Question during recovery, and no provider is contacted to substitute it.
Once a Challenge resolves, its Question, choices, Hint, and selected option are
compacted into a response-free outcome entry plus only the feedback needed to
reconstruct current presentation. The snapshot cannot serve future Runs or
Practice. The recovery record never becomes Quest Continuity, Journal history,
analytics, personal-data export, a Run Record, or cross-device state, and it is
removed after escape, defeat, or explicit restart.

Elapsed time freezes at the last durable gameplay checkpoint while the
application is closed. A recovered Run opens paused and begins counting again
only after the Explorer explicitly continues. “Exact” recovery covers every
supported state-changing action committed to the durable recovery checkpoint;
it does not cover an arbitrary future mutation without a recovery
representation. Abrupt process termination cannot guarantee persistence of an
in-flight action or render-frame timer increment.

Corrupt, incompatible, or divergent recovery fails safely instead of creating
a second recovery engine. This trade-off accepts bounded ephemeral local answer
outcomes and unresolved reviewed-card snapshots so recovery can be exact rather
than merely rebuilding the same Labyrinth; selected answer identifiers do not
survive a resolved Challenge, and Verified Daily Run Action Log version 1
remains unchanged.
