# Setup

Setup, deployment, operations, and validation instructions for Echo Maze,
preserved from the root README.

## Run locally

Requires Node.js 22 or newer. Local development defaults to Ollama with
`mistral:latest`:

```bash
npm install
ollama pull mistral:latest
npm run dev
```

The Ollama CLI may also be installed separately; if Ollama or the model is not
available, the game automatically uses its bundled question deck. Open
`http://localhost:3000`.

For `npm run dev`, copy `.env.example` to `.env.local` to configure Clerk and
Neon. `npm start` reads environment variables supplied by the shell or hosting
platform instead. The browser receives only `VITE_CLERK_PUBLISHABLE_KEY`;
server secrets and database credentials stay server-side.

## Deploy

Production defaults to Gemini 3.5 Flash-Lite when `GEMINI_API_KEY` is set. The
Express server owns the key, rate-limits and caches requests, and validates
structured model output. Child-facing output must match a reviewed curriculum
card exactly; changed or unsafe output falls back to the bundled deck.

```bash
npm run build
npm start
```

For Vercel, connect the Neon project and apply the migrations in order:

1. `db/migrations/0001_players_and_scores.sql`
2. `db/migrations/0002_run_access.sql`
3. `db/migrations/0003_lifetime_membership.sql`
4. `db/migrations/0004_cloud_quest_progress.sql`
5. `db/migrations/0005_lantern_journal.sql`
6. `db/migrations/0006_audit_events.sql`
7. `db/migrations/0007_rate_limit_counters.sql`
8. `db/migrations/0008_user_roles.sql`
9. `db/migrations/0009_webhook_inbox.sql`
10. `db/migrations/0010_question_bank.sql`
11. `db/migrations/0011_explorer_access_settings.sql`

Then set:

```text
DATABASE_URL=your-neon-pooled-connection-string
VITE_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
CLERK_WEBHOOK_SIGNING_SECRET=your-clerk-webhook-signing-secret
RUN_ACCESS_ENFORCEMENT_ENABLED=false
STRIPE_SECRET_KEY=your-stripe-test-secret-key
STRIPE_PRICE_ID=your-599-usd-one-time-test-price-id
STRIPE_WEBHOOK_SECRET=your-stripe-test-webhook-secret
ECHO_MAZE_APP_ORIGIN=https://your-app.example
TRUST_PROXY_HEADERS=true
REQUEST_ADDRESS_SALT=your-random-address-salt
CRON_SECRET=your-random-cron-secret
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

### Operations scripts

```bash
npm run verify:audit                    # recompute the audit_events hash chain
npm run prune:rate-limits               # drop rate-limit counters whose window has closed
npm run grant:admin -- <clerk-user-id>  # grant the first admin
npm run webhooks:dead                   # list webhook deliveries that gave up
npm run webhooks:prune                  # drop settled webhook rows past retention
```

All of these need `DATABASE_URL` and sit outside `npm run check`, because the
local gate must not require a database.

For `verify:audit`, exit code 1 means the chain is broken and exit code 2 means
the verifier could not run — which is not evidence of tampering.

`webhooks:dead` exits nonzero when any delivery has exhausted its retries, so it
can gate a deploy: every row it prints is a provider state change that was never
applied. `webhooks:prune` removes settled rows past their retention window
(default 30 days) — a dead Clerk delivery still holds the raw Clerk id its
payload arrived with, so it must not linger indefinitely.

`CRON_SECRET` guards `/api/internal/webhook-retry`. Vercel cron calls it with
`GET` and `Authorization: Bearer $CRON_SECRET`; `POST` with an `x-cron-secret`
header also works for driving it by hand. The schedule is **daily**, because
Vercel's Hobby plan allows one run per cron job per day — on a paid plan, change
the `crons` entry in `vercel.json` for a tighter cadence. Leaving `CRON_SECRET`
unset closes the endpoint rather than opening it.

`grant:admin` exists only to break a circle: every other role change goes through
`POST /api/admin/users/:id/role`, which itself requires an existing admin. It
writes the same audit row that endpoint would, attributed to `system:bootstrap`,
so "who made the first admin" has an answer. Pass `--role moderator` to grant
that instead.

`prune:rate-limits` takes `--older-than-hours` (default 24); guest counter keys
stop being reachable once their address hash rotates daily, so old rows are dead
weight rather than state.

### Security headers and rate limits

`server/security-headers.js` is the single source for the header set, applied by
local Express, the Vite dev server, and the Vite preview server the Playwright
suite drives. `vercel.json` mirrors the same values for assets Vercel's edge
serves without running our code — **change a directive in both places.** Full
directive-by-directive rationale, the per-endpoint rate-limit budgets, and the
Clerk custom-domain caveat are in `docs/security-headers.md`.

Two optional variables:

- `TRUST_PROXY_HEADERS=true` — honour `x-forwarded-for`. Set it on Vercel, which
  rewrites that header. Unset, the socket address is used, because a client that
  can set its own forwarded address can choose which rate-limit budget to spend.
- `REQUEST_ADDRESS_SALT` — salt for the daily-rotating address hash used both for
  guest rate-limit keys and for the `ip_hash` on audit rows. Optional: unset, it
  is derived from `DATABASE_URL`, which is already a server-only secret and is
  stable across warm containers. Set it explicitly when `DATABASE_URL` carries no
  strong secret (the server warns at startup) or when the password may rotate
  independently — rotating it silently re-keys every hash. See
  `docs/security-headers.md`.

The included `vercel.json` serves the Vite entry document for direct `/play`
visits and refreshes; API functions remain at `/api/*`. The game remains
playable in Guest mode when Clerk or Neon is unavailable. Guest runs continue
to use the unchanged local Records tab. Configure all Clerk variables and the
database before presenting production sign-in as available.

Configure a Clerk `user.deleted` webhook at `/api/clerk-webhook`. Its verified
handler transactionally removes profile, score, access, purchase, Run-grant,
Cloud Quest, and Lantern Journal rows for that Clerk identity. Before removal,
it stores only a SHA-256 deletion tombstone—not the raw Clerk identity—and
serializes account-creating writes so an in-flight request cannot recreate
deleted data. A missing or invalid webhook secret fails closed; it never
accepts an unsigned deletion request.

The browser reads the server-owned rollback state before admission; there is no
client flag that can bypass it. `RUN_ACCESS_ENFORCEMENT_ENABLED=true` becomes
effective only when the complete Stripe **test-mode** configuration is valid,
so a partial payment setup cannot strand signed-in players. Production remains
`false` until the production release checklist is approved. Hosted database
URLs are normalized to `sslmode=verify-full`.

Lifetime Checkout accepts no browser price, amount, currency, quantity, owner,
or redirect fields. Direct return confirmation and signed raw-body webhooks
both activate the same PostgreSQL entitlement. Ordinary Run admission reads
PostgreSQL and does not call Stripe. See
[`lifetime-membership-operations.md`](lifetime-membership-operations.md)
for test setup, webhook events, refund/dispute recovery, support, and rollback.

## Validate

GitHub Actions are intentionally disabled. The complete gate runs locally:

```bash
npm run check:full
```

This runs ESLint, strict JavaScript type checking, Vitest unit tests, the Vite
production build, bundle budgets, and Playwright tests on desktop and mobile
browser profiles. The tracked pre-push hook runs the core gate before every
push.
