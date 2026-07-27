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

`audit_events` carries two triggers that raise — `BEFORE UPDATE OR DELETE` per
row, and `BEFORE TRUNCATE` per statement, because `TRUNCATE` never fires row
triggers. `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC` states the intent for
non-owner roles; the triggers are what bind the table owner, which is the role
the application connects as.

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
`sha256(address + ':' + UTC date + ':' + REQUEST_ADDRESS_SALT)`, so addresses are not
linkable across days, following the Lantern Journal minimization precedent.

Audit rows never carry learning content. Journal writes record
`{ clearGeneration, eventCount }` only — never a Question id, learning
objective, or outcome. Score rows record the server-recalculated Run Score and
bounded Run facts, never raw client input.

## What this does not defend against

A role that can `DROP TRIGGER` — which the table owner can — can disable the
append-only guard, then rewrite rows and recompute every downstream hash. On a
single-role Neon database that is the same role the application uses, so the
honest claim is *tamper-evident against application bugs and casual editing*, not
*tamper-proof against a compromised database credential*.

Closing that gap needs infrastructure this phase does not own:

- a separate non-login owner for `audit_events`, its triggers, and
  `audit_chain_head`. The app role cannot be `INSERT`-only: `appendAudit` takes
  `SELECT ... FOR UPDATE` on `audit_chain_head` and then `UPDATE`s it, so the
  minimum grant set is `INSERT` on `audit_events` plus `SELECT, UPDATE` on
  `audit_chain_head` — and nothing on either table's triggers, which is what
  makes the owner split worth doing. A `SECURITY DEFINER` append function owned
  by that role is the tighter alternative: the app then holds `EXECUTE` on one
  function and no table privileges at all; and
- periodic chain checkpoints anchored outside the database — an HMAC or signature
  over `(max(id), row_hash)` written to a store the database role cannot reach.

Both are deployment changes rather than code changes, and the second wants the
observability sink that phase 5 introduces. Recorded here so the limitation is
explicit rather than implied.

## Consequences

- Every mutating endpoint writes exactly one row when it changes state, and none
  when the request is rejected on input, loses an optimistic conflict, or
  changes nothing. A *denial* under Run Access enforcement does change state
  (the decision is the record) and is audited as `run_access.decision`; the
  unmetered path grants nothing and writes nothing.
- Chain verification is O(rows). The script walks in batches and carries the
  last hash forward, so it stays constant-memory. Every batch and the chain-head
  read share one `REPEATABLE READ, READ ONLY` snapshot — with separate snapshots
  a normal append landing mid-walk would read as tampering.
- Verification exits 1 only for a broken chain. An operational failure exits 2,
  because "the verifier could not run" is not evidence of tampering.
- Appends set a transaction-local `lock_timeout`, so a contended chain head fails
  the audit write instead of holding a request open to the platform timeout.
- `x-forwarded-for` is honoured only when `TRUST_PROXY_HEADERS=true`. Otherwise
  the socket address is hashed, because a client can otherwise choose its own
  `ip_hash`.

  ADR 0014 folded this ADR's original `AUDIT_IP_SALT` and `AUDIT_TRUST_PROXY`
  into `REQUEST_ADDRESS_SALT` and `TRUST_PROXY_HEADERS`, and moved the hashing
  itself into `server/request-identity.js`, so audit rows and rate-limit keys
  cannot hash the same address two different ways. The salt now has a default
  derived from `DATABASE_URL`, so `ip_hash` is populated without configuration
  rather than silently `NULL`.
- The append costs one extra transaction per mutation. At this product's write
  rate that is acceptable; if it stops being acceptable, the fix is a per-actor
  chain, not a mutable log.
- Explorer Access Settings are device-local and never reach the server, so they
  have no audit call site. That is a deliberate gap, not an omission.
- The `BEFORE UPDATE` trigger means the "manually edit a row and watch
  verification fail" demo requires disabling the trigger first. Enforcement was
  preferred over demo convenience; the verifier's tamper detection is covered by
  unit tests instead.
