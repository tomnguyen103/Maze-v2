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
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `charge.dispute.funds_reinstated`

For local forwarding, use the Stripe CLI in test mode and copy only its
temporary `whsec_...` value into the local shell or `.env.local`. Never paste a
secret into source, logs, issues, screenshots, or chat.

## Release proof

- Apply migrations `0001` through `0005` in filename order.
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

## Support triage

Start with the least information possible. Ask only for the account sign-in
method, the approximate Checkout time, the visible error category, and whether
the problem occurs before or after Stripe Checkout. Never ask for a card
number, CVC, full billing address, raw webhook, Clerk token, Stripe secret,
database credential, Question text, or child-entered content.

Classify the case before taking action:

- **Run Access unavailable:** keep enforcement off or use the billing-disable
  procedure below. Do not grant or revoke membership from a screenshot.
- **Checkout did not open:** verify test configuration and the
  `lifetime_checkout` outcome. Do not accept price or redirect overrides from
  the browser.
- **Paid return is still pending:** follow receipt recovery below.
- **Refund or dispute:** follow the signed-provider procedure below. The active
  authorized Run may finish; only a later new Run is gated.
- **Account deletion:** follow the deletion procedure below. Do not combine it
  with a refund unless the account owner separately requests one.

## Receipt recovery

1. Confirm the player is signed into the same Clerk account used at Checkout.
2. Ask them to reopen `/play`. The saved pending Run remains on the device.
3. If the return page says confirmation is taking longer, inspect the Stripe
   test Checkout Session and webhook delivery. Re-deliver the signed event;
   never edit entitlement based on a screenshot or success URL.
4. Match internal `purchase_id` and `clerk_user_id` metadata to the database.
   Do not put username, email, Question text, or child-entered content in
   Stripe metadata.
5. Re-deliver the signed test event if needed. Direct confirmation and webhook
   fulfillment must converge on the same entitlement without a manual database
   edit.
6. Confirm the account reads `state=member` through `/api/access` before
   closing the case. Do not expose the Clerk identity or provider identifiers
   in the support record.

## Refund and dispute handling

The staff workbench may initiate a full refund for the latest paid Lifetime
Membership purchase. Stripe receives a stable purchase-scoped idempotency key,
so retries converge on one provider refund. After Stripe accepts the request,
the successful result is appended to the audit trail; a provider failure is
reported as an operation failure and does not claim a completed refund audit.
Initiating the refund does not edit `player_access` and never removes completed
Quest Progress, Run Records, Score Entries, Journal history, or an
already-issued Run Grant. Entitlement changes only after the existing signed
Stripe webhook path confirms the provider state; a refund then blocks the next
new Run while an active Run may finish.

1. Confirm the provider event is signed and belongs to the fixed one-time test
   Price. Never infer a refund or dispute from browser state or a screenshot.
2. Let `refund.created`, `refund.updated`, or
   `charge.dispute.created` normalize through the webhook adapter.
3. Confirm the event is idempotently recorded and that `/api/access` reports
   `membership-blocked` before the next new Run.
4. Do not interrupt a Run that already received a Run Grant.
5. For restored funds, accept only a newer
   `charge.dispute.funds_reinstated` or winning
   `charge.dispute.closed` event. Confirm future starts return to `member`.
6. Do not promise a refund timeline or outcome. Player-facing policy language
   requires product/legal approval before production billing.

## Account deletion

The normal path is Clerk's signed `user.deleted` webhook. Its verified opaque
user id enters the deletion store as a bound parameter. One transaction takes
the same per-user advisory lock used by account-creating writes, stores only a
SHA-256 tombstone of the identity, then deletes Cloud Quest Progress, the
Player Profile (including Score Entries), and Run Access (including Run Grants,
local purchase projections, and the cloud Journal). The tombstone prevents a
late or retried writer from recreating deleted application data. Never accept
an unsigned deletion request.

Use `scripts/delete-user-data.mjs` only as an approved break-glass recovery
after independently authenticating the account-deletion request. It reuses the
same reviewed deletion store as the signed webhook instead of asking an
operator to reconstruct a transaction in `psql`. Keep the opaque Clerk user id
and its lowercase hexadecimal SHA-256 digest in process-local environment
variables; never paste either value into logs, issues, screenshots, or chat.

From a PowerShell session with the approved database available through
`DATABASE_URL` or `.env.local`, run:

