---
title: A late sign-in restores the end-card art of an earlier Run
category: frontend
trigger: A Daily or First Light result card shows the Sigil or Quest art after the player signs in from the demo gate.
---

## Problem

`runResultState` keeps the end-card state, so that `syncDemoAccountAction` can restore the art after a late sign-in.
Only `finishRun` set `runResultState`. `setSimpleResultCard` (First Light and Daily) wrote the dataset value but kept the old variable.
A guest finishes a Quest Labyrinth with a Sigil, then plays a Daily. The Daily card opens the demo gate, which clears the art. After the sign-in, the restore writes `sigil` on the Daily card.

## Root cause

Two writers kept one state in two places: the variable and `dataset.resultState`. One writer updated only the dataset.

## Fix

`setSimpleResultCard` sets `runResultState` first and writes the dataset from it (`src/main.js`).
`clearResultCard` still keeps the variable, because the demo-gate restore needs it.
The same change makes `saveRunRecord` use `finishedLabyrinthNumber`, so every field of the terminal record comes from the finished Run.

## Test

No repro test: the path needs a real sign-in that ends after a Quest card and a Daily card. The e2e harness has no sign-in fixture for that order.

## Check

When a variable mirrors a DOM value for a later restore, every writer sets the variable and derives the DOM value from it.
