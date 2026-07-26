# Echo Maze Lifetime Membership Plan

> **Superseded source note:** This payment plan was consolidated into
> [`echo-maze-lifetime-membership-and-echo-atlas-master-plan.md`](echo-maze-lifetime-membership-and-echo-atlas-master-plan.md)
> on 2026-07-25. Retain this file as technical source detail, but use the
> combined master plan as the only implementation contract.

**Planning status:** Superseded by the combined master plan

**Implementation status (2026-07-26):** Test-mode engineering implementation is
complete through merged PR #49 for server-authoritative free Run access and
merged PR #50 for one-time lifetime membership. PR #56 adds integrated landing
and validation evidence and remains pending mandatory review and merge; that
merge is still required for remote-main proof. Enforcement remains off and no
live charge is claimed. Access, Checkout, fulfillment, refund/dispute, deletion,
and recovery behavior is exercised by the matching `tests/*access*.test.js`,
`tests/lifetime-*.test.js`,
`tests/e2e/game.spec.js`, and live PostgreSQL store suites indexed in
[`implementation-coverage.md`](implementation-coverage.md).

**Date:** 2026-07-25

**Reviewed commit:** `85c485f` on `main`

**Implementation authorization:** Not granted by this document

## 1. Decision Snapshot

Add one lifetime membership:

- **Name:** Echo Maze Lifetime Membership
- **Price:** **$5.99 USD once**
- **Renewal:** none
- **Duration:** lifetime access for the purchasing Clerk account
- **Free path:** one Guest demo Run, then three signed-in free Runs
- **Identity:** Clerk
- **Payment:** Stripe-hosted Checkout in one-time `payment` mode
- **Entitlement:** permanent PostgreSQL record after verified payment
- **Paid benefit:** unlimited new Runs
- **Game balance:** no paid score, Vitality, Pulse, Question, Hint, or Skip
  advantage

Clerk remains the account and authentication system. Payment cannot use Clerk
Billing because Clerk Billing currently supports recurring Subscriptions, not
a true one-time lifetime purchase. Stripe Checkout is the correct payment
boundary.

Do not emulate lifetime access by creating a recurring Clerk Plan and
automatically canceling it. That would create misleading renewal state,
unnecessary payment-method retention, and fragile entitlement behavior.

## 2. Player Promise

> Explore one Labyrinth for free. Create a free account to play three more
> Runs. Then unlock unlimited Runs forever with one $5.99 purchase.

Required plain-language purchase copy:

> $5.99 once. No subscription. No renewal.

The price and non-recurring nature must appear before the player opens
Checkout, inside Stripe Checkout, and on the success screen.

### 2.1 Exact access sequence

| Moment | Identity | Access result | Signed-in free Runs remaining |
|---|---|---|---:|
| First visit | Guest | One demo Run may start | Not applicable |
| Guest demo ends by escape or defeat | Guest | Account required before another Run | Not applicable |
| Account creation completes | Signed in | First signed-in free Run may start | 3 |
| Signed-in free Run 1 starts | Signed in | Run granted | 2 |
| Signed-in free Run 2 starts | Signed in | Run granted | 1 |
| Signed-in free Run 3 starts | Signed in | Run granted | 0 |
| Any later new Run | Signed in, unpaid | Lifetime purchase required | 0 |
| Verified one-time payment succeeds | Signed in, lifetime member | Unlimited new Runs forever | 0 |

The intended maximum free experience is four Runs: one Guest demo plus three
signed-in Runs.

### 2.2 What counts as a Run

- The Guest demo is consumed when its active Run ends through escape or defeat.
  This preserves ADR 0006 and current reload behavior.
- A signed-in free Run is consumed when the server first authorizes a new
  stable `runId`, before the Labyrinth becomes playable.
