# 0007: Keep lifetime Run Access server-authoritative and separate from profiles

## Status

Accepted

## Context

ADR 0006 gives a Guest one complete Run and then exempts signed-in Explorers
from the browser-local demo boundary. The approved product contract now gives
each signed-in Clerk identity exactly three additional free Run starts, followed
by one optional $5.99 USD lifetime purchase.

Profiles cannot own this state because profile creation is optional public
identity setup. Score Entries also omit defeats and abandoned Runs, so they
cannot reconstruct allowance use. Browser storage cannot enforce an
account-wide allowance across devices.

Stripe provides hosted one-time payment, but ordinary Run starts must not
depend on Stripe availability or raw provider state.

## Decision

- Clerk owns authenticated identity.
- PostgreSQL owns signed-in free-Run usage, idempotent Run Grants, normalized
  purchase state, and lifetime entitlement.
- A stable Run identifier is authorized before a distinct signed-in Run becomes
  playable. The same Clerk identity and Run identifier always return the same
  Grant.
- Exactly three distinct free Run identifiers are granted to every new or
  existing Clerk identity. Authorization is atomic across concurrent requests.
- A verified lifetime entitlement grants unlimited new Runs without increasing
  the free-Run counter.
- Stripe-hosted Checkout uses `payment` mode for one fixed one-time Price. No
  recurring Price or Subscription represents Lifetime Membership.
- Browser redirects and return parameters grant nothing. The server verifies
  payment ownership and fixed commercial fields directly, and signed webhooks
  provide asynchronous recovery.
- A full refund or open dispute blocks the next new Run. An already authorized
  Run may finish.
- Player Profile creation, score submission, Quest rules, Questions, and
  deterministic Run state remain separate.

This decision supersedes only ADR 0006's signed-in-unlimited consequence.
ADR 0006 still owns the Guest completion boundary.

## Consequences

- Clearing device storage cannot reset signed-in allowance or lifetime access.
- Lifetime access follows Clerk sign-in across browsers.
- Existing accounts receive three free Runs because historical scores cannot
  prove earlier starts.
- Access API failure before a new Grant keeps the Run blocked and consumes
  nothing; retrying a committed Grant is safe.
- Stripe downtime does not block an account whose active entitlement is already
  stored.
- Lifetime Membership buys access and continuity, never power.
