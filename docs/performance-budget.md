# Performance budget

Echo Maze keeps the landing route and deterministic game small even though
Clerk is an optional, dynamically loaded account dependency.

## Local release budget

Run `npm run build` followed by `npm run check:bundle`.

| Asset | 2026-07-25 baseline | Budget |
|---|---:|---:|
| Landing JavaScript | 5.79 KB gzip | 8 KB gzip |
| Game JavaScript | 24.39 KB gzip | 30 KB gzip |
| Shared styles | 7.92 KB gzip | 12 KB gzip |
| Optional Clerk chunk | 544.21 KB gzip | 600 KB gzip |

The Clerk budget is tracked separately because it is loaded only at the
account boundary. A Clerk outage must degrade to Guest play and cannot block
the landing or deterministic Run bundle.

Budget changes require a measured reason in the pull request. The check is a
local release gate; GitHub Actions remain disabled.