- Reloading or resuming the same authorized `runId` never consumes another Run.
- Retrying after terminal defeat creates a new `runId`.
- Continuing to the next Labyrinth after escape creates a new `runId`.
- Starting a new Quest or replaying a Run Record creates a new `runId`.
- Closing the browser after a signed-in Run starts does not refund that Run.
- Failed authorization never consumes a Run.

Start-time counting prevents unlimited abandonment before a terminal result.
The UI must warn when a free Run will be consumed before the player confirms.

### 2.3 Early sign-up and existing accounts

- A player who signs up before using the Guest demo receives three signed-in
  free Runs, not four.
- A signed-out player does not regain a Guest demo on a browser whose local
  demo record is complete.
- Every account that exists at launch receives three signed-in free Runs.
  Existing escaped-score history cannot reconstruct all starts or defeats.
- Clearing browser storage can reset the anonymous Guest demo. Do not add
  device fingerprinting.
- Clearing browser storage cannot reset signed-in trial usage or lifetime
  membership.
- A lifetime member signing in on another browser immediately regains access
  from the server entitlement.

## 3. Current-App Findings

### 3.1 The Guest boundary already exists

ADR 0006 and `src/game/demo-access.js` already implement a browser-local Guest
demo. `finishRun()` marks it complete after escape or defeat, and all later
Guest start routes pass through `canStartAnotherLabyrinth()`.

Extend this behavior; do not replace it.

### 3.2 Signed-in access is currently unlimited

`requiresDemoAccount()` exempts authenticated players. The new policy
supersedes that part of ADR 0006. The first approved ticket must add a new ADR
before implementation.

### 3.3 Profiles cannot own paid access

- Clerk owns identity.
- PostgreSQL stores Player Profiles and escaped scores.
- A `players` row is created only after the user chooses a public username.
- Quest Progress and Run Records remain browser-local.

Lifetime access must work immediately after Clerk sign-up, even before profile
creation. Use a separate access row keyed by Clerk user ID.

### 3.4 Scores cannot count free Runs

`score_entries` contains only authenticated escaped Runs submitted after
profile creation. It omits defeats and earlier starts. A dedicated Run-grant
ledger is required.

### 3.5 Payment routing has clean seams

- Local production uses Express middleware in `server.js`.
- Vite development and preview attach the same server handlers in
  `vite.config.mjs`.
- Vercel exposes one small file per `/api` route.
- No global JSON body parser currently runs before these handlers.

The Stripe webhook route must preserve the raw request body for signature
verification. Its handler should be isolated and mounted before any future
body-transforming middleware.

### 3.6 This is a product gate, not DRM

The deterministic maze engine and bundled Questions ship to the browser. A
determined user can modify downloaded JavaScript. Server-owned allowance and
lifetime entitlement prevent ordinary storage resets and multi-device trial
resets, but cannot make client code impossible to copy.

Paid value should grow through account-bound continuity features rather than
pay-to-win mechanics.

## 4. Product Goals and Non-Goals

### 4.1 Goals

- Make the free-to-paid promise clear before sign-up and purchase.
- Give each Clerk account exactly three server-counted free Run starts.
- Charge exactly $5.99 USD one time.
- Never create a recurring charge or subscription.
- Unlock lifetime access promptly after verified payment.
- Restore lifetime access on every browser after Clerk sign-in.
- Make checkout creation, payment confirmation, webhooks, refunds, disputes,
  and retries idempotent.
- Preserve active Runs during service failures.
- Preserve all existing gameplay invariants.

### 4.2 Non-goals

- Clerk Billing Plans or Clerk Pricing Table
- Monthly or annual subscriptions
- Multiple tiers, family plans, seats, coupons, or recurring trials
- Saving card details for future charges
- Paid gameplay advantages
- Server-authoritative maze simulation
- Cloud Quest Progress in this MVP
- Automated entitlement transfer between different Clerk accounts
- Device fingerprinting
- A custom card-entry form
- A new analytics vendor

