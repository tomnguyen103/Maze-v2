---
title: Not now on every Lifetime return must enter the Run
category: frontend
trigger: The Lifetime dialog closes on a Checkout return and the page shows no Run and no Practice Intention choice.
---

# Not now on every Lifetime return must enter the Run

## Problem

`resolveLifetimeReturn` shows the Lifetime dialog and returns `false`, so the
Run entry stops. Only the `membership=open` branch added a close listener that
entered the Run. A canceled Checkout, an invalid return and a failed confirm
showed the dialog with no listener, so "Not now" left an empty page.

## Root cause

Each return branch owned its own exit. The close handler lived inside one
branch, so the other branches did not get it.

## Fix

`enterRunOnLifetimeClose` in `src/main.js` serves all four branches. The close
removes the Checkout parameters, so the Run entry does not retry a failed
confirm. A close that already resumed the saved Run starts nothing more.
`tests/e2e/game.spec.js` (US-03.5) covers the canceled, invalid and failed
confirm returns on desktop and mobile.

## How to recognise it again

A function returns `false` to stop a flow and shows a dialog. Check that every
branch that does so also gives the dialog a way back into the flow.