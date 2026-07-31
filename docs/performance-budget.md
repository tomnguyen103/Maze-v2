# Performance budget

Echo Maze keeps the landing route and deterministic game small even though
Clerk is an optional, dynamically loaded account dependency.

## Local release budget

Run `npm run build` followed by `npm run check:bundle`.

| Asset | 2026-07-29 Milestone 1 baseline | Budget |
|---|---:|---:|
| Landing JavaScript | 7.60 KB gzip | 8 KB gzip |
| Game JavaScript | 27.06 KB gzip | 30 KB gzip |
| Shared styles | 10.76 KB gzip | 12 KB gzip |
| Optional Clerk chunk | 544.21 KB gzip | 600 KB gzip |
| Admin JavaScript | 5.78 KB gzip | 20 KB gzip |
| Optional Sentry chunk | Not built (DSN unset) | 120 KB gzip |

Campfire Resume ships as an independently enforced lazy chunk. The 2026-07-29
Milestone 1 implementation measures 3.64 KB gzip against a 5 KB gzip ceiling;
it is not fetched by the landing page, First Light, or Verified Daily. The
existing landing, game, style, Clerk, admin, and Sentry ceilings above remain
unchanged.

Quest Progress validation ships as a lazy import from the landing route, so
Learning Deck identity stays out of the landing bundle. It counts against the
landing ceiling only when fetched; the measured landing figure above already
excludes it, and a failed fetch leaves the call to action at "Enter the Maze".

The Clerk and Sentry budgets are tracked separately because they are optional,
dynamically loaded dependencies. A Clerk outage must degrade to Guest play and
cannot block the landing or deterministic Run bundle. With no Sentry DSN, the
production build emits no Sentry chunk; its unchanged ceiling still applies to
configured builds.

Milestone 5 moved two more modules into lazy chunks with their own ceilings.
The Lantern Journal continuity module (1.53 KB gzip against 3 KB) left the game
chunk because that chunk had reached 30.00 KB against its 30 KB ceiling and the
milestone needed real headroom; the Daily Trail Constellation surface (0.59 KB
gzip against 2 KB) is post-escape only and never loads for an Explorer who has
not finished today's Daily. The game chunk measures 29.26 KB gzip after both,
so it remains within 0.74 KB of its unchanged ceiling — the next feature to
touch `src/main.js` should expect to pay for its bytes by extraction.

The project also occupies all 12 Vercel Hobby function slots. New endpoints
must reuse an existing function through a validated rewrite; adding a
thirteenth function is not allowed. `tests/vercel-functions.test.js` derives
the Daily rewrite set from `DAILY_PATHS`, so a Daily endpoint added to the
handler without a rewrite fails the gate rather than 404ing in production.

Budget changes require a measured reason in the pull request. Milestone 1 may
not raise a budget as a workaround. The checks are local release gates; GitHub
Actions remain disabled.
