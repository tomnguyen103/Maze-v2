# 0047: Bind Lifetime purchases to a Billing Mode

- Status: Accepted
- Date: 2026-10-09

## Context

Lifetime Membership uses Stripe-hosted Checkout. Test-mode and live-mode Stripe
objects are separate. A live secret key cannot read test-mode objects. Before this
decision, a stored purchase did not record its mode. A live deployment could
therefore grant access from a test payment.

## Decision

1. Each deployment runs in one Billing Mode, `test` or `live`. The variable
   `ECHO_MAZE_BILLING_MODE` selects it. An unset variable means `test`.
2. The server refuses a Checkout Session or PaymentIntent whose `livemode` differs
   from the Billing Mode. It ignores a webhook event of the other mode.
3. Stripe idempotency keys include the Billing Mode. A test request never replays
   as a live request.
4. Each stored purchase, webhook event, and Run Access projection records its mode.
5. A purchase with no mode is an Unclassified Purchase. It grants nothing and never
   blocks a purchase in a real mode.
6. At most one open purchase exists per player and Billing Mode. Unclassified rows
   form their own key.
7. The owner classifies Unclassified Purchases with `scripts/classify-lifetime-purchases.mjs`.
   The script reads Stripe for each row. It writes a mode only when the Session and
   the PaymentIntent agree. An abandoned Checkout has no PaymentIntent, so its
   Session alone decides. The script reports a row that would share an open-purchase
   slot with another row. Dry-run is the default. `--apply` writes the verified rows.
8. Live readiness fails while any Unclassified Purchase exists.
9. Class Expedition billing stays test-only. Live mode opens no Expedition Session.

## Consequences

- A live deployment cannot grant access from a test payment. The `livemode` check
  and the mode-scoped stores enforce this.
- Purchases stored before migration 0031 stay unclassified until the owner classifies
  them. They grant nothing until then. A legacy member shows no membership in any
  mode until classification runs, so the owner classifies in the test environment too.
- A projection of one mode never orders or blocks an event of the other mode. A
  live event overwrites a test projection, and a test event never overwrites a live one.
- Live readiness waits on classification. The cutover runbook sets `live` last.
- A deployment with no variable set keeps test behaviour.
- Migration 0031 adds columns and an index without a backfill. It is additive.

## Rejected alternatives

- Backfill every existing row as test: a live payment would be wrongly labelled. The
  Stripe object already records its mode, so the classify script reads it.
- Infer the mode from the key prefix: a key prefix names the key, not the stored object.
- One database per mode: doubles the operational work and the migration sequence.
