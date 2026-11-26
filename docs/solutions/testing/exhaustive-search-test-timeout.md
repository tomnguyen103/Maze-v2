---
title: The real engine soft-lock search timed out under the pre-push gate
category: testing
trigger: "Test timed out in 120000ms" in tests/no-soft-lock.test.js US-01.1 cross-check
escaped: 8fd5e15
should-catch: test
---

# The real engine soft-lock search timed out under the pre-push gate

## Problem

PR #283 added Pulse to the `engineTrap` search and the Pulse count to its state
key. The classic-v1 cross-check then timed out at 120 s in the pre-push gate.
It passed alone and in one full `npm run check`, so the failure was load
dependent.

## Root cause

Each Pulse count copies every state in the search. In a Labyrinth with no Tide
Doors, a Pulse changes only the Pulse count, the move count, and Warden
positions. The search removes Wardens and leaves the move count out of the key,
so these copies open no new path.

## Fix

- `engineTrap` expands Pulse only when the Run has Tide Doors, where a Pulse
  turns the Tide.
- The cross-check timeout is 300 s. The search is exhaustive, and
  tide-doors-v1 takes about 50 s alone.

## Lesson

An exhaustive search test needs a timeout with room for the full gate load.
Measure each case alone with `--reporter=verbose` before you set the timeout.
Expand an action only where it can change a field in the state key.
