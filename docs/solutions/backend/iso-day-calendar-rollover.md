---
title: Date.parse accepts a day the calendar lacks
category: backend
trigger: An API takes a YYYY-MM-DD date and checks it with Date.parse or new Date.
---

# Date.parse accepts a day the calendar lacks

## Problem

The admin funnel export takes `from` and `to` as `YYYY-MM-DD`. A regex and
`Date.parse` accepted `2026-02-30`. Node 22 reads that day as 2026-03-02, so the
range moved by two days without an error.

## What did not work

A `Number.isNaN(Date.parse(value))` check. V8 rejects a day above 31 or a month
above 12. It rolls days 29 to 31 of a short month into the next month.

## Root cause

V8 normalises an out-of-range day inside the 1 to 31 range. The parse succeeds
and returns a different date.

## Fix

Round-trip the value: `new Date(value).toISOString().slice(0, 10) === value`.
The admin route rejects the request with 400 when the round trip differs
(`isoDay` in server/admin-route.js).
