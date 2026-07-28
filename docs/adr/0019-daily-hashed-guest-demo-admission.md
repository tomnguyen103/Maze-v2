# 19. Daily hashed guest demo admission

Date: 2026-07-27

## Status

Accepted

## Context

The guest demo grants one complete Run before asking the Explorer to create an
account. ADR 0006 deliberately kept that boundary in browser storage. Clearing
the site data therefore minted another guest Run forever, while signed-in Run
Access had already become server-authoritative in ADR 0007.

An anonymous Explorer has no durable account id. A durable fingerprint would
strengthen enforcement but would contradict the child-focused privacy posture.
ADR 0014 already established the narrower identity primitive this app accepts:
a daily rotating, salted address hash, with the raw address never stored.

## Decision

`POST /api/access/guest-runs` admits at most one unique guest Run per daily
address hash. It uses the existing `rate_limit_counters` table rather than a new
identity table:

- one locked counter row records whether that daily hash spent its guest Run;
- one opaque marker records the admitted decision for a hashed
  `(daily address hash, Run id)` pair;
- the raw address and raw Run id never reach Postgres;
- retrying the same Run id returns the first decision, so a lost response does
  not consume a second Run or block the admitted Run on reload.

Blocked Run ids create no marker or audit row: after the daily allowance is
spent, the locked bucket already determines every later denial. This prevents
an anonymous caller from creating unbounded durable rows by minting Run ids.
The one admitted decision is audited after the counter transaction, without a
raw address or raw Run id; audit delivery retains ADR 0013's documented
best-effort failure behavior.

The client asks this route before starting an anonymous Quest Run whenever
`GET /api/access/config` advertises guest enforcement. Clearing browser storage
then creates a different Run id, but the server's daily counter still blocks it.
The device-local marker remains as the immediate UX gate and offline floor.

The route fails open when Postgres is unavailable or no address can be hashed.
Rate limiting and anonymous entitlement enforcement must not become a global
outage that strands a child at the Maze entrance. Product events distinguish
metered decisions from this degraded path.

Daily rotation is intentional. It prevents the app from turning a network
address into a long-lived anonymous identity. The tradeoff is that the same
household can receive another guest Run on a later UTC day, and Explorers behind
one shared address share that day's guest allowance.

Daily play is outside this entitlement. The UTC Daily remains a separate,
device-local casual mode as decided by ADR 0012.

## Consequences

- Clearing `localStorage` no longer mints unlimited same-day guest Runs.
- The server stores only salted daily hashes and opaque decision markers.
- A shared household, school, VPN, or carrier address shares one daily guest
  allowance. Account creation moves each Explorer to account-scoped Run Access.
- Address-salt rotation resets the anonymous boundary, matching the same
  operational consequence already documented for ADR 0014 rate limits.
- `rate_limit_counters` pruning removes both expired guest buckets and decision
  markers through the existing daily maintenance path.
