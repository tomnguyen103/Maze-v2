---
title: Signed-player e2e tests need the e2e build
category: testing
trigger: "expected \"Moss Runner\", received \"Guest\""
---

# Signed-player e2e tests need the e2e build

## Problem

After a plain `npm run build`, a direct `npx playwright test` failed every
signed-player test. The header showed "Guest" instead of the test player.

## What did not work

Reading the failures as a header regression. The markup was correct.

## Root cause

The signed-player hook only exists in a `vite build --mode e2e` bundle.
Playwright serves whatever is in `dist/`, so a plain build silently drops the hook.

## Fix

Run `npm run test:e2e` (`package.json:17`), which builds in e2e mode first. For a
focused run, build with `npx vite build --mode e2e` before `npx playwright test`.
Stop any manual preview server on port 4173 first, because `PW_REUSE_SERVER=1`
reuses it (`playwright.config.mjs:51`).
