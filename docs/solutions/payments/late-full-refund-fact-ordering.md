---
title: A late full-refund event must still make the Financial Fact refunded
category: payments
trigger: A Financial Fact, a Lifetime purchase or player access shows paid, active or disputed on a fully refunded charge.
---

# A late full-refund event must still make the Financial Fact refunded

## Problem

Stripe can deliver a refund event after a newer dispute event. The fact
transition used only the event clock, so the late refund was `stale`. The
refunded cents still rose to 599, because they come from the charge as it is
now. A later won dispute then set the fact to `paid` with 599 refunded, and Net
Purchases counted a fully refunded payment.

A second gap had the same cause. A paid Checkout event that Stripe delivered
after a refund, or after a newer access clock, wrote no fact at all.

## What did not work

Ordering by event clock alone. The clock orders events, but
`retrievePaymentReference` reads the charge at processing time
(server/stripe-lifetime.js:128). The state and the cents are current, not as
of the event.

## Root cause

The fact took its status from event order and its cents from current money.
The two could disagree.

## Fix

- A full refund of the charge makes the fact `refunded` whatever the event
  order (server/financial-facts.js:94).
- A linked paid Checkout event always writes the fact. A charge that is now
  refunded or disputed writes that state and grants no access
  (server/lifetime-store.js:219).
- A repeat insert merges the larger refunded cents into the row, so a late
  Checkout cannot drop a refund snapshot (server/financial-facts.js:34).
- A first fact starts at the purchase clock. An event older than a known
  payment event stays stale for the fact (server/lifetime-store.js:215).
- The entitlement transition applies the same rule. A full refund of the
  charge makes access and the purchase `refunded` whatever the event order.
  The clock keeps the larger value (server/lifetime-store.js:429).
- A late Checkout event that sees a full refund applies the same rule when
  the purchase already granted access. A purchase that never granted access
  stays without access (server/lifetime-store.js:219).
