# 0049: Keep account-free Financial Facts and Funnel Counts

- Status: Accepted
- Date: 2026-10-09

## Context

The owner must know whether Echo Maze earns money. Before this decision, purchase
and refund state lived only in `lifetime_purchases`. Account deletion erases that
row. A refund for a deleted account then had no record to update. No count showed
how many adults reached the offer or how many Explorers started a Personal Run.

Echo Maze serves children. The data posture is minimisation. Erasure must remove
the account record, and analytics must never rebuild an identity.

## Decision

1. Each paid Lifetime PaymentIntent writes one Financial Fact in `financial_facts`.
   The row holds the PaymentIntent id, Billing Mode, amount, currency, status,
   refunded cents and timestamps. It holds no account, contact, Checkout Session or
   name column.
2. The fact is written in the same transaction as the purchase transition. A
   failed fact write rolls the transition back.
3. A refund or dispute updates the fact by PaymentIntent id. The update works after
   account deletion and never restores the profile.
4. `funnel_counts` holds daily aggregate counters for four steps: adult offer
   visit, account created, Personal Run activated and Checkout created. A counter
   row holds a UTC day, a metric, an allowlisted Campaign Code and a Billing Mode.
5. Database triggers count the account, activation and Checkout steps. The visit
   step has no row change, so `POST /api/access/visit` counts it through a
   `SECURITY DEFINER` function.
6. A counter failure drops one increment and never blocks play or payment. A fact
   failure is a financial failure and blocks the transition.
7. The runtime role cannot write `funnel_counts` directly. Only the definer
   functions write it.
8. `GET /api/admin/funnel` returns the counts and the fact totals of one Billing
   Mode for a range of at most 366 UTC days, as JSON or CSV. The visit, account
   and activation counts carry no mode, so both modes return them. A purchase
   counts on its paid day. A full refund counts on its refund day. A dispute
   counts on its dispute day. The cents of a partial refund stay on the paid day,
   because a partial refund has no refund time. Net Purchases use the status now.
   The route requires
   `refunds:issue` and writes one audit row per read.
9. `shared/unit-economics.js` computes Contribution and cash break-even from
   owner inputs. It reads no stored data.

## Consequences

- Revenue and refund totals survive account erasure.
- The Stripe payer record stays at Stripe under the PaymentIntent id. The owner
  reconciles there. This database keeps no link from a fact to a person.
- Code deletes no fact. The owner's financial retention policy governs facts. The
  F4 runbook names that policy.
- Counters hold aggregates and stay until the owner decides otherwise.
- Visit counts are indicative. A client can forge a visit up to the rate budget. A
  bot user agent and an unmetered request count nothing.
- A purchase is not attributed to a Campaign Code. The export compares campaign
  visits with total purchases only.
- Live checkout never ran before F2, so no fact backfill exists. Migration 0033
  stamps `first_run_grant_at` lazily on the next Grant instead of a full-table
  update under migration locks.

## Rejected alternatives

- Soft-delete the account and keep `lifetime_purchases`: a soft-deleted row keeps
  identity.
- Send events to PostHog: the plan allows no analytics vendor by default, and the
  forwarder carries no identity that could rebuild totals.
- Count in application code after commit: a crash between commit and count loses
  the count, and six stores create `player_access` rows.
- A 30-day deduplication table: each first-seen step dedupes on an authoritative
  row, so no key exists to expire.
- Link a Campaign Code to an account or purchase: the link needs a defined lawful
  basis first.