Cloud Quest Continuity remains the immediate follow-up. Until then, purchase
copy must disclose that Quest Progress and Run Records remain on the current
device even though lifetime access follows the account.

## 5. Access State Machine

```text
guest_demo_available
        |
        | Guest Run ends
        v
account_required
        |
        | Clerk sign-up/sign-in completes
        v
signed_in_free(3)
        |
        | authorize new runId
        v
signed_in_free(2)
        |
        | authorize new runId
        v
signed_in_free(1)
        |
        | authorize new runId
        v
lifetime_purchase_required
        |
        | verified Stripe payment: USD 5.99
        v
lifetime_active
        |
        +-- full refund -> lifetime_refunded
        |
        +-- dispute opened -> lifetime_disputed
        |
        +-- dispute won / funds restored -> lifetime_active
```

### 5.1 Stable app states

- `free`
- `lifetime_purchase_required`
- `checkout_pending`
- `lifetime_active`
- `lifetime_refunded`
- `lifetime_disputed`
- `payment_verification_unavailable`

Do not expose raw Stripe object statuses as the public app API.

### 5.2 Entitlement rules

- Only a server record with `lifetime_status = 'active'` grants lifetime access.
- The initial record is created only after the server verifies a successful
  Stripe Checkout Session for the configured product, price, amount, currency,
  and authenticated Clerk user.
- A success URL or `session_id` alone never grants access.
- A full refund revokes lifetime access.
- A payment dispute suspends new Run starts while the dispute is open.
- Reinstated funds restore access.
- A partial refund is not supported in the MVP; support must choose full refund
  or no refund.
- An already authorized active Run may finish after refund or dispute.
- Access changes apply before the next new Run.
- Stripe downtime does not affect a previously stored active lifetime
  entitlement.

## 6. Payment Architecture

### 6.1 Responsibility split

| Concern | Authority | Reason |
|---|---|---|
| Identity and sign-in | Clerk | Existing account system |
| Guest demo complete | Browser storage | No identity exists |
| Three signed-in Runs | PostgreSQL | Multi-device and storage-reset safe |
| Product price | Stripe Price plus server verification | Client cannot choose amount |
| Card entry and required authentication | Stripe-hosted Checkout | App never handles card data |
| Lifetime membership | PostgreSQL | Permanent access has no subscription lifecycle |
| Payment evidence | Stripe Checkout Session and PaymentIntent IDs | Reconciliation and refund handling |
| Checkout events | Verified Stripe webhooks | Async completion, refunds, disputes |
| Quest Progress | Browser storage for this MVP | Existing architecture |

### 6.2 Required Stripe configuration

Create after implementation approval:

- one Stripe Product: `Echo Maze Lifetime Membership`;
- one non-recurring Price:
  - currency: `usd`;
  - unit amount: `599`;
  - type: one-time;
- Stripe-hosted Checkout;
- no `setup_future_usage`;
- no subscription;
- no automatic card saving by the app;
- separate test and live keys;
- one webhook destination for the exact required events.

Server-only environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_LIFETIME_PRICE_ID`
- `APP_ORIGIN`

No `sk_*` or `whsec_*` value may enter Vite, browser JavaScript, logs, source
control, or client responses.

### 6.3 Checkout-session creation

Add authenticated `POST /api/lifetime-checkout`.

The server must:

1. derive Clerk user ID from the authenticated request;
2. return `already_owned` when lifetime access is active;
3. reject duplicate active checkout attempts or return the existing attempt;
4. create an internal purchase attempt ID;
5. create a Stripe Checkout Session server-side with:
   - `mode: "payment"`;
   - the configured one-time Price ID;
   - quantity `1`;
   - internal purchase ID and Clerk user ID in metadata;
   - an allowlisted success URL under `APP_ORIGIN`;
   - an allowlisted cancel URL under `APP_ORIGIN`;
6. store the Stripe Session ID before returning its hosted Checkout URL.

Never accept a Price ID, amount, currency, success URL, or Clerk user ID from
the browser.

Suggested response:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "purchaseId": "opaque-id"
}
```

