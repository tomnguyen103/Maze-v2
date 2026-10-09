---
title: A `\b` in a template-literal RegExp makes a SQL guard test vacuous
category: testing
trigger: A "never writes table X" mock test stays green after the code writes table X.
---

# A `\b` in a template-literal RegExp makes a SQL guard test vacuous

## Problem

The US-03.3 test checks that a refund for a deleted account never writes
`player_access`, `players` or `lifetime_purchases`. It built its pattern as
`` new RegExp(`(INSERT INTO|UPDATE) ${table}\b`) ``. The test passed whether or
not the code wrote those tables. The audit found it, not a failing run.

## What did not work

A plain substring check for `UPDATE` also fails, in the other direction. The
row lock `SELECT ... FOR UPDATE` contains `UPDATE`, so a check for "no UPDATE"
fails on a read.

## Root cause

In a template literal, `\b` is the backspace character (U+0008), not a regex
word boundary. The pattern looks for a backspace after the table name, so it
never matches real SQL.

## Fix

- Escape the backslash in a template literal: `` `${table}\\b` `` gives the
  regex `\b` (tests/lifetime-store.test.js:259).
- Match the full statement head, such as `UPDATE financial_facts`, not the bare
  keyword (tests/lifetime-store.test.js:238).
- Before you trust a negative guard test, make the code break the rule once and
  see the test fail.
