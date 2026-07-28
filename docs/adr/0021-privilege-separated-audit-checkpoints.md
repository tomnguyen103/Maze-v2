# 0021: Privilege-separate audit appends and anchor signed checkpoints outside Postgres

Date: 2026-07-28

## Status

Accepted. Completes the deferred hardening described by ADR 0013.

## Context

ADR 0013 detects accidental edits, but the application database role owns the
audit tables and can drop their triggers, rewrite history, and rebuild the hash
chain. A database credential compromise therefore defeats the evidence boundary.

## Decision

Deployment uses separate migration and runtime database credentials. A
non-login audit owner owns `audit_events`, `audit_chain_head`, their sequence,
append-only triggers, and a fixed-`search_path` `SECURITY DEFINER` append
function. The runtime role receives `EXECUTE` on that function and read access
needed by the verifier, but no direct mutation or ownership privilege on audit
objects.

The append function serializes on the chain head and writes one canonical event
payload. Existing request behavior remains fail-open for audit availability:
an append failure is counted and safely logged rather than changing the
player-visible mutation's result.

A daily internal job signs `(max(id), row_hash)` with HMAC-SHA256 and writes a
versioned JSON checkpoint under a unique key in an S3-compatible bucket with
Object Lock compliance retention. Writes require a create-only precondition.
The checkpoint credential can put and read checkpoint objects but cannot delete
them or bypass retention. The database runtime role cannot reach the bucket.

The chain verifier validates the database chain, checkpoint schema, HMAC, and
anchored row/hash pair. It distinguishes a broken chain, a bad checkpoint, and
an operational inability to verify.

## Consequences

- A stolen runtime database credential can append noise but cannot rewrite or
  erase already anchored history.
- A compromised application runtime remains outside this guarantee because it
  can invoke the append function and holds checkpoint-write credentials.
- Role provisioning and Object Lock configuration are deployment gates; local
  tests use the same append and sink interfaces without creating paid resources.
- The bucket must have versioning and Object Lock enabled before the first
  checkpoint; compliance retention cannot be shortened later.
