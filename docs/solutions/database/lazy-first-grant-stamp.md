---
title: Stamp the first Run Grant lazily instead of a backfill under migration locks
category: database
trigger: A migration adds a "first seen" column that a trigger needs for rows that already exist.
---

# Stamp the first Run Grant lazily instead of a backfill under migration locks

## Problem

Migration 0033 counts Personal Run activation once per Explorer. A trigger on
`run_access_grants` reads `player_access.first_run_grant_at` to decide whether a
Grant is the first. Current Explorers already hold Grants, so a null column
would count their next Grant as a new activation.

## What did not work

A full-table `UPDATE player_access` at the end of the migration. It takes a row
lock on every Explorer for the whole migration transaction. Every Run start
writes `player_access`, so play stops until the migration commits. A short
`lock_timeout` makes the migration fail instead.

## Root cause

The backfill tied a one-time data repair to the schema transaction. The data
repair is not needed before the first Grant of each Explorer.

## Fix

- The migration adds the column and the trigger only. It updates no row.
- `activate_personal_run()` stamps the column on the next Grant with the
  earliest Grant time of that Explorer.
- The trigger counts only when the stamp changed a row and no other Grant
  exists for that Explorer. An existing Explorer is stamped and not counted.
- The definer owner needs `SELECT` on `run_access_grants`. Migration 0033
  grants the three columns it reads.
