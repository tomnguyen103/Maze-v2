# 0020: Sync signed-in Explorer Access Settings without making them gameplay state

Date: 2026-07-28

## Status

Accepted. Supersedes ADR 0011 only where it says every Explorer Access Settings
record is device-local.

## Context

ADR 0011 kept presentation preferences out of deterministic Run state, but a
signed-in Explorer who changes devices loses the accessibility choices they
depend on. Synchronizing those choices must not make them a hidden difficulty
control or introduce silent cross-device merging.

## Decision

Guests keep one versioned device-local record. A signed-in Explorer keeps the
same local record as an offline cache and also has one server record with an
optimistic revision.

When no server record exists, the first signed-in device seeds it from that
device's saved settings. Once a server record exists, it wins on sign-in and is
copied into the local cache. Saves name the expected revision; a stale device
receives the current server record instead of silently overwriting or merging
four independent booleans. Reset saves the canonical defaults through the same
path.

The fields remain exactly the four presentation-only choices accepted by ADR
0011. They never enter Run, Quest, score, shared-link, or Question state.

The server record is personal data. It is included in
`echo-maze-export/2`, removed and verified by account deletion, and successful
changes are audited without recording learning content.

## Consequences

- A signed-in Explorer gets consistent presentation across devices.
- A guest incurs no account or network requirement.
- The export contract intentionally advances from version 1 to version 2.
- A temporary sync failure leaves the last local presentation active and makes
  the failed cloud save visible; it never resets accessibility choices.
