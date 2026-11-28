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

The Playwright web server now builds the e2e bundle before it starts the preview
(`playwright.config.mjs:50`). A direct `npx playwright test` therefore always
serves the e2e bundle, and `npm run test:e2e` (`package.json:17`) no longer builds
first. Stop any manual preview server on port 4173 first, because
`PW_REUSE_SERVER=1` reuses it and skips the build (`playwright.config.mjs:59`).
`npm run test:e2e` runs the Chromium projects; `npm run test:e2e:xbrowser` runs Firefox, WebKit, and iPhone 14.

## Recurrence

On 2026-11-28 a direct `npx playwright test` after `npm run build` failed 80 tests
across 5 projects. The production bundle loaded the real Clerk development key from
`.env.local`, so the console checks also saw the Clerk development-key warning.
Only 2 of the 80 failures were real (see `canvas-frame-not-canvas-in-e2e.md`).

delete: the separate build step in `test:e2e`, which a direct Playwright run skipped.
