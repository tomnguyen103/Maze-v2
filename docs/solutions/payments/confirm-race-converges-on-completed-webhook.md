---
title: A refund between the Checkout confirm read and write converges on the completed webhook
category: payments
trigger: A Financial Fact shows fewer refunded cents than Stripe after a refund that arrived while a Checkout return was confirmed.
---

# A refund between the Checkout confirm read and write converges on the completed webhook

## Problem

The Checkout confirm reads the charge from Stripe and then writes access and
the Financial Fact. A refund webhook can land between the read and the write.
The confirm then writes the cents it read, which are stale.

## What did not work

A Stripe read inside the row lock removes the gap. It holds the lock during
network I/O, so a slow Stripe call blocks every webhook for that purchase.
This was rejected.

## Root cause

There is no defect in the final state. The confirm write is stale only until
the `checkout.session.completed` webhook arrives. That webhook reads the
charge as it is now and re-records the fact. `recordFact` merges the larger
refunded cents, and a full refund wins whatever the event order.

- A full refund in the gap makes the access `refunded`, so the stale confirm
  is `ignored` and writes no fact. The completed webhook then inserts the
  refunded fact.
- A partial refund in the gap lets the stale confirm write 0 cents. The
  completed webhook then raises the fact to the partial cents.

## Fix

No code change. `tests/lifetime-confirm-race.integration.test.js` (US-04.1,
US-04.2) proves that both interleavings end in the serial result. The test
runs every store transaction as a savepoint inside one rolled-back
transaction, so it commits nothing and moves no Funnel Count of a parallel
lane file.