```powershell
$verifiedUserId = $null
$reenteredUserId = $null
$bytes = $null
$digest = $null
$sha256 = $null
try {
  $verifiedUserId = Read-Host "Verified Clerk user id"
  $reenteredUserId = Read-Host "Re-enter the Clerk user id"
  if ($verifiedUserId -cne $reenteredUserId) {
    throw "Clerk user ids do not match."
  }
  $env:ECHO_MAZE_DELETE_USER_ID = $verifiedUserId
  $sha256 = [Security.Cryptography.SHA256]::Create()
  $bytes = [Text.Encoding]::UTF8.GetBytes(
    $env:ECHO_MAZE_DELETE_USER_ID
  )
  $digest = $sha256.ComputeHash($bytes)
  $env:ECHO_MAZE_DELETE_CONFIRM_SHA256 = -join (
    $digest | ForEach-Object { $_.ToString("x2") }
  )
  $env:ECHO_MAZE_DELETE_CONFIRM = Read-Host (
    "Type DELETE APPLICATION DATA to confirm"
  )
  node --env-file-if-exists=.env.local scripts/delete-user-data.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Application data deletion did not verify."
  }
} finally {
  if ($null -ne $sha256) {
    $sha256.Dispose()
  }
  Remove-Item Env:ECHO_MAZE_DELETE_USER_ID -ErrorAction SilentlyContinue
  Remove-Item Env:ECHO_MAZE_DELETE_CONFIRM_SHA256 -ErrorAction SilentlyContinue
  Remove-Item Env:ECHO_MAZE_DELETE_CONFIRM -ErrorAction SilentlyContinue
  Remove-Variable verifiedUserId -ErrorAction SilentlyContinue
  Remove-Variable reenteredUserId -ErrorAction SilentlyContinue
  Remove-Variable bytes -ErrorAction SilentlyContinue
  Remove-Variable digest -ErrorAction SilentlyContinue
  Remove-Variable sha256 -ErrorAction SilentlyContinue
}
```

The Player Profile deletion cascades to Score Entries. The Run Access deletion
cascades to Run Grants, local purchase projections, Cloud Quest Progress, and
the cloud Journal. Before commit, the tool verifies that
`cloud_quest_progress`, `players`, `score_entries`, `player_access`,
`run_access_grants`, `lifetime_purchases`, and `learning_journals` contain zero
rows for the bound identity, and that `deleted_user_tombstones` contains exactly
one row for the bound digest. A failed deletion or verification rolls back the
transaction and prints only a bounded failure message. Stripe financial
records follow Stripe and legal retention rules and must not be erased by direct
database edits. Device-local
Quest Progress, Run Records, Journal, settings, Daily records, and active Run
state remain on the player's devices; support must explain how the player can
clear site data separately.

If the tool fails, investigate without attempting partial manual cleanup.
Never partially delete one application identity.

## Billing disable

Set `RUN_ACCESS_ENFORCEMENT_ENABLED=false` and redeploy. Confirm
`GET /api/access/config` returns `{"enforcementEnabled":false}` on desktop and
mobile before announcing the incident resolved.

Billing disable must not:

- delete or rewrite `player_access`, `run_access_grants`, or
  `lifetime_purchases`;
- disable signed webhook receipt;
- change the `$5.99 USD` one-time product contract; or
- interrupt an active Run.

Continue normalizing signed refund and dispute events while starts are
unmetered. This preserves the correct entitlement state for a later recovery.

## Rollback

Use the billing-disable procedure first. The public access configuration
changes immediately, signed and Guest players can start Runs, and no
entitlement or purchase row is deleted.

Rollback is complete only after desktop and mobile `/play` checks confirm there
is no purchase dead end, a known member remains stored as `active`, and a
signed test webhook still reaches the service. Re-enabling requires the full
test configuration and a repeat of the release proof above.

## Privacy-minimized observability

The structured recorder accepts only these bounded event families:

- `run_access_decision`: access state, duplicate flag, enforcement flag, and
  admitted/blocked/unmetered outcome;
- `guest_demo_access_decision`: duplicate, enforcement, metered, and degraded
  flags plus admitted/blocked/degraded/unmetered outcome;
- `run_access_error`: the fixed `temporary` category;
- `lifetime_checkout`: created or reused;
- `lifetime_confirmation`: bounded fulfillment outcome; and
- `lifetime_webhook`: one reviewed event type and bounded processing outcome.

It drops unknown event names, unknown fields, and values outside those finite
vocabularies. Logs must never contain account ids, Run ids, purchase ids,
Checkout Session ids, PaymentIntent ids, email, card or billing data, secrets,
tokens, raw webhook bodies, Question text, or child-entered content.
Server failure logs use a fixed operation label plus a bounded error category
only; they never serialize an error name, message, stack, request body, or
provider payload.

## External production approvals

This runbook is executable engineering guidance, not approved legal or refund
policy. Production remains blocked on all of the following external decisions:

- approved player-facing refund, dispute, privacy, deletion, and support
  language;
- an approved live Stripe Product and one-time Price;
- explicit authorization to enable production enforcement; and
- an approved live `$5.99` purchase-and-refund smoke test.

Until those approvals exist, keep enforcement false and use Stripe test mode.
No step in this repository authorizes a live charge.
