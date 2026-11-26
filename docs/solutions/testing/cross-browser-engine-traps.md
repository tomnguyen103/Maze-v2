---
title: Engine traps found when the e2e suite first ran in Firefox and WebKit
category: testing
date: 2026-11-25
trigger: "e2e green in Chromium, red in Firefox, WebKit, or iPhone 14"
delete: none — each trap is an engine difference; the matrix projects in playwright.config.mjs catch a new one
---

# Engine traps found when the e2e suite first ran in Firefox and WebKit

Run `npm run test:e2e:xbrowser` before a merge that changes layout, focus, headers, or
chunking. Each trap below is fixed or named in a code comment.

## App bugs (fixed in app code)

- **Board not square in WebKit.** A percent height on the canvas resolved against an
  indefinite parent. `#maze-canvas` in `src/daylight.css:522` takes `height: auto` and
  `aspect-ratio: 1`.
- **First header tabs out of reach.** `justify-content: flex-end` on an overflowing row
  pushes the start past the left edge, where no scroll reaches. The row uses
  `safe flex-end` (`src/daylight.css:238`).
- **Focus not returned after Daily closes (WebKit).** WebKit does not focus a clicked
  button, and it does not return focus to the opener when a modal dialog closes.
  `openDailyDialog(opener)` at `src/main.js:2219` keeps the opener, and `closeDailyDialog` (`src/main.js:2523`)
  focuses it.
- **Unused preload of the entry chunk.** A dynamic-import preload map named the HTML
  entry chunk. `vite.config.mjs:17` filters `assets/index-` out, and
  `scripts/check-bundle-budget.mjs:148` fails a build whose preload map names it.
- **Atlas Center Current miss (Firefox).** See
  `docs/solutions/frontend/firefox-scroll-clamp-after-transform-pan.md`.

## Test-side engine limits (named in comments)

- Firefox rejects the `_cfuvid` cookie of the Clerk dev host. A console filter sits
  next to the other Clerk filters.
- WebKit 27 warns about missing COEP. The app sends COOP without COEP on purpose.
- WebKit Tab skips links unless a Safari setting is on, and Playwright cannot set it.
  The skip-link test focuses the link in WebKit.
- Playwright's Windows WebKit has no Web Audio, so the audio toggle stays off.
- Playwright Firefox drops `emulateMedia` colour scheme when COOP swaps the browsing
  context group. The test applies it again on the loaded page.
- `locator.dispatchEvent` with a touch PointerEvent crashes the Firefox page. The page
  builds the event itself.
- Browsers fetch a failed preload again before `import()`, so the Atlas and Region
  retry tests fail every request until the first start settles.
- Firefox float noise and WebKit subpixel rounding: compare to 0.005 px or allow 1 px.
