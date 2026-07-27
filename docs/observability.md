# Observability

Everything here is env-gated: with none of the variables set, the game runs
exactly as before — no SDKs load, no network calls happen, no overhead.

## Structured logs

`server/logger.js` builds one pino JSON logger. Every request the player API
owns produces exactly one line on finish:

```json
{"level":30,"time":"…","request_id":"…","method":"POST","route":"/api/scores","status":201,"duration_ms":12,"msg":"request"}
```

- `request_id` honours a valid inbound `x-request-id`, otherwise a UUID is
  generated. The id is echoed in the `x-request-id` response header and lands
  in audit rows (`audit_events.request_id`) with no route-level plumbing.
- The route field is the pathname only — query strings can carry
  player-entered content and never reach a log line.
- Anything error-shaped is redacted to `{ "name": "Error" | "UnknownError" }`
  (the `safe-error-log.js` semantics, now enforced by pino serializers).
- `LOG_LEVEL` (default `info`) controls verbosity.

## Health and readiness

Both are served by the player API and reach Vercel through rewrites onto the
`leaderboard` function (the project sits at the 12-function Hobby ceiling —
never add an `api/` file for a new endpoint).

- `GET /api/health` — liveness. Always 200 `{ status: "ok", version }`;
  touches no dependency. `version` is the short `VERCEL_GIT_COMMIT_SHA`
  (`dev` locally).
- `GET /api/ready` — readiness. Runs `SELECT 1`, checks Stripe and Clerk key
  presence, and answers 200 `{ status: "ready", checks }` or 503 with
  per-check `ok` / `failed` / `unconfigured` detail. Failure reasons are
  deliberately not echoed — the per-check status is all an operator needs
  from an unauthenticated endpoint.

## Tracing

`server/tracing.js` starts the OpenTelemetry Node SDK **only when**
`OTEL_EXPORTER_OTLP_ENDPOINT` is set, with http and pg auto-instrumentation,
exporting OTLP/HTTP. For Grafana Cloud set:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64 instance:token>
```

Initialisation happens in `server/telemetry-bootstrap.js`, the first import
of `server/player-api.js`, so instrumentation registers before `pg` loads.
`pg` is a CommonJS package, which the require hook patches; if a future
pure-ESM dependency needs spans, register the loader hook explicitly
(`NODE_OPTIONS=--import @opentelemetry/instrumentation/hook.mjs`).

## Error tracking

- Server: `server/error-tracking.js` initialises `@sentry/node` when
  `SENTRY_DSN` is set. Release = `VERCEL_GIT_COMMIT_SHA`, environment =
  `VERCEL_ENV`, `sendDefaultPii: false`.
- Browser: `src/error-reporting.js` (`@sentry/browser`) loads lazily and only
  when `VITE_SENTRY_DSN` was set at build time; unset, the chunk does not
  exist and the bundle budget is untouched (`SKIP optional Sentry`).
  Optional `VITE_SENTRY_RELEASE` tags the release.
- Both sides share `shared/telemetry-scrub.js` as `beforeSend`: the user is
  reduced to their id; request headers, cookies, bodies, and query strings
  are stripped.
- Source maps are already emitted to `dist/`; uploading them to Sentry needs
  `@sentry/cli` (or the Vercel Sentry integration), which is not a project
  dependency — use the integration, or run sentry-cli in your own shell.

## Product events to PostHog

`server/product-events.js` forwards **server-trusted** events only —
`lifetime_confirmation` and `run_access_decision` — to PostHog when
`POSTHOG_API_KEY` is set (`POSTHOG_HOST` overrides the US default). The
forwarder sees events after schema filtering, so identities can never travel;
delivery is fire-and-forget with a 3s bound and can never fail a request.

## Environment variables

| Variable | Effect when set |
|---|---|
| `LOG_LEVEL` | pino level (default `info`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | enables tracing, OTLP/HTTP export |
| `OTEL_EXPORTER_OTLP_HEADERS` | exporter auth headers |
| `SENTRY_DSN` | enables server error tracking |
| `VITE_SENTRY_DSN` | build-time: enables the browser Sentry chunk |
| `VITE_SENTRY_RELEASE` | build-time: browser release tag |
| `POSTHOG_API_KEY` | enables server-side product-event forwarding |
| `POSTHOG_HOST` | PostHog instance (default `https://us.i.posthog.com`) |

## Alert suggestions

- `/api/ready` returning 503 for more than 5 minutes.
- Sentry: any event with release ≠ latest deploy (stale function version).
- Log-based: `status >= 500` rate over 1% of requests; `duration_ms` p95
  above 2s on `/api/question`.
- PostHog: `lifetime_confirmation` with `outcome: "unlinked"` (paid but not
  activated) — the retry cron should clear these within a day.