The browser redirects to the returned Stripe-hosted URL.

### 6.4 Synchronous return confirmation

The success URL may contain Stripe's
`{CHECKOUT_SESSION_ID}` placeholder. On return, the browser sends the opaque
Session ID to authenticated `POST /api/lifetime-confirm`.

The server retrieves the Session directly from Stripe and verifies:

- authenticated Clerk user matches stored purchase owner;
- Checkout Session ID matches the stored purchase;
- `mode === "payment"`;
- `payment_status === "paid"`;
- configured Price ID is present with quantity one;
- `amount_total === 599`;
- `currency === "usd"`;
- payment is not already fully refunded;
- the PaymentIntent and Session have not been claimed by another account.

Only then does one database transaction mark the purchase paid and set the
account's lifetime entitlement active.

This synchronous path unlocks immediately. The webhook remains the recovery
and reconciliation path when the browser never returns.

### 6.5 Stripe webhooks

Add an isolated `/api/stripe-webhook` handler.

Requirements:

- read the raw body exactly once;
- verify `Stripe-Signature` with the endpoint secret;
- reject invalid signatures before processing;
- deduplicate on Stripe event ID;
- retrieve authoritative Stripe objects when event payload detail is
  insufficient;
- reject unknown Products, Prices, amounts, currencies, or purchase IDs;
- process newer purchase state without letting stale events overwrite it;
- store only allowlisted identifiers and state, not full payloads;
- return quickly and make retries safe.

