# 14. Serverless rate limits and strict security headers

Date: 2026-07-26

## Status

Accepted

## Context

Two abuse surfaces were unguarded.

The only rate limit was `createQuestionRateLimiter` in `server/question-route.js`:
an in-process counter. On Vercel every function invocation may land in a
different container, so that counter caps what one warm instance sends the
question provider and nothing else. One Explorer could exhaust the provider
budget, hammer score submission, or create unbounded Stripe Checkout Sessions.

The app also shipped no security headers. No CSP, so any injected markup could
load and run remote script; no `Referrer-Policy`, so full URLs leaked
cross-origin; no `Permissions-Policy`, so a compromised page could ask for the
camera of a child playing a maze game.

## Decision

### Rate limiting

A Postgres fixed-window counter, `rate_limit_counters(key, window_start, count)`,
incremented by one `INSERT ... ON CONFLICT DO UPDATE`. The upsert resets the
count when `window_start` differs, so a window rollover and an increment are the
same statement — no transaction, no read-modify-write race, no in-memory state.

Keys are `budget:user:<clerk id>` for signed-in callers and
`budget:ip:<address hash>` for guests. Signed-in callers are metered per account
so one household's shared address is not a shared budget.

The window is fixed rather than sliding, which admits up to two budgets' worth of
traffic across a boundary. That is accepted: these limits protect the database and
the question provider, they are not a fairness mechanism, and a sliding window
costs either a second table or a read-modify-write.

Three deliberate failure choices:

- **Fail open.** If the counter store is unreachable the request is admitted and
  the decision is marked `degraded`. Rate limiting must never be the reason a
  child cannot play.
- **Admit unidentifiable callers.** With neither a user id nor an address hash
  there is no honest key. One shared bucket would let a single abuser lock out
  every other anonymous caller, which is worse than not metering them.
- **Never meter `lifetime-confirm`.** A paid Explorer must always be able to
  finish activating their membership. Only checkout *creation* is metered.

The in-process question throttle stays, unchanged, as a first line in front of
the per-caller budget. The two limits answer different questions: "is this
instance overloading the provider?" and "is this caller over their share?"

Rejections are `429` with `Retry-After` and a matching `retryAfter` body field,
and are recorded as `rate_limit_hit` product events — high volume, so a product
event rather than an audit row, and carrying `budget` and `scope` but no caller
identity.

### Security headers

One `server/security-headers.js` builds the header set, and every path that
serves the app uses it: local Express, the Vite dev server, and the Vite preview
server the Playwright suite drives. `vercel.json` mirrors the same values for
assets served by Vercel's edge, which never reach our code.

The app has no inline script and no inline style, so the policy needs neither
`'unsafe-inline'` nor a nonce, and tests assert both strings stay absent. Adding
one inline script would mean weakening the policy — that is the tradeoff to
refuse later.

The Clerk host is not hardcoded. Clerk publishable keys carry their instance host
base64-encoded in the third segment, which is exactly what
`src/player/clerk-browser.js` decodes to load the optional Clerk UI bundle, so
`clerkHostFromPublishableKey` derives the same host server-side. With no key
configured, the policy contains no Clerk origin at all.

Stripe-hosted Checkout is reached by redirect, so it appears in `form-action`
only — never `script-src`.

HSTS and `upgrade-insecure-requests` are production-only; over plain local HTTP
they are pointless and would break the dev server.

## Consequences

- Every metered endpoint answers `429` with `Retry-After` past its budget, and
  the e2e suite proves normal play never reaches one.
- Guest counter rows accumulate as address hashes rotate daily. They are
  unreachable rather than live state; `npm run prune:rate-limits` removes them,
  and phase 4's cron endpoint is the natural place to call it on a schedule.
- A production Clerk custom domain is not covered by `vercel.json`'s
  `https://*.clerk.com` wildcard and must be added there explicitly. Documented
  in `docs/security-headers.md`.
- `getDatabasePool` now memoizes one pool per connection string, so the limiter
  and the player API share connections instead of opening two pools per warm
  container.
- `TRUST_PROXY_HEADERS` gates `x-forwarded-for`. Unset, the socket address is
  hashed, because a client that can set its own forwarded address can pick which
  budget to spend.
