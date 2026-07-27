# Security headers and rate limits

Header values live in one place, `server/security-headers.js`, and are applied by
every path that serves the app:

| Surface | Applied by |
|---|---|
| `npm start` (local Express) | `createSecurityHeadersMiddleware()` in `server.js` |
| `npm run dev` (Vite dev) | same middleware, via `configureServer` |
| `npm run preview` (what Playwright drives) | same middleware, via `configurePreviewServer` |
| Vercel static assets and functions | `vercel.json` `headers`, mirroring the same values |

`vercel.json` is a copy rather than a computation because Vercel's edge serves
built assets without running our code. **If you change a directive, change it in
both places.** `tests/security-headers.test.js` covers the module and
`tests/e2e/security-headers.spec.js` asserts the served response.

## Checklist

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Blocks injected and remote script |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing into script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No full-URL leak cross-origin |
| `X-Frame-Options` | `DENY` | Clickjacking, for pre-CSP3 browsers |
| `Cross-Origin-Opener-Policy` | `same-origin` | Severs opener from popups |
| `Permissions-Policy` | every feature `=()` | The game needs no device access |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Production only |

`Strict-Transport-Security` and `upgrade-insecure-requests` are emitted only when
`NODE_ENV=production` or `VERCEL_ENV=production`. Sending them over plain local
HTTP is pointless and breaks the dev server.

## Content Security Policy

```
default-src 'self';
base-uri 'none';
object-src 'none';
frame-ancestors 'none';
form-action 'self' https://checkout.stripe.com;
script-src 'self' <clerk host>;
style-src 'self';
font-src 'self';
img-src 'self' data: https://img.clerk.com;
connect-src 'self' <clerk host>;
worker-src 'self' blob:;
frame-src 'self' <clerk host> https://challenges.cloudflare.com;
manifest-src 'self';
upgrade-insecure-requests            (production only)
```

Notes on each non-obvious entry:

- **No `'unsafe-inline'`, no `'unsafe-eval'`, no nonce.** The app has no inline
  `<script>` and no inline `style`, and fonts are bundled through
  `@fontsource-variable`. Tests assert both unsafe keywords stay absent. Adding
  an inline script means weakening this policy — don't.
- **`<clerk host>`** is derived at runtime from the publishable key, whose third
  underscore-separated segment is the base64 instance host. This is the same
  value `src/player/clerk-browser.js` decodes to load the optional Clerk UI
  bundle from `https://<host>/npm/@clerk/ui@1/dist/ui.browser.js`. With no key
  configured, no Clerk origin appears in the policy at all.
- **`worker-src blob:`** — Clerk runs helpers in blob workers.
- **`challenges.cloudflare.com`** — Clerk bot protection, framed, and only listed
  when a Clerk host is configured.
- **Stripe appears in `form-action` only.** Checkout is reached by redirect; no
  Stripe script is loaded, so `script-src` must not list it.

### Deploying a Clerk custom domain

`vercel.json` allows `https://*.clerk.accounts.dev` (development instances) and
`https://*.clerk.com`. A production Clerk **custom domain** lives on your own
domain — `clerk.yourapp.com` — which neither wildcard matches. Add that exact
host to `script-src`, `connect-src`, and `frame-src` in `vercel.json` when you
configure one, or sign-in will be blocked.

## Rate limits

Postgres-backed fixed windows in `rate_limit_counters`
(`db/migrations/0007_rate_limit_counters.sql`), incremented by one atomic upsert
so the limits hold across serverless invocations.

| Budget | Allowance | Endpoint |
|---|---|---|
| `question.fetch` | 30 / min | `GET /api/question` |
| `score.submit` | 10 / min | `POST /api/scores` |
| `profile.write` | 10 / min | `PUT /api/profile` |
| `lifetime.checkout` | 5 / min | `POST /api/lifetime-checkout` |
| `export.self` | 2 / hour | `GET /api/me/export` (phase 6) |

Keys are `budget:user:<clerk id>` when signed in and `budget:ip:<address hash>`
for guests — a daily-rotating hash, never a raw address.

Rejections answer `429` with `Retry-After` (seconds) and a matching `retryAfter`
body field, and emit a `rate_limit_hit` product event carrying `budget` and
`scope` but no caller identity.

Deliberately **not** metered:

- `POST /api/lifetime-confirm` — a paid Explorer must always be able to finish
  activating their membership. Only checkout creation is metered.
- Reads: profile, leaderboard, Run Access, Journal, Quest Progress.
- Webhooks, which are signature-verified instead.

### Failure behaviour

The limiter **fails open**. An unreachable counter store admits the request and
marks the decision `degraded`. Rate limiting must never be why a child cannot
play. A caller with neither a user id nor an address hash is also admitted — one
shared bucket for every anonymous caller would let a single abuser lock out all
the others.

### Maintenance

```bash
npm run prune:rate-limits
```

Guest keys stop being reachable once their address hash rotates, so yesterday's
rows are dead weight rather than state. Needs `DATABASE_URL`. Takes
`--older-than-hours` (default 24).

### Environment

- `TRUST_PROXY_HEADERS=true` — honour `x-forwarded-for`. Set this on Vercel,
  where the platform rewrites it. Unset, the socket address is used, because a
  client that can set its own forwarded address can choose which budget to spend.
- `REQUEST_ADDRESS_SALT` — salt for the guest address hash. Unset means guests
  are not identifiable, so they are admitted unmetered; signed-in budgets still
  apply.
