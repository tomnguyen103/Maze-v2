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

The window is fixed rather than sliding. Two consequences, both intended and both
covered by tests:

- A full budget is spendable instantly at the start of a window. That *is* the
  "with burst" the plan asks for — normal play is bursty, and a limiter that
  smoothed it would reject legitimate traffic.
- Up to two budgets' worth can cross a boundary. Accepted: these limits protect
  the database and the question provider, they are not a fairness mechanism, and
  a sliding window costs either a second table or a read-modify-write.

The count resets only when the stored window is strictly **older** than the
incoming one, and `window_start` is written as `GREATEST(stored, incoming)`. A
naive "reset whenever the window differs" is a repeatable bypass: a request
delayed across a boundary — pool saturation, or a container whose clock lags —
rewinds a fresh window back to 1 and hands out a second budget. `Retry-After` is
likewise derived from the window the row *settled* on, not the one the request
computed before awaiting.

Three deliberate failure choices:

- **Fail open.** If the counter store is unreachable the request is admitted and
  the decision is marked `degraded`. Rate limiting must never be the reason a
  child cannot play.
- **Admit unidentifiable callers.** With neither a user id nor an address hash
  there is no honest key. One shared bucket would let a single abuser lock out
  every other anonymous caller, which is worse than not metering them.

  This is why the guest address salt has a **default** rather than being
  optional. A salt configured only sometimes would leave guests unmetered in
  every default deployment, which would make the acceptance criterion vacuous.
  The default is derived from `DATABASE_URL` — already a server-only secret with
  exactly the right lifetime, stable across warm containers so one address lands
  in one bucket. `REQUEST_ADDRESS_SALT` overrides it.
- **Never meter `lifetime-confirm`.** A paid Explorer must always be able to
  finish activating their membership. Only checkout *creation* is metered.

The in-process question throttle stays, unchanged, as a first line in front of
the per-caller budget. The two limits answer different questions: "is this
container overloading the provider?" and "is this caller over their share?"

`GET /api/question` is unauthenticated by design — guests play without an
account — so no Clerk user id exists there and it is metered by address hash for
everyone, signed in or not. The consequence is real: a classroom behind one NAT
shares one 30/min budget. Phase 8 introduces classrooms and is where that budget
should be revisited; raising it now, before there is a tenant concept to raise it
*for*, would just weaken the limit.

Rejections are `429` with `Retry-After` and a matching `retryAfter` body field,
and are recorded as `rate_limit_hit` product events — high volume, so a product
event rather than an audit row, and carrying `budget` and `scope` but no caller
identity.

### Security headers

One `server/security-headers.js` builds the header set, and every path that
serves the app uses it: local Express, the Vite dev server, and the Vite preview
server the Playwright suite drives. `vercel.json` mirrors the same values for
assets served by Vercel's edge, which never reach our code.

Our own markup and CSS carry no inline script and no inline style, so
`script-src` needs neither `'unsafe-inline'` nor a nonce, and tests assert that
for every configuration. Adding one inline script would mean weakening the
policy — that is the tradeoff to refuse later.

`style-src` is the one concession. Clerk's UI bundle injects its own `<style>` at
runtime, so `'unsafe-inline'` is added to `style-src` — and only to `style-src` —
once a Clerk host is configured; `https://clerk-telemetry.com` joins
`connect-src` on the same condition. A guest-only deployment with no Clerk key
keeps the stricter policy. Inline *style* cannot execute script, so this is a far
smaller concession than the alternative of not supporting sign-in.

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
- `vercel.json` is a hand-maintained copy, so `tests/security-headers.test.js`
  parses it and asserts the directive names match and every non-Clerk-bearing
  directive is identical to the computed policy. The Clerk-bearing directives
  differ on purpose: the edge cannot decode the publishable key, so it uses
  wildcards where the middleware uses the exact host.
- The Clerk sign-in surface is not covered end-to-end, because the Playwright run
  has no Clerk keys. The e2e suite proves the guest surface loads with zero CSP
  violations, and unit tests assert the Clerk-configured policy contains
  everything `src/player/clerk-browser.js` needs. **A keyed environment must
  re-verify sign-in and Checkout once before this is trusted in production.**
- `getDatabasePool` now memoizes one pool per connection string, so the limiter
  and the player API share connections instead of opening two pools per warm
  container.
- `TRUST_PROXY_HEADERS` gates `x-forwarded-for`. Unset, the socket address is
  hashed, because a client that can set its own forwarded address can pick which
  budget to spend.