Required event families:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded`;
- `checkout.session.async_payment_failed`;
- `checkout.session.expired`;
- `refund.created` and relevant refund updates;
- dispute opened, closed, and funds reinstated events.

The exact event names must be confirmed against the Stripe API version pinned
during implementation.

## 7. Database Design

### 7.1 `player_access`

One row per Clerk user:

- `clerk_user_id TEXT PRIMARY KEY`
- `free_runs_started SMALLINT NOT NULL DEFAULT 0`
- check constraint `free_runs_started BETWEEN 0 AND 3`
- `lifetime_status TEXT NOT NULL DEFAULT 'none'`
- allowed values: `none`, `active`, `refunded`, `disputed`
- `active_purchase_id UUID NULL`
- `lifetime_activated_at TIMESTAMPTZ NULL`
- `created_at` and `updated_at`

Do not foreign-key this row to `players`; profile creation is separate.

### 7.2 `run_access_grants`

Idempotency ledger:

- `clerk_user_id TEXT NOT NULL`
- `run_id VARCHAR(128) NOT NULL`
- `grant_source TEXT NOT NULL` constrained to `free` or `lifetime`
- `created_at TIMESTAMPTZ NOT NULL`
- primary key `(clerk_user_id, run_id)`

The same `runId` always returns its original grant. Retention rules for old
lifetime grants may be added only after active-Run recovery requirements are
measured.

### 7.3 `lifetime_purchases`

One row per checkout attempt:

- internal UUID primary key;
- Clerk user ID;
- Stripe Checkout Session ID, unique when present;
- Stripe PaymentIntent ID, unique when present;
- configured Stripe Price ID;
- `amount_total INTEGER NOT NULL` constrained to `599`;
- `currency CHAR(3) NOT NULL` constrained to `usd`;
- status: `pending`, `paid`, `expired`, `failed`, `refunded`, or `disputed`;
- `paid_at`, `refunded_at`, and timestamps;
- no card number, CVC, billing address, or full Stripe object.

A PaymentIntent or Checkout Session may activate at most one Clerk account.

### 7.4 `stripe_webhook_events`

Minimal replay ledger:

- `event_id TEXT PRIMARY KEY`
- `event_type TEXT NOT NULL`
- `event_created_at TIMESTAMPTZ NOT NULL`
- `processed_at TIMESTAMPTZ NOT NULL`
- `outcome TEXT NOT NULL`

Do not store complete webhook payloads.

### 7.5 Atomic Run authorization

Authenticated `POST /api/run-access` accepts only:

```json
{
  "runId": "opaque-stable-id"
}
```

The transaction must:

1. return an existing grant for the same user and `runId`;
2. lock or atomically update `player_access`;
3. grant without decrement when `lifetime_status` is `active`;
4. otherwise increment `free_runs_started` only below three;
5. insert the grant in the same transaction;
6. return `lifetime_purchase_required` without mutation otherwise.

Two simultaneous browsers must never receive a fourth free Run.

## 8. Player Experience

### 8.1 Guest completion

Post-result message:

> Your demo Run is complete. Create a free Explorer account to unlock three
> more Runs.

Actions:

- `Create free account`
- `Sign in`

### 8.2 Signed-in allowance

Show allowance only at decision points:

- after sign-up: `3 free Runs ready`;
- before start: `This uses free Run 1 of 3`;
- after result: `2 free Runs remain`;
- before last start: `Last free Run`;
- after last result: explain the one-time unlock.

Never interrupt an active Run with a purchase message.

### 8.3 Lifetime purchase gate

Recommended copy:

**Unlock every future Run**

**$5.99 once**

- Unlimited Runs for this Explorer account
- No subscription
- No renewal
- Same fair Warden rules for every player

Because the app is child-friendly:

> Ask a parent or grown-up to help with this one-time purchase.

Primary action: `Unlock lifetime access - $5.99`

Secondary action: `Not now`

Until Cloud Quest Continuity ships:

> Lifetime access follows your account. Quest Progress and Run Records still
> remain on this device.

### 8.4 Checkout and success

- Redirect to Stripe-hosted Checkout.
- Stripe page must display a one-time $5.99 total, never `/month`.
- Cancel returns to the unchanged purchase gate.
- Success returns to a neutral `Verifying purchase...` state.
- The app unlocks only after server verification.
- Success message: `Lifetime access unlocked. No renewal.`
- Resume the exact blocked Run action after verification.
- Do not invent scarcity, countdowns, fake discounts, or “best value” claims.

### 8.5 Account surface

Replace subscription management with:

- `Lifetime member` status;
- purchase date;
- `Payment support` link or instructions;
- no cancel action because there is no renewal;
- refund policy link;
- account-deletion warning explaining access linkage.

## 9. Failure and Recovery Contract

| Failure | Required behavior |
|---|---|
| Clerk unavailable before first Guest demo | Guest demo may start |
| Clerk unavailable after Guest demo | Keep account gate and preserve result |
| Access API fails before signed-in Run | Do not consume a Run; show retry |
| Network drops after Run grant commit | Retry same `runId`; return same grant |
| Checkout creation times out | Reconcile pending attempt before creating another |
| User opens two checkout tabs | Prevent or reconcile duplicate active attempts |
| Checkout canceled | No access change and no charge claim |
| Card payment fails | No access change; show Stripe-safe retry |
| Checkout paid but browser never returns | Verified webhook activates access |
| Browser returns before webhook | Direct Stripe retrieval activates access |
| Success URL is forged | Server verification rejects it |
| Stripe webhook duplicated | Event ledger makes it a no-op |
| Stripe webhook order differs | Purchase-state rules prevent regression |
| Stripe unavailable for an unpaid user | Gate remains; retry later |
| Stripe unavailable for an active lifetime member | Access continues from PostgreSQL |
| Full refund completes | Finish current Run; gate next Run |
| Dispute opens | Finish current Run; suspend new Runs pending resolution |
| Dispute resolves in merchant's favor | Restore lifetime access |
| Clerk account deleted | No automatic transfer; follow published recovery policy |

## 10. Threat Model

| Threat | Control |
|---|---|
| Clear local storage for more signed-in Runs | PostgreSQL owns allowance |
| Forge browser counter | Server ignores it |
| Race multiple devices | Atomic access-row update |
| Replay Run authorization | Unique user plus `runId` |
| Change amount or Price ID in request | Server accepts neither from client |
| Forge Clerk user ID in metadata | Server derives identity from Clerk auth |
| Open redirect through success URL | Fixed `APP_ORIGIN` URLs |
| Share a paid success URL | Purchase owner and session are server-verified |
| Reuse one payment for two accounts | Unique Session and PaymentIntent constraints |
| Forge Stripe webhook | Raw-body signature verification |
| Replay webhook | Unique Stripe event ID |
| Claim incomplete or failed payment | Require `payment_status = paid` |
| Leak Stripe secrets through Vite | Server-only environment variables |
| Double-charge repeated clicks | Purchase-attempt reconciliation and Stripe idempotency |
| Retain unnecessary payment data | Store identifiers and state only |

Required security tests:

- unauthenticated access, checkout, and confirmation return `401`;
- client user IDs, Price IDs, amounts, currencies, and redirect URLs are ignored
  or rejected;
- fourth free Run is denied;
- concurrent third/fourth Run requests yield exactly one final free grant;
- repeat `runId` calls are idempotent;
- already-active lifetime member cannot buy again;
- forged and cross-account Session IDs do not unlock;
- paid wrong-Price or wrong-amount Sessions do not unlock;
- invalid, duplicate, and stale Stripe events do not change entitlement;
- full refund revokes and funds restoration reactivates;
- logs contain no secret, card data, raw webhook, or Clerk session token.

## 11. Official Platform Findings

Verified against current official documentation on 2026-07-25:

- Clerk Billing supports recurring Subscriptions. It does not provide the true
  one-time lifetime product required here.
- Stripe Checkout supports one-time purchases with `mode=payment`.
- Stripe-hosted Checkout manages required payment authentication, including
  3D Secure.
- Stripe supports metadata for internal reconciliation.
- Stripe webhook signatures require the untouched raw request body.
- Checkout fulfillment must be idempotent and should handle both synchronous
  return and asynchronous webhook completion.
- One-time Checkout does not save the payment method for later use by default.
- Refund events must be handled explicitly.

Official references:

- [Clerk Billing overview](https://clerk.com/docs/guides/billing/overview)
- [Stripe Checkout: one-time versus recurring modes](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Stripe Checkout Sessions](https://docs.stripe.com/payments/checkout-sessions)
- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe webhook signature verification](https://docs.stripe.com/webhooks)
- [Stripe refunds](https://docs.stripe.com/refunds)
- [Stripe one-time payment-method behavior](https://docs.stripe.com/payments/checkout/save-during-payment)

## 12. Launch and Policy Gates

Before live payment:

- approve the plain-language lifetime promise;
- publish refund, dispute, account-deletion, privacy, and support policies;
- decide sales geography and tax handling;
- confirm whether Stripe Automatic Tax is required;
- verify the product is allowed for the intended child/family audience;
- use a parent/grown-up purchase message without claiming it is an age gate;
- create separate Stripe test and live Products, Prices, keys, and webhooks;
- restrict live Price verification to exactly USD 5.99;
- test card success, 3DS, decline, canceled checkout, delayed payment if
  enabled, refund, and dispute fixtures;
- document manual support recovery using Stripe receipt evidence;
- perform a real low-value live purchase and approved refund before public
  release;
- never enable a recurring Price for this product.

## 13. Prioritized Implementation Tickets

Code work starts only after approval and follows the repository's
issue/spec/ticket, test-first, local review, CodeRabbit, and merge rules.

### M1 - Superseding lifetime-access contract

**Priority:** P0

**Estimated scope:** Small, 1-2 files

**Depends on:** Approval of the one-time design

Work:

- add ADR 0007 superseding signed-in-unlimited behavior in ADR 0006;
- update `CONTEXT.md` with trial, lifetime, refund, and dispute invariants;
- lock the `$5.99 once` language and non-DRM boundary.

Verify:

- no subscription or renewal language remains;
- every access state has one meaning;
- no code or payment configuration changes in this ticket.

### M2 - Access and purchase schema

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M1

Work:

- add access, grant, purchase, and Stripe-event tables;
- add amount, currency, uniqueness, and state constraints;
- add clean-install and current-data migration tests.

Verify:

- Profiles and scores are unchanged;
- existing accounts begin with three free Runs;
- one Stripe payment cannot belong to two accounts.

### M3 - Atomic Run-access slice

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M2

Work:

- implement idempotent grant storage;
- add authenticated access status and Run authorization;
- test concurrent final-free-Run requests.

Verify:

- exactly three distinct free `runId` values succeed;
- lifetime-active users receive grants without counter changes;
- all failure paths leave the counter unchanged.

### Checkpoint A - Access foundation

- [ ] ADR and API contract reviewed.
- [ ] Migration tests pass over current fixtures.
- [ ] Concurrency and idempotency tests pass.
- [ ] Lint, typecheck, unit tests, and build pass.

### M4 - One-time Checkout creation

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M2

Work:

- add the official Stripe server dependency;
- add authenticated Checkout Session creation;
- bind fixed Price, amount, currency, user, purchase, and return URLs;
- prevent repeat purchase for lifetime-active users.

Verify:

- Checkout Session uses `mode=payment`, quantity one, and configured Price;
- client cannot alter commercial fields;
- repeated clicks do not produce uncontrolled duplicate charges.

### M5 - Verified Stripe webhook slice

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M2 and Stripe test webhook configuration

Work:

- add raw-body signature verification;
- make payment fulfillment idempotent;
- handle completion, expiration, failure, refund, and dispute state;
- add allowlisted structured logs.

Verify:

- valid test events produce the expected purchase state;
- invalid, duplicate, and stale events are harmless;
- no full payload or secret appears in logs.

### M6 - Synchronous purchase confirmation

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M4 and M5

Work:

- retrieve returned Checkout Session server-side;
- verify owner, mode, payment, Price, quantity, amount, and currency;
- activate entitlement in the same idempotent fulfillment path as webhooks.

Verify:

- paid return unlocks without waiting for webhook delivery;
- forged, unpaid, wrong-product, and cross-account Sessions fail;
- webhook-first and return-first ordering produce the same state.

### Checkpoint B - Payment core

- [ ] Test-mode payment activates exactly one account.
- [ ] No subscription is created.
- [ ] Browser never handles card data or Stripe secret keys.
- [ ] Return and webhook paths reconcile to one purchase.
- [ ] Refund and dispute fixtures change access correctly.

### M7 - Client gate and stable Run identity

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M3 and M6

Work:

- add a focused access client/controller;
- persist a stable `runId` before signed-in Run creation;
- gate continue, retry, new Quest, record replay, and direct play;
- resume the exact blocked action after verified purchase.

Verify:

- reload never consumes another free Run;
- no new signed-in Run starts without a grant;
- lifetime access restores after sign-in on another browser.

### M8 - Lifetime purchase interface

**Priority:** P0

**Estimated scope:** Medium, 3-5 files

**Depends on:** M4 and M7

Work:

- add allowance messages and lifetime purchase dialog;
- redirect to Stripe-hosted Checkout;
- add verifying, canceled, success, refund, and dispute states;
- add parent/grown-up and local-progress disclosure.

Verify:

- every surface says `$5.99 once`, `no subscription`, and `no renewal`;
- keyboard, focus, reduced motion, zoom, desktop, and mobile checks pass;
- no false urgency, subscription copy, or card field appears in the app.

### M9 - Recovery, policy, and release proof

**Priority:** P0 release gate

**Estimated scope:** Medium, 3-5 files plus external policy work

**Depends on:** M1-M8

Work:

- add account-deletion and receipt-based recovery path;
- add browser journeys for free quota, purchase, restore, refund, and dispute;
- complete Stripe test/live configuration and support runbook;
- run the full local gate and reviews.

Verify:

- all acceptance criteria below pass in Stripe test mode;
- approved live smoke purchase and refund pass;
- `npm run check:full` passes;
- production release receives separate approval.

### 13.1 Dependency map

```text
M1 contract
    |
    v
