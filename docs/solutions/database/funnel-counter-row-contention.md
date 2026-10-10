---
title: A busy Funnel Count key drops counts through row lock contention
category: database
trigger: "WARNING: funnel count dropped: 55P03"
---

# A busy Funnel Count key drops counts through row lock contention

## Problem

A bump of a Funnel Count runs inside the transaction of the write that fires
it. Two open transactions that bump the same key at the same time lose a count.
The database log shows `funnel count dropped: 55P03`. The caller sees no error,
so the loss is silent.

## What did not work

Migration 0033 kept one counter row for each (day, metric, campaign, mode) and
set a 200 ms lock wait (`db/migrations/0033_funnel_counts.sql:69`). The wait
bounds the delay, but a second bump on a busy key still times out. The inner
block turns the timeout into a warning (`db/migrations/0033_funnel_counts.sql:77`),
so the count is gone.

A longer lock wait does not fix the cause. It holds the caller transaction open
longer, and the caller can be a Checkout or an account write.

## Root cause

The counter row lock lasts until the caller transaction commits, not until the
bump returns. One hot key (for example the `youtube` visit count) serializes
every open transaction that bumps it. Each later bump waits behind the first,
and each one that waits over 200 ms drops.

The 0033 lane tests used one connection. No test held two transactions open at
once, so the contention stayed hidden.

## Fix

Migration 0034 splits each counter into 16 shard rows
(`db/migrations/0034_funnel_counter_shards.sql:45`). A bump takes the first
shard whose advisory transaction lock is free. The start shard is
`pg_backend_pid() % 16`
(`db/migrations/0034_funnel_counter_shards.sql:70`). The bump then tries the next
shards in order without a wait
(`db/migrations/0034_funnel_counter_shards.sql:74`). When all 16 locks are held,
the bump writes the start shard and can still wait 200 ms and drop
(`db/migrations/0034_funnel_counter_shards.sql:85`). Every writer goes through
`bump_funnel_count`, so a free advisory lock means no open row lock on that
shard. The report sums the shard rows of each key.

The race test holds four transactions open on one visit key and expects no
`funnel count dropped` warning
(`tests/funnel-counts.integration.test.js`, test US-01.1). On the 0033 single
row behaviour the same load gave three warnings (`55P03`), and each of the
three later calls took about 200 ms.

## How to recognise it again

- The log has `funnel count dropped: 55P03` warnings, or a Funnel Count total
  is lower than the events it counts.
- Several write transactions stay open at once, and they bump the same key.
- A new counter or a new metric reuses one row for every writer.

Test any new shared counter with several open transactions on one connection
each. A test with one connection cannot show this defect.
