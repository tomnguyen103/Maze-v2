---
title: A late sign-in restores the end-card art of an earlier Run
category: frontend
trigger: The demo gate shows Sigil, Gate, or defeat art from an older Run after the player signs in.
---

## Problem

`runResultState` keeps the end-card state, so that `syncDemoAccountAction` can restore the art after a late sign-in.
Only `finishRun` set `runResultState`, and no code cleared it.
A guest finishes a Quest Labyrinth with a Sigil and closes the card. The next start attempt opens the demo gate, and `clearResultCard` removes the art. After the sign-in, the restore writes `sigil` on a gate that is not the card of that Run.
The same thing happens after First Light: its `gate` or `defeat` art comes back on the start gate.
`setSimpleResultCard` (First Light and Daily) also wrote the dataset value but kept the old variable.

## Root cause

Two writers kept one state in two places: the variable and `dataset.resultState`. One writer updated only the dataset, and no writer cleared the variable when its Run ended.

## Fix

All changes are in `src/main.js`:
- `setSimpleResultCard` sets `runResultState` first and writes the dataset from it.
- `startRun` and `startFirstLight` set `runResultState` to `null`.
- `showDemoAccountGate` sets `runResultState` to `null` when no end card is open.
- `clearResultCard` still keeps the variable, because the demo-gate restore on an open end card needs it.
- `saveRunRecord` uses `finishedLabyrinthNumber`, so the Labyrinth number of the terminal record comes from the finished Run.

## Test

No repro test: the path needs a real sign-in after a guest Run ends and a second start attempt. The e2e harness has no sign-in fixture for that order.

## Check

When a variable mirrors a DOM value for a later restore, every writer sets the variable and derives the DOM value from it. The variable is cleared when the thing it describes ends.
