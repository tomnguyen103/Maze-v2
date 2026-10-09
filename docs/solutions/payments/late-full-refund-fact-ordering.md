---
title: A late full-refund event must still make the Financial Fact refunded
category: payments
trigger: A Financial Fact shows status paid or disputed with refunded_cents equal to amount_cents.
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
  order (server/financial-facts.js:82).
- A linked paid Checkout event always writes the fact. A charge that is now
  refunded or disputed writes that state and grants no access
  (server/lifetime-store.js:209).
- Open follow-up: the entitlement transition in `transitionEntitlement` still
  uses the clock alone, so access can return to `active` after a stale full
  refund and a won dispute.
