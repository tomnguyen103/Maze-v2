# 13. Tamper-evident audit log

Date: 2026-07-26

## Status

Accepted

## Context

Every mutating endpoint changed player-visible state with no durable record of
who changed what. Support questions ("why did this account lose Run Access?")
and monetization disputes ("was this Lifetime Membership refunded?") could only
be answered by reading current rows, which say nothing about history.

An audit log that can be edited answers nothing either. On a single Postgres
instance the app role owns its tables, so "append-only" has to be enforced by
the schema rather than assumed from convention.

## Decision

One global hash chain in `audit_events`. Each row stores `prev_hash` and
`row_hash`, where `row_hash = sha256(prev_hash || canonical-json(fields))` over
a fixed field set with stable key order. Editing, deleting, or reordering any
row makes `scripts/verify-audit-chain.mjs` fail and names the first broken id.

Appends serialize on `SELECT ... FOR UPDATE` against a one-row
`audit_chain_head` table. Two concurrent writers cannot read the same chain
head, so the chain stays linear without a table-wide lock.

`audit_events` also carries a `BEFORE UPDATE OR DELETE` trigger that raises,
plus `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC`. The trigger holds even
for the table owner, which is what the application connects as.

`recordAudit` never throws into a request path. A failed append is logged
through the `safe-error-log` redaction convention, and the running failure total
ships on every failure line, so a silent audit gap is visible in logs instead of
the request failing.

`action` and `resource_type` are unconstrained text. A CHECK on the action name
would silently drop rows for any future action, which is exactly the failure the
log exists to prevent. `prev_hash`, `row_hash`, and `ip_hash` do carry hex
CHECKs, because those values are machine-generated and a malformed one means the
chain is already wrong.

Actors are Clerk user ids for human actions and reserved ids for everything
else: `system`, `system:bootstrap`, `webhook:stripe`, `webhook:clerk`.

## Privacy

No raw IP address is stored. `ip_hash` is
`sha256(address + ':' + UTC date + ':' + AUDIT_IP_SALT)`, so addresses are not
linkable across days, following the Lantern Journal minimization precedent.

Audit rows never carry learning content. Journal writes record
`{ clearGeneration, eventCount }` only — never a Question id, learning
objective, or outcome. Score rows record the server-recalculated Run Score and
bounded Run facts, never raw client input.

## Consequences

- Every mutating endpoint writes exactly one row when it changes state, and none
  when the request is rejected on input, loses an optimistic conflict, or
  changes nothing. A *denial* under Run Access enforcement does change state
  (the decision is the record) and is audited as `run_access.decision`; the
  unmetered path grants nothing and writes nothing.
- Chain verification is O(rows). The script walks in batches and carries the
  last hash forward, so it stays constant-memory.
- The append costs one extra transaction per mutation. At this product's write
  rate that is acceptable; if it stops being acceptable, the fix is a per-actor
  chain, not a mutable log.
- Explorer Access Settings are device-local and never reach the server, so they
  have no audit call site. That is a deliberate gap, not an omission.
- The `BEFORE UPDATE` trigger means the "manually edit a row and watch
  verification fail" demo requires disabling the trigger first. Enforcement was
  preferred over demo convenience; the verifier's tamper detection is covered by
  unit tests instead.
