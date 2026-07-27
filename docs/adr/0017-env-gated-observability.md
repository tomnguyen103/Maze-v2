# 0017 — Env-gated observability with a shared serverless entry point

- Status: accepted
- Date: 2026-07-27
- Phase: enterprise hardening, phase 5

## Context

The plan called for structured logs with request correlation, health and
readiness endpoints, tracing, error tracking, and server-side product-event
forwarding. Three constraints shaped the implementation:

1. **The Vercel Hobby function ceiling is spent (12/12).** The plan's
   `api/health.js` and `api/ready.js` cannot exist as files; every new
   endpoint must share an existing function through a `vercel.json` rewrite.
2. **Serverless lifecycle.** No long-lived process, so anything initialised
   "once" must happen at module load of a function that every relevant
   request passes through.
3. **Privacy posture.** The product is kid-focused; logs and telemetry
   follow the same minimisation rules as storage (redacted error names, no
   query strings, no identities in analytics).

## Decision

- **One pino logger** (`server/logger.js`), serializers enforcing the
  `safe-error-log.js` redaction (error → class name only). The request
  middleware (`server/request-log.js`) assigns/propagates `x-request-id`,
  echoes it, and emits exactly one line per owned request. The id reaches
  audit rows through the existing `requestIdFrom(request)` header read —
  generating middleware + reading audit layer, no new plumbing.
- **Health endpoints live in the player API** (`server/health-route.js`),
  dispatched first in every branch of `createPlayerApi`, and reach Vercel via
  rewrites onto the `leaderboard` function with a validated `_healthRoute`
  parameter (the same attacker-controlled-rewrite discipline as
  `api/admin.js`). Liveness touches nothing; readiness names each dependency
  (`database` / `stripe` / `clerk`) as `ok` / `failed` / `unconfigured` and
  never echoes failure reasons.
- **Everything heavier is env-gated behind dynamic imports**:
  OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`), Sentry server
  (`SENTRY_DSN`), Sentry browser (`VITE_SENTRY_DSN`, lazy chunk, absent from
  the build when unset), PostHog forwarding (`POSTHOG_API_KEY`, plain
  `fetch`, no SDK). Unset variables mean the modules are never imported.
  `server/telemetry-bootstrap.js` is the first import of `player-api.js` so
  OTel instrumentation registers before `pg` loads.
- **PostHog receives only server-trusted events** (`lifetime_confirmation`,
  `run_access_decision`), after schema filtering, with a constant
  `distinct_id` — aggregate-only, matching the events' identity-free design.

## Consequences

- A guest-only deployment reports `/api/ready` 503 (`stripe`/`clerk`
  `unconfigured`) — readiness describes the full stack by design.
- Observability failures can never fail a request: init errors are swallowed
  with a redacted warning, PostHog delivery is fire-and-forget and bounded.
- Ad-hoc `console` paths whose exact behaviour existing tests pin
  (`logProviderFallback`, pool error listeners) stay on `console`; they
  already log only redacted names. New code logs through pino.
- Sentry source-map upload requires `@sentry/cli` or the Vercel integration,
  deliberately not a project dependency.

## What this does not do

- No tracing of the question provider's internals; spans cover http and pg.
- No log shipping — Vercel captures stdout; the JSON shape is what makes it
  queryable there or in any drain configured later.
