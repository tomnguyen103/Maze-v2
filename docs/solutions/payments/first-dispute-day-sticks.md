---
title: A second dispute must keep the first dispute day of a Financial Fact
category: payments
trigger: A closed funnel period loses a dispute, or a dispute moves to a later day in the funnel export.
---

# A second dispute must keep the first dispute day of a Financial Fact

## Problem

A charge can be disputed, the dispute can be won, and a new dispute can open
later. `transitionFact` set `disputed_at = NOW()` on each dispute. The funnel
counts a dispute on its `disputed_at` day, so the second dispute moved the
dispute out of a period that was already closed and exported.

## Root cause

The update wrote the dispute time on every transition to `disputed`. It did
not treat the dispute day as a fact about the first dispute.

## Fix

The update writes `COALESCE(disputed_at, NOW())`, so the first dispute day
sticks. `lifetime_purchases.disputed_at` stays unchanged, because no report
reads it. ADR 0049 decision 8 states the rule. Tests:
`tests/financial-facts.test.js` (US-02.10) and
`tests/financial-facts-race.integration.test.js` (US-02.10).

## How to recognise it again

A report column that dates an event by a timestamp that a later event can
overwrite. Ask whether the period that holds the first event is closed.