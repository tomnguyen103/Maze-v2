# Performance budget

Echo Maze keeps the landing route and deterministic game small even though
Clerk is an optional, dynamically loaded account dependency.

## Local release budget

Run `npm run build` followed by `npm run check:bundle`.

| Asset | 2026-07-29 Milestone 1 baseline | Budget |
|---|---:|---:|
| Landing JavaScript | 7.56 KB gzip | 8 KB gzip |
| Game JavaScript | 28.57 KB gzip | 30 KB gzip |
| Shared styles | 10.41 KB gzip | 12 KB gzip |
| Optional Clerk chunk | 544.21 KB gzip | 600 KB gzip |
| Admin JavaScript | 5.78 KB gzip | 20 KB gzip |
| Optional Sentry chunk | Not built (DSN unset) | 120 KB gzip |

Campfire Resume ships as an independently enforced lazy chunk. The 2026-07-29
Milestone 1 implementation measures 3.20 KB gzip against a 5 KB gzip ceiling;
it is not fetched by the landing page, First Light, or Verified Daily. The
existing landing, game, style, Clerk, admin, and Sentry ceilings above remain
unchanged.

The Clerk and Sentry budgets are tracked separately because they are optional,
dynamically loaded dependencies. A Clerk outage must degrade to Guest play and
cannot block the landing or deterministic Run bundle. With no Sentry DSN, the
production build emits no Sentry chunk; its unchanged ceiling still applies to
configured builds.

The project also occupies all 12 Vercel Hobby function slots. New endpoints
must reuse an existing function through a validated rewrite; adding a
thirteenth function is not allowed.

Budget changes require a measured reason in the pull request. Milestone 1 may
not raise a budget as a workaround. The checks are local release gates; GitHub
Actions remain disabled.
