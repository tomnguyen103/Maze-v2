# 0050: Gate live checkout to Pilot Accounts until Public Checkout opens

- Status: Accepted
- Date: 2026-10-09

## Context

Plan Phase 4 step 8 asks for one owner pilot purchase in live Billing Mode
before the public can buy. Before this decision, live mode let every signed-in
Explorer create a Checkout. A real charge could reach a stranger before the
owner proved the live path.

Run Access enforcement blocks a new Personal Run when an Explorer has no
access. If enforcement were on while the public cannot buy, every Explorer past
the free Runs would be locked out with no way to unlock.

## Decision

1. `resolveCheckoutGate` in `server/lifetime-config.js` decides who may create a
   Checkout. Test mode is open to every signed-in Explorer. Live mode is open to
   everyone only when `LIFETIME_PUBLIC_CHECKOUT_ENABLED` is `true`.
2. While Public Checkout is closed, only a Pilot Account in
   `LIFETIME_PILOT_ACCOUNT_IDS` can create a live Checkout. Any other Explorer
   gets 403 with the code `checkout_closed` and the message "Lifetime Membership
   is not on sale yet."
3. `resolveEnforcement` refuses live enforcement while Public Checkout is
   closed. The refusal names both variables. The owner sets
   `RUN_ACCESS_ENFORCEMENT_ENABLED=true` and
   `LIFETIME_PUBLIC_CHECKOUT_ENABLED=true` together in one deploy.
4. `/play?membership=open` opens the membership dialog while enforcement is
   off, so a Pilot Account can reach Checkout. The parameter leaves the URL.
5. The gate is temporary. The code carries a `temporary:` label with its
   reason and removal condition.

## Removal condition

Remove the gate after launch runbook step 12 (`docs/launch-runbook.md`)
passes. The removal deletes `resolveCheckoutGate`, the `checkout_closed`
answer, the enforcement coupling and both variables:
`LIFETIME_PILOT_ACCOUNT_IDS` and `LIFETIME_PUBLIC_CHECKOUT_ENABLED`. The owner
then removes both variables from the production environment.

## Consequences

- No stranger can pay in live mode before the owner pilot passes.
- Enforcement cannot lock Explorers out of a Run they cannot buy.
- The pilot list holds Clerk user ids only. It holds no email or name.
- The owner entry link works for any visitor, but a non-pilot Unlock gets the
  `checkout_closed` answer.

## Rejected alternatives

- A separate staging deploy for the pilot: it would test a different host and
  environment from production.
- A hidden price or a second Stripe Price for the pilot: the plan keeps one
  public price.
- Enforcement on with the gate closed: it locks Explorers out.