M2 schema ---> M3 Run access ------------------------+
    |                                                |
    +---> M4 Checkout ---> M6 confirmation ----------+--> M7 client gate
    |                     ^                          |         |
    +---> M5 webhooks ----+                          |         v
                                                       M8 purchase UI
                                                              |
                                                              v
                                                       M9 release proof
```

Estimated engineering effort: **28-36 hours**, excluding policy/legal review,
Stripe account verification, live-payment review, and CodeRabbit wait time.

## 14. Acceptance Criteria

### Free access

- [ ] A fresh Guest can finish one demo Run.
- [ ] Escape and defeat both end Guest access.
- [ ] Every later Guest start route requires Clerk account creation.
- [ ] Each new and existing Clerk account receives exactly three free Run
      starts.
- [ ] Reloading the same `runId` consumes nothing more.
- [ ] A fourth distinct free `runId` is denied, including under concurrency.

### Lifetime payment

- [ ] Checkout displays exactly `$5.99 USD` as a one-time total.
- [ ] No Stripe Subscription or recurring Price is created.
- [ ] No renewal or saved-payment authorization is requested.
- [ ] Paid Checkout activates the matching Clerk account once.
- [ ] A lifetime-active account cannot accidentally purchase again.
- [ ] Lifetime access restores after sign-in on another browser.
- [ ] Full refund revokes the next Run; funds restoration reactivates it.

### Security and reliability

- [ ] Commercial fields are server-owned.
- [ ] Query parameters and success URLs cannot grant access.
- [ ] Checkout Session and PaymentIntent identifiers are unique across users.
- [ ] Stripe webhook signatures use the untouched raw body.
- [ ] Duplicate and reordered webhook/return processing is idempotent.
- [ ] Previously active lifetime members can play during Stripe downtime.
- [ ] Failed operations never consume a free Run or create a false purchase.

### Compatibility

- [ ] Existing Profiles, scores, Guest demo state, Quest Progress, and Run
      Records remain readable.
- [ ] Membership never changes gameplay or score.
- [ ] All answer-combat, kid-safe Question, uniqueness, difficulty, Hint, and
      Skip invariants remain green.
- [ ] Desktop and mobile browser journeys pass.
- [ ] `npm run check:full` passes.

## 15. Success Measures

Use first-party, privacy-minimized events only:

- Guest demo completed
- account gate shown
- account created after gate
- signed-in Run authorized with remaining count
- lifetime gate shown
- Checkout opened
- Checkout canceled, failed, or paid
- lifetime access restored on another browser
- payment verification error category
- refund/dispute access transition

Do not invent targets before a baseline exists. Initial questions:

- How many Guest completions become accounts?
- How many accounts use all three signed-in Runs?
- How many exhausted accounts open and complete one-time Checkout?
- How often is a paid player incorrectly blocked?
- How often do duplicate checkout attempts occur?
- Does device-local Quest Progress create refund or support requests?

## 16. Approval Gate

No app code, database migration, Stripe Product, Stripe Price, webhook,
dependency, secret, environment variable, GitHub issue, branch, or pull request
should be created until the user confirms this revised plan.

Recommended approval statement:

> Approve $5.99 USD once for lifetime access. Keep Clerk for accounts, use
> Stripe-hosted one-time Checkout, count signed-in free Runs when each new Run
> starts, give existing accounts three free Runs, and begin M1.
