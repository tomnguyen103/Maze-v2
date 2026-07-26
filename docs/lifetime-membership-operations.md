# Lifetime Membership operations

Lifetime Membership is `$5.99 USD` once in Stripe-hosted Checkout. It is not a
subscription and never changes game power. This runbook covers test mode only;
it does not authorize a live Product, live Price, or real charge.

## Stripe test setup

1. In Stripe test mode, create a Product named `Echo Maze Lifetime
   Membership`.
2. Add one one-time Price for exactly `$5.99 USD`. Do not create a recurring
   Price.
3. Configure the server with `STRIPE_SECRET_KEY=sk_test_...`,
   `STRIPE_PRICE_ID=price_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, and the
   exact `ECHO_MAZE_APP_ORIGIN`.
4. Keep `RUN_ACCESS_ENFORCEMENT_ENABLED=false` while applying migrations and
   testing recovery. Set it to `true` only in an approved test environment
   after every check below passes.
5. Register `/api/stripe-webhook` for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
   - `refund.created`
   - `refund.updated`
   - `refund.failed`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `charge.dispute.funds_reinstated`

For local forwarding, use the Stripe CLI in test mode and copy only its
temporary `whsec_...` value into the local shell or `.env.local`. Never paste a
secret into source, logs, issues, screenshots, or chat.

## Release proof

- Apply migrations `0001`, `0002`, and `0003` in order.
- Run `npm run check:full`.
- Confirm incomplete Stripe configuration publishes
  `{"enforcementEnabled":false}`.
- In test mode, exhaust a test Clerk account's three free starts.
- Open Checkout from the focused membership dialog. Confirm Stripe receives
  one fixed Price, quantity `1`, mode `payment`, and no card or child data in
  metadata.
- Complete with a Stripe test card. Confirm direct return starts the saved Run.
- Repeat with the webhook arriving before and after browser return; entitlement
  must activate once.
- Replay the same webhook; it must produce no additional state change.
- Confirm an already active member can start while Stripe is unavailable.
- Confirm a full refund or open dispute blocks only the next new Run. A Run
  authorized before the state change may finish.
- Confirm a won/closed dispute restores future starts from a newer signed
  provider event.

## Player support and receipt recovery

Ask only for the account sign-in method and the approximate Checkout time.
Never ask for a card number, CVC, full billing address, raw webhook, Clerk
token, Stripe secret, or database credential.

1. Confirm the player is signed into the same Clerk account used at Checkout.
2. Ask them to reopen `/play`. The saved pending Run remains on the device.
3. If the return page says confirmation is taking longer, inspect the Stripe
   test Checkout Session and webhook delivery. Re-deliver the signed event;
   never edit entitlement based on a screenshot or success URL.
4. Match internal `purchase_id` and `clerk_user_id` metadata to the database.
   Do not put username, email, Question text, or child-entered content in
   Stripe metadata.
5. For a refund or dispute, explain that the current authorized Run may finish
   and the next new Run is gated. Do not promise a provider outcome.
6. Account deletion must remove the Clerk-linked `player_access` row through
   the approved deletion procedure; database cascades remove its grants and
   purchase records. Stripe financial records remain subject to Stripe and
   legal retention rules.

## Rollback

Set `RUN_ACCESS_ENFORCEMENT_ENABLED=false` and redeploy. The public access
configuration changes immediately, signed and Guest players can start Runs,
and no entitlement or purchase row is deleted. Do not disable webhook receipt:
continuing to normalize signed events keeps refund and dispute state current.

Rollback is complete only after desktop and mobile `/play` checks confirm there
is no purchase dead end. Re-enabling requires the full test configuration and a
repeat of the release proof above.
