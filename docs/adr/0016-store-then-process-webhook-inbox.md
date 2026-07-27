# 16. Store-then-process webhook inbox

Date: 2026-07-27

## Status

Accepted

## Context

Stripe and Clerk webhooks were verified and processed in one step. If processing
threw after verification, the handler answered 503 and the delivery was lost
unless the provider happened to redeliver — and providers stop redelivering
eventually. A refund that failed to apply on its last retry simply never applied.

Idempotency existed only inside the Stripe handler, via `stripe_webhook_events`.
That covered replay of the same Stripe event, but nothing owned recovery: there
was no record of a delivery that had arrived and not yet succeeded.

## Decision

**Verify, then store, then process — in that order.** Signature verification
still happens first and an unverified delivery is never written; it was never a
genuine delivery. Once stored, we answer 200 so the provider stops retrying, and
our own loop owns recovery from there.

That ordering is the whole point: a crash between storing and processing leaves a
retryable row, and a crash before storing leaves nothing — which is correct,
because the provider will redeliver something we have no record of.

**`PRIMARY KEY (provider, event_id)` is the idempotency.** A repeat delivery
collides and returns `duplicate`, and a duplicate is a no-op — not a second
processing attempt. `provider` is part of the key so a Stripe and a Clerk event
that happen to share an id stay distinct.

Clerk events are keyed by the `svix-id` delivery header rather than anything in
the payload, because that header is what a Clerk redelivery reuses.

**One seam, `processEvent(provider, event)`, shared by the inline path and the
retry loop.** A retried delivery must take exactly the route a fresh one takes,
or the retry is testing different code than production runs.
`lifetime-service.processWebhook` is now `verifyWebhook` + `processVerifiedWebhook`,
with the old entry point preserved so its existing tests keep their meaning.

**Failures escalate, then stop.** Five attempts, then `dead`. A row that has
failed five times is not transient, and leaving it in the retry set forever means
every cron run pays for it. `scripts/list-dead-webhooks.mjs` exits nonzero when
any exist, so it can gate a deploy or wake someone; phase 7 surfaces them in the
dashboard.

**`last_error` stores a redacted class name, never the provider's message.** A
failing payload may quote the very fields the Journal and audit rules keep out of
storage — card fragments, ids, addresses. Asserted by test.

**Overlapping runs are safe through idempotency, not locking.** An earlier draft
of this ADR claimed `FOR UPDATE SKIP LOCKED` prevented two cron invocations from
processing the same row. It did not: the retry loop reads through the pooled
query adapter, where every statement is its own transaction, so the row locks
released the moment the `SELECT` returned. The lock was decoration.

The real guarantee is that `processEvent` is idempotent per provider — Stripe
through `stripe_webhook_events`, Clerk through the deletion tombstone — so
processing a row twice is a no-op. `selectRetryable` is named for what it does:
it selects, it does not claim.

## Where the endpoint lives

`/api/internal/webhook-retry`, driven by Vercel cron.

Two corrections to the plan's sketch, both forced by how the platform actually
behaves rather than by preference:

- **Vercel cron issues `GET` with `Authorization: Bearer $CRON_SECRET`**, not a
  `POST` carrying a custom header. An endpoint that only accepted `POST` and
  `x-cron-secret` would have returned 401 to every scheduled run and the retry
  loop would never have executed. Both shapes are accepted now; the custom header
  stays because driving the endpoint by hand is easier with it.
- **The schedule is daily, not every ten minutes.** Vercel's Hobby plan — the
  same plan whose 12-function ceiling shaped where this endpoint lives — permits
  one invocation per cron job per day. `*/10 * * * *` would not have run as
  written. On a paid plan, restoring the ten-minute cadence is a one-line change
  to `vercel.json`.

The secret is compared with `timingSafeEqual`. The length check short-circuits,
which leaks the secret's length but none of its bytes.

It is **not** its own serverless function. The project sits at Vercel's
12-function Hobby ceiling, so `vercel.json` rewrites `/api/internal/*` onto
`api/stripe-webhook.js`, which rebuilds the path before dispatching. Webhook
delivery and the webhook retry loop are the same subsystem, so that is the least
surprising host — but the reason is the ceiling, not taste, and it is recorded
here so the next person does not "tidy" it into a new file.

An unset `CRON_SECRET` **closes** the endpoint with 503. A missing secret must
never mean an open internal endpoint. Unauthenticated callers get the same 401
for a real internal route and an unknown one, so the surface cannot be mapped.

## Consequences

- Replaying the same event any number of times causes one state change.
- A delivery that fails mid-process stays retryable rather than being lost.
- Providers see 200 as soon as the delivery is stored, so their retry schedule
  stops competing with ours.
- Both webhook routes keep their pre-inbox behaviour when no inbox is configured,
  so guest-only and database-less deployments are unaffected.
- New env var: `CRON_SECRET`. Required for the retry endpoint to function at all.
- **Auditing lives in the `processEvent` seam, not in the routes.** Putting it in
  the route meant the retry loop produced no audit rows at all, and the Clerk
  inbox path wrote no `user.delete` audit row for a `user.deleted` event — a
  silent regression against phase 1's rule that every mutating path is audited.
  (`user.deleted` is Clerk's event name; `user.delete` is our audit action, set
  in phase 1. They are deliberately different words for different things.) In the seam, a delivery that only
  succeeds on its fourth attempt still leaves the same trail as one that succeeds
  immediately.
- **Rewritten sub-paths are validated, not interpolated.** `_internalPath=../..`
  normalizes to `/`, which no namespace recognises, so the request reached a
  `next?.()` that does not exist in a serverless function and hung until the
  platform timeout — unauthenticated. Both shims now reject anything that is not
  a plain path segment. This is the third instance of that failure mode in this
  codebase; every shim and every dispatch guard now has a test asserting a
  response is actually written.
- A day between retries is a long time for a failed refund. The daily schedule is
  a Hobby-plan constraint, not a design position, and it is the first thing to
  change if this ever runs on a paid plan.
- **The payload is transient, not retained.** The inbox holds the full verified
  payload because a retry has to reprocess the original event — but a Clerk
  `user.deleted` payload carries the raw Clerk id, which is exactly the identity
  the deletion tombstone exists to avoid storing (`README.md`: "it stores only a
  SHA-256 deletion tombstone — not the raw Clerk identity"). Keeping it forever
  would quietly break that guarantee.

  So the payload lives exactly as long as it is useful: `markProcessed` clears it
  the moment the delivery succeeds, and `npm run webhooks:prune` removes settled
  rows past a 30-day window, which bounds how long a *dead* row can hold one. A
  row whose payload is gone is not selected for retry, so a cleared payload can
  never be mistaken for an empty event.
- `webhook_inbox` is the one table carrying provider payloads, so phase 6's
  export must not include it — those rows are ours, not the Explorer's.
