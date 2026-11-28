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

The signed-player seam (`__echoMazePlayerDependencies`) only exists in a
`vite build --mode e2e` bundle. Without the seam the app falls back to real Clerk
(`src/player/player-controller.js:92`). Playwright used to serve whatever was in
`dist/`, so a plain build silently dropped the seam.

## Fix

The Playwright web server now builds the e2e bundle into `dist-e2e/` and previews
that directory (`playwright.config.mjs:51`). A direct `npx playwright test`
therefore always serves the e2e bundle, and `dist/` keeps the production build
(B-142). The `test:e2e` scripts (`package.json:17`) no longer build first.
`PW_REUSE_SERVER=1` reuses a server on port 4173 and skips the build
(`playwright.config.mjs:60`), so use it only with a preview of `dist-e2e` that you
started yourself. `npm run test:e2e` runs the Chromium projects;
`npm run test:e2e:xbrowser` runs Firefox, WebKit, and iPhone 14.

## Recurrence

On 2026-11-28 a direct `npx playwright test` after `npm run build` failed 80 tests
across 5 projects. The production bundle had no seam, so the signed-player tests
saw "Guest", and real Clerk printed its development-key warning into the console
checks. Only 2 of the 80 failures were real (see `canvas-frame-not-canvas-in-e2e.md`).

delete: the separate build step in `test:e2e`, which a direct Playwright run skipped.
