# Enterprise hardening — execution log

One entry per phase of `docs/plans/enterprise-hardening-plan.md`. Each entry
records the PR, the local gate results, and any deviation from the plan with its
reason.

---

## Test infrastructure — stabilise the test gate

- **PR**: #61 (merged)
- **Branch**: `fix/stabilise-test-gate`
- **ADR**: none — not a plan phase.

### e2e flakiness (~1 in 3 full runs)

Root cause found and fixed, not masked. `src/app.js` dynamically imports
`src/main.js`, so `page.goto` resolves at the load event while the app is
still initialising. `main.js` attaches its listeners at module evaluation, but
the real Run is swapped in only when the async `initializeRunEntry()` resolves
— which is exactly when `app.js` sets `data-game-ready="true"`. Input sent in
that window moves the *placeholder* Run and is lost when the swap resets
progress. Reproduced deterministically: a failing run's snapshot showed
`Moves 002` after seven keypresses — five presses consumed by the placeholder,
two by the real Run. Under Playwright's 16-worker parallelism the window
between load and ready stretches, which is why the flake tracked machine load
and hit whichever input-driving test was unlucky (chunk-load timing, Warden
Challenge visibility, the guest second-Labyrinth invariant — all one class).

Fix, two parts, both cause-level:

1. Every e2e test that drives gameplay (keyboard, app buttons, synthetic
   `online` events) now crosses an `expectGameReady` barrier — the
   `data-game-ready` wait two tests already used — before its first
   interaction. After this alone, eight full runs showed zero recurrences of
   the original three flakes.
2. The remaining intermittent failures were a second class: genuine load
   starvation (app boot and Clerk initialisation stretching past their
   bounds) from 16 workers × Chromium against one shared preview process on
   32 logical cores. `workers: 8` in `playwright.config.mjs` bounds the
   oversubscription, and the readiness barrier carries a 15s bound — the same
   explicit-bound pattern `entry.spec.js` already used for Clerk
   initialisation. Suite wall-clock stayed in the same range.

A third, smaller class surfaced during validation: the two tests that drive
Clerk's real development instance (SignIn modal, demo-gate handoff) fail when
Clerk hangs or throttles — its remotely loaded `@clerk/ui` chunk is the same
optional download `game.spec.js`'s console filter already tolerates. Both
tests already skipped on *detectable* Clerk unavailability; their throwing
polls are now deadline loops that reach the same skip on a silent hang, so an
external outage shows up as one extra skip in the run summary instead of a
red gate. They still run and assert normally whenever Clerk responds (most
runs: 111 passed / 5 skipped; an outage run: 110 / 6).

No retries were added anywhere. Verified by repeated full-suite runs (results
under Gate).

### Vitest unhandled-error fault

Not reproduced despite 8 full-suite and 30 targeted runs; the mechanism was
removed instead. `vite.config.mjs` built the entire player API at config
evaluation — a real pg Pool against the `.env.local` `DATABASE_URL`, a Stripe
client, and Clerk middleware — inside the vitest process, for a run that can
never serve an HTTP request. That config-load side effect was the suspected
source of the post-run "Vitest caught 1 unhandled error". Now: a `vitest` run
(mode `test`) gets a config with no API plugin at all, and dev/preview modes
build the middlewares lazily inside `configureServer` /
`configurePreviewServer`, so config evaluation is side-effect free everywhere.
`tests/vite-config.test.js` pins both behaviours. If the fault ever resurfaces
it can no longer come from the config path, and the next occurrence should be
captured verbatim before rerunning.

The pre-push hook (`set -eu; npm run check`) still exits without naming the
failed step; `.githooks` is out of scope for this task, so "the gate is green"
and "the push landed" remain separate facts to verify per the workflow.

### Pool construction in operational scripts

`scripts/verify-audit-chain.mjs`, `scripts/prune-rate-limits.mjs`, and
`scripts/grant-admin.mjs` built `new Pool(...)` before their `try`, so a
malformed `DATABASE_URL` threw past the handler and exited 1 instead of the
documented 2, and none bounded connection or query time. All three now match
`prune-webhook-inbox.mjs` / `list-dead-webhooks.mjs`: pool constructed inside
the handler, `max: 1`, `connectionTimeoutMillis: 10000`,
`query_timeout: 60000`, `await pool?.end()` in `finally`.
`tests/script-database-guard.test.js` spawns each script with a malformed URL
and asserts exit code 2, and asserts the timeout bounds are present.

### Gate

- Flake measurement, before: 3 failures across 4 full e2e runs at HEAD of main
  (three input-driving tests failing together in a bad run — the documented
  ~1-in-3 rate).
- Flake measurement, after: **10 consecutive green full e2e runs** with the
  complete fix (and 11 consecutive green with all but the Clerk-outage skip
  handling). The barrier-only intermediate state also showed zero
  recurrences of the original three flakes across 8 runs; its two residual
  failures (Clerk initialisation, readiness past a 5s default) drove the
  worker cap and the explicit 15s bounds.
- `npm run check`: green (602 unit tests / 11 skipped — 9 new).
- `npm run check:full`: green.

### Deviations

- The task said to suspect the 16-worker parallelism; the diagnosis found TWO
  causes and both were fixed at the cause: (1) tests injecting input before
  the app's async Run swap (`data-game-ready`), which parallelism only
  amplified, and (2) genuine oversubscription starving app boot and Clerk's
  remotely loaded UI past their bounds, addressed with `workers: 8` and
  explicit 15s bounds on the readiness barrier and the two Clerk modal
  expectations. No retries anywhere; no existing assertion changed meaning.
- The vitest fault was never reproduced (8 full + 30 targeted attempts), so
  the fix removes the suspected mechanism (config-load side effects) and pins
  it with tests rather than claiming a verified repro.

---

## Phase 6 — GDPR data export

- **PR**: _pending_
- **Branch**: `feat/gdpr-export`
- **ADR**: `docs/adr/0018-gdpr-data-export.md`
- **Migration**: none.

### Delivered

- `server/data-export.js` — `buildUserExport` with explicit column lists per
  section; every query binds the requesting user id; deleted accounts yield
  empty sections.
- `server/data-export-route.js` — `GET /api/me/export`, auth required,
  `export.self` budget (2/hour), audited `export.self` before the body is
  sent, `Content-Disposition: attachment`.
- `shared/export-schema.json` — checked-in contract; the unit test pins the
  builder's sections to the schema's required sections.
- `vercel.json` rewrite `/api/me/export` → `profile` function with a
  validated `_meRoute` (attacker-controlled-rewrite discipline, shim test
  asserts both the rebuild and that unknown values are answered 404).
- `docs/data-privacy.md`.
- Tests: `data-export.test.js`, `data-export-route.test.js`, new cases in
  `vercel-functions.test.js` and `player-api-integration.test.js`.

### Gate

- _pending_

### Deviations

1. **No `api/me-export.js` file** — the Hobby ceiling (12/12) again; the
   plan predates it. Rewrites onto the `profile` function.
2. **Explorer Access Settings are not a section.** They are device-local and
   never reach the server (phase 1 already recorded this); the export
   documents the fact instead of shipping a permanently empty section.
3. **`score_entries` and `user_roles` are exported** although the plan's
   list omits them — the acceptance criterion "every user-owned table
   represented" wins over the narrative list.
4. **Schema validation is structural, not a JSON-Schema engine.** Validating
   with `ajv` would need a new dependency outside the allowed list. The test
   pins envelope keys, section set, and schema `$id`; the schema file remains
   the normative contract for external consumers.
5. **The audit write is sequenced before the response body** so a served
   export always has its audit attempt behind it — but the recorder keeps
   phase 1's never-throw contract, so a failed audit write is logged and
   counted, not converted into a 503.

---

## Phase 5 — Observability

- **PR**: #62
- **Branch**: `feat/observability`
- **ADR**: `docs/adr/0017-env-gated-observability.md`
- **Migration**: none.

### Delivered

- `server/logger.js` (pino, redacting serializers), `server/request-log.js`
  (`x-request-id` assign/echo, one structured line per owned request),
  request id flowing into audit rows via the existing header read.
- `server/health-route.js` — `/api/health` + `/api/ready`, dispatched first
  in every `createPlayerApi` branch; `vercel.json` rewrites both onto the
  `leaderboard` function with a validated `_healthRoute` parameter.
- `server/tracing.js` + `server/error-tracking.js` +
  `server/telemetry-bootstrap.js` — OTel and Sentry, env-gated behind
  dynamic imports, bootstrap as the first import of `player-api.js`.
- `src/error-reporting.js` — browser Sentry as a lazy build-time-optional
  chunk; `scripts/check-bundle-budget.mjs` gained an `optional` budget kind.
- `shared/telemetry-scrub.js` — one `beforeSend` scrubber for both sides.
- `server/product-events.js` — PostHog forwarding of the two server-trusted
  events via plain `fetch`, schema-filtered, fire-and-forget.
- `docs/observability.md`; tests: `logger.test.js`, `request-log.test.js`,
  `health-route.test.js`, `telemetry.test.js`, new cases in
  `product-events.test.js`, `player-api-integration.test.js`,
  `vercel-functions.test.js`.

### Gate

- `npm run check`: green (635 unit tests / 11 skipped — 29 new; bundle
  budget passes with `SKIP optional Sentry: not built` by default).
- `npm run check:full`: green (111 e2e / 5 skipped).

### Deviations

1. **No `api/health.js` / `api/ready.js`.** The plan predates the discovery
   that phase 2 spent the last Hobby function slot. Health rewrites onto the
   `leaderboard` function, shim-validated like `/api/admin/*`.
2. **Request logging covers the player API's namespaces**, not the question
   endpoint — the plan places the middleware in `player-api.js`, and the
   question route stays as-is.
3. **Ad-hoc `console` paths pinned by existing tests stay on `console`**
   (`logProviderFallback`, pool error listeners). Replacing them would change
   existing tests' meaning; they already log only redacted names.
4. **PostHog uses plain `fetch`, not `posthog-node`** — the SDK is not on
   the allowed dependency list, and one capture call does not need it.
5. **Sentry source-map upload is documented, not scripted** — it needs
   `@sentry/cli`, also not on the allowed list; the Vercel Sentry
   integration covers it in deployment.
6. **Log lines carry no user id.** The plan's "user id when known" would
   require logging after Clerk authentication resolves; the request line is
   emitted by pre-auth middleware. `request_id` joins a request to its audit
   rows, which do carry the actor — that is the correlation the plan wanted.
7. **New env vars** (all optional): `LOG_LEVEL`,
   `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
   `SENTRY_DSN`, `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE`,
   `POSTHOG_API_KEY`, `POSTHOG_HOST`. Documented in
   `docs/observability.md`.

---

## Phase 1 — Immutable audit log

- **PR**: _pending_
- **Branch**: `feat/audit-log`
- **ADR**: `docs/adr/0013-tamper-evident-audit-log.md`
- **Migration**: `db/migrations/0006_audit_events.sql`

### Delivered

- `audit_events` (hash-chained, append-only) + `audit_chain_head` (one-row
  serialization point).
- `server/audit-store.js` — canonical JSON, row hashing, daily-rotating address
  hash, `appendAudit`, `readChain`, `verifyAuditChain`.
- `server/audit.js` — `recordAudit` wrapper that never throws into a request
  path and counts failures; `createRequestAuditor` request-shaped entry point.
- `scripts/verify-audit-chain.mjs` — batched chain walk, exits 1 on any break.
- Call sites: `profile.update`, `score.submit`, `run_access.decision`,
  `quest_progress.save`, `journal.sync`, `journal.clear`, `lifetime.checkout`,
  `lifetime.confirm`, `lifetime.webhook`, `user.delete`.
- Tests: `tests/audit-store.test.js`, `tests/audit.test.js`,
  `tests/audit-call-sites.test.js`, `tests/audit-store.integration.test.js`, and
  a new case in `tests/migration.test.js`.

### Gate

- `npm run check`: green (lint, typecheck, 418 tests / 7 skipped, build, bundle
  budget all PASS).
- `npm run check:full`: green (105 e2e passed / 5 skipped). One flake on the
  first run — `retries the Cloud Quest choice view after its first chunk fails`,
  a chunk-load timing test — passed on rerun and on a clean full-suite rerun.
  This diff touches no client code.

### Deviations

1. **`recordAudit` takes a request plus an event object**, not the plan's bare
   `(ctx, action, resource, before, after)` at the call site. Routes receive one
   injected `recordAudit(request, event)` so they stay unaware of the address
   salt and of the recorder's failure handling. The plan's five-argument shape
   still exists underneath as `createAuditRecorder().recordAudit`.
2. **A `BEFORE UPDATE OR DELETE` trigger enforces append-only** in addition to
   the plan's `REVOKE`. The revoke alone does not bind the table owner, which is
   the role the app connects as. Consequence: the plan's "manually UPDATE a row
   and watch verification fail" demo needs the trigger disabled first, so
   tamper detection is proven by unit test instead. Reason: enforcement beats
   demo convenience for a log whose whole value is being unfalsifiable.
3. **Explorer Access Settings have no audit call site.** They are device-local
   presentation preferences that never reach the server, so there is no mutating
   endpoint to audit.
4. **New env var**: `AUDIT_IP_SALT`. Unset means `ip_hash` is `NULL` — the audit
   row is still written and the chain is still valid. Documented in `README.md`;
   `.env.example` was deliberately left untouched because it is out of scope for
   this run. **Superseded by phase 3**, which folded it into
   `REQUEST_ADDRESS_SALT` with a default derived from `DATABASE_URL`.
5. **Schema hardened past the plan's sketch.** `prev_hash` / `row_hash` /
   `ip_hash` are `CHAR(64)` with hex CHECKs instead of bare `TEXT`, `actor_role`
   is constrained to the four known roles, and a third index
   `audit_events_action_idx` supports the phase 7 audit viewer's action filter.
   Deliberately *not* constrained: `action` and `resource_type`. Because
   `recordAudit` swallows write errors, a CHECK on the action name would silently
   drop rows for any future action — the exact failure the log exists to prevent.
6. **`run_access.grant` renamed to `run_access.decision`, and audited only under
   enforcement.** With `RUN_ACCESS_ENFORCEMENT_ENABLED=false` the endpoint reads
   current access and grants nothing, so there is nothing to audit. Under
   enforcement both admission and denial are recorded, because the decision
   itself is the durable fact support needs.
7. **`user.delete` targets `player_account`, not `player_profile`.** Account
   deletion removes the whole identity, which is a different resource from the
   Player Profile row that `profile.update` touches.
8. **`npm run verify:audit` added to `package.json`** and documented in
   `README.md`. It sits outside `npm run check` because the local gate must not
   require a database.
9. **New env var**: `AUDIT_TRUST_PROXY` (**superseded by phase 3's
   `TRUST_PROXY_HEADERS`**). `x-forwarded-for` is client-controlled
   unless a proxy rewrites it, so it is honoured only when this is `true` (the
   Vercel case). Unset, the socket address is hashed instead.

### CodeRabbit review

Review completed on `f1b0902`. Nine actionable comments plus two nitpicks.
Fixed: `BEFORE TRUNCATE` statement trigger (row triggers never fire on
`TRUNCATE`, so the earlier ADR wording overstated the guarantee); one
`REPEATABLE READ, READ ONLY` snapshot across every verification batch and the
head read; exit code 2 for operational verifier failures so they cannot be
mistaken for tampering; transaction-local `lock_timeout` on the chain-head lock;
`AUDIT_TRUST_PROXY` gate on `x-forwarded-for`; a startup warning when
`AUDIT_IP_SALT` is unset; hot-row `fillfactor` and autovacuum settings on
`audit_chain_head`; direct test coverage for `createRequestAuditor`.

Dismissed with reasons, both recorded in the ADR's "What this does not defend
against" section:

- *Move application runtime access to a non-owner role.* Correct, and it is the
  real fix for owner-level `DROP TRIGGER`. It is a database provisioning change,
  not a code change, and this repo does not own Neon role setup.
- *Anchor chain checkpoints with an externally managed HMAC or signature.* Also
  correct, and also not a code-only change — it needs a sink the database role
  cannot reach, which is what phase 5's observability work introduces. Deferred
  rather than declined.
- *Fail fast when `AUDIT_IP_SALT` is unset.* Declined in favour of one startup
  warning. A missing salt must not take down player services; the audit row and
  the chain are both still valid without an address hash.

---

## Phase 3 — Rate limiting + security headers

- **PR**: _pending_
- **Branch**: `feat/rate-limit-security-headers`
- **ADR**: `docs/adr/0014-serverless-rate-limits-and-strict-headers.md`
- **Migration**: `db/migrations/0007_rate_limit_counters.sql`

### Delivered

- `rate_limit_counters` + `server/rate-limit.js`: fixed-window counter driven by
  one atomic `INSERT ... ON CONFLICT DO UPDATE`, so the window rollover and the
  increment are the same statement. Budgets per the plan: question 30/min, score
  10/min, profile 10/min, checkout 5/min, export 2/hour.
- `server/rate-limit-request.js`: the `rateLimit(budget, request, userId)`
  function injected into route handlers, plus `sendRateLimited` (429 +
  `Retry-After`).
- `server/request-identity.js`: proxy-aware address extraction and the
  daily-rotating address hash used for guest keys.
- `server/security-headers.js`: one source for CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`,
  `Permissions-Policy`, and production-only HSTS. Wired into local Express, the
  Vite dev server, and the Vite preview server; mirrored in `vercel.json` for the
  edge.
- `scripts/prune-rate-limits.mjs` → `npm run prune:rate-limits`.
- `docs/security-headers.md`, README deploy and operations sections.
- Tests: `tests/rate-limit.test.js`, `tests/rate-limit-routes.test.js`,
  `tests/security-headers.test.js`, `tests/e2e/security-headers.spec.js`, and a
  new case in `tests/migration.test.js`.

### Gate

- `npm run check`: green (500 tests / 7 skipped after rebasing onto merged
  phase 1).
- `npm run check:full`: green (111 e2e passed / 5 skipped).

### Local review

Ran over the pre-rebase diff, then again over the rebase resolution and the
unification commit. Real findings fixed both times; the second pass confirmed no
phase 1 call site was lost in the conflict resolution and no pre-existing test
changed meaning (`git diff <phase-1-squash> HEAD -- tests/` is additions only).

The salt default drew two follow-on findings, both fixed: a `DATABASE_URL` with
no strong secret derives a guessable salt, which would make `ip_hash` reversible
— the server now warns at startup; and rotating the database password silently
re-keys every hash, so the salt's source is logged once at startup rather than
being documented only in the README. The now-dead `hashClientIp` alias was
removed and its two test files re-pointed at `request-identity.js` (import path
only — no assertion changed).

### Deviations

1. **The existing in-process question throttle is kept, unchanged.**
   `createQuestionRateLimiter` caps what one warm instance sends the question
   provider; the new budget caps what one caller sends us. They answer different
   questions, and its existing tests keep their meaning. The instance throttle
   runs first, so a request it rejects never consumes a per-caller budget.
2. **Fixed window, not sliding.** The plan says "fixed-window-with-burst", and
   this is that: up to two budgets' worth can cross a window boundary. Accepted —
   these limits protect the database and the provider, they are not a fairness
   mechanism, and a sliding window costs either a second table or a
   read-modify-write.
3. **The limiter fails open.** An unreachable counter store admits the request
   and marks the decision `degraded`. Rate limiting must never be why a child
   cannot play.
4. **Callers with no identity are admitted unmetered.** With neither a user id
   nor an address hash there is no honest key, and one shared bucket would let a
   single abuser lock out every other anonymous caller.
5. **`POST /api/lifetime-confirm` is deliberately not metered.** A paid Explorer
   must always be able to finish activating their membership. Only checkout
   creation is metered. This protects the documented monetization invariant.
6. **`getDatabasePool` added to `server/database.js`**, memoizing one pool per
   connection string, so the limiter and the player API share connections instead
   of opening two pools per warm container. `createDatabasePool` is unchanged and
   still exported, so `tests/database.test.js` keeps its meaning.
7. **New env vars**: `TRUST_PROXY_HEADERS` (gates `x-forwarded-for`; a client
   that can set its own forwarded address could otherwise choose which budget to
   spend) and `REQUEST_ADDRESS_SALT` (guest address hash). Both optional, both
   documented in `README.md` and `docs/security-headers.md`. `.env.example` left
   untouched, out of scope for this run.
8. **Phase 1's `AUDIT_IP_SALT` and `AUDIT_TRUST_PROXY` are folded into
   `REQUEST_ADDRESS_SALT` and `TRUST_PROXY_HEADERS`.** Phase 1 and phase 3 were
   built in parallel and each grew its own address extraction and daily hashing,
   with a separate pair of environment variables. Shipping both would mean two
   ways to hash the same address and two flags for one policy. On rebase,
   `server/request-identity.js` became the single implementation and
   `audit-store.js`'s `hashClientIp` re-exports it. No existing test changed
   meaning: `hashClientAddress` keeps the same null-on-empty-salt contract, and
   the whole phase 1 suite passes unmodified.

   Side effect worth stating: because the salt now defaults to a hash of
   `DATABASE_URL`, audit `ip_hash` is populated without configuration instead of
   being silently `NULL`, which is what phase 1's own review flagged as the risk.

   `db/migrations/0006_audit_events.sql` was edited to rename the variable **in a
   comment only** — no DDL change. It has not been applied to any database, and
   the alternative is a permanently wrong comment on a privacy-critical column.
### CodeRabbit review

Six findings, all fixed:

- **`vercel.json`'s `style-src` had lost `'unsafe-inline'`** and its `script-src`
  lacked Turnstile — the exact drift the parity test existed to prevent. It did
  not prevent it, because it excluded `style-src` as "Clerk-bearing". Tightened:
  only directives that carry a *host* may differ from the computed policy, and
  only in their hosts; every keyword must match exactly.
- **Turnstile was listed in `frame-src` only.** Clerk's bot protection loads a
  script from `challenges.cloudflare.com` as well as rendering in a frame, so the
  CAPTCHA would have been blocked outright wherever bot protection is enabled.
- **The shared pool had no `error` listener.** `attachDatabasePool` handles
  suspension cleanup only, so an idle client dropped by the database would emit
  an unhandled `error` and take the process down — and this pool now backs every
  feature.
- **The instance throttle's 429 differed from the durable limiter's**: no
  `cache-control`, no `retryAfter` field. One route answering two shapes
  depending on which limit rejected it. Both now go through `sendRateLimited`.
- The rate-limit e2e assertion could pass vacuously when the flow made no `/api/`
  call; it now asserts at least one API response was observed.
- Markdown fence language identifier.

9. **`vercel.json` duplicates the header values** rather than computing them,
   because Vercel's edge serves built assets without running our code. Called out
   in both the ADR and `docs/security-headers.md`, including the caveat that a
   Clerk production custom domain matches neither wildcard and must be added
   explicitly.

---

## Phase 2 — RBAC + permission matrix

- **PR**: _pending_
- **Branch**: `feat/rbac-permissions`
- **ADR**: `docs/adr/0015-database-authoritative-roles.md`
- **Migration**: `db/migrations/0008_user_roles.sql`

### Delivered

- `shared/permissions.js` — the one matrix, imported by both server and browser;
  only the server enforces it.
- `db/migrations/0008_user_roles.sql` — authoritative role per Clerk identity,
  with a `CHECK (user_id <> granted_by)` backstop against self-promotion.
- `server/rbac.js` — `createRoleStore` (absence of a row means `player`),
  `createRoleResolver` (per-request cache, fails closed), `createPermissionGuard`
  (`requirePermission` → 401 / 403 / allowed), `publicAccess` for UI gating.
- `server/admin-route.js` — `POST /api/admin/users/:id/role`, permission-checked
  and audited (`role.grant` / `role.revoke`), with the Clerk `publicMetadata`
  mirror.
- `scripts/grant-admin.mjs` → `npm run grant:admin`, audited as
  `system:bootstrap`.
- `src/player/can.js` — client-side `can()` / `isStaff()`, UI only.
- Tests: `tests/permissions.test.js`, `tests/rbac.test.js`,
  `tests/admin-route.test.js`, `tests/can.test.js`,
  `tests/rbac-store.integration.test.js`, and a new case in
  `tests/migration.test.js`.

### Gate

- `npm run check`: green (557 tests / 11 skipped, after rebasing onto merged phase 3).
- `npm run check:full`: green (105 e2e passed / 5 skipped).

  The e2e suite is intermittently flaky under Playwright's 16-worker
  parallelism, independently of this work. Two distinct flakes were seen across
  this run: a chunk-load timing test during phase 1, and Warden Challenge dialog
  visibility during phase 2. Both passed on targeted rerun and on a clean full
  rerun, and neither phase touched the code under test. Worth a dedicated look
  outside this plan — a suite that fails ~2% of runs erodes the gate's meaning.

### Deviations

1. **Migration numbered 0008, not 0007.** Phase 3 claimed `0007` on a branch that
   was still open for review when this phase started. Numbering around it avoids
   two migrations sharing an ordinal; the gap closes when phase 3 merges.
2. **`getRole` lives on a store, not as a free `getRole(pool, userId)`.** The
   plan sketches the latter. A store matches every other data-access module in
   `server/` and lets the per-request cache sit in a separate resolver, which is
   what makes the "cache per request only" rule testable.
3. **Revoking deletes the row rather than writing `role = 'player'`.** Absence
   already means `player`, so a redundant row would be a second way to say the
   same thing — and a row that says `player` invites the question of whether it
   means "explicitly demoted" or "never granted".
4. **The Clerk mirror is best-effort.** A failed `publicMetadata` write is logged
   and the request still succeeds. The mirror only feeds UI gating; losing it
   must not lose the grant. Covered by a test.
5. **403 bodies do not name the missing permission or the caller's role.** The
   plan does not specify the body. Describing the permission model to someone who
   just failed a permission check is free reconnaissance. Asserted by test.
6. **The matrix is declared ahead of its enforcement.** This phase ships one
   guarded route, so `users:roles:write` is the only permission a server route
   checks today. Consuming phase per permission: `users:read`, `questions:read`,
   `questions:write`, `questions:publish`, `refunds:issue`, `audit:read` →
   phase 7; `export:any` → phase 6. **Consequence worth stating plainly: the
   `moderator` role currently grants nothing enforceable.** Defining the
   vocabulary once keeps phase 7 from inventing a second one, but the gap is real
   until then.
7. **`GET /api/profile` gains an additive `access` field.** Existing profile
   tests use `toMatchObject` and pass unmodified — no existing test changed
   meaning.
8. **`api/admin.js` takes the project to 12 Vercel functions — the Hobby
   ceiling.** The whole admin surface is one function reached by a `vercel.json`
   rewrite, but the budget is now exhausted. `tests/vercel-functions.test.js`
   already asserted `<= 12`; its exact-count fixture moved 11 → 12, which keeps
   the invariant it guards intact. **Every later phase must route new endpoints
   through an existing function rather than adding a file** — phase 6's export
   and phase 7's admin API in particular.

### Local review

Both axes run. Real findings fixed:

- **`/api/admin/*` had no Vercel entrypoint**, so the endpoint would have worked
  only under `npm start` and the dev server, against the plan's serverless ground
  rule. Added `api/admin.js` plus the rewrite.
- **The no-`DATABASE_URL` branch let admin paths fall through** to the SPA, so
  `POST /api/admin/users/x/role` answered `200 index.html`. Now 503.
- **`grant-admin.mjs` mis-parsed its arguments**: filtering out `--`-prefixed
  tokens made a flag's *value* indistinguishable from the user id, so
  `--role moderator user_123` would have granted moderator to the literal id
  `"moderator"` — and written a real audit row for it. Replaced with positional
  parsing that also accepts `--role=`.
- **An audit row was written for no-op changes**, contradicting ADR 0013's "none
  when the request changes nothing".
- **404 and 405 preceded the permission check**, letting an unauthorized caller
  map the admin surface.
- `setRole` depended on `this`, the only such function in `server/`; hoisted.
- `listByRole` was unused and has been removed rather than shipped ahead of its
  caller.

Dismissed with reason: a swallowed `recordAudit` failure leaves a grant unaudited
without failing the request. That is phase 1's deliberate design — logged and
counted, never thrown into the request path. `grant-admin.mjs` exits non-zero on
it because a script can afford to.

### CodeRabbit review

Five findings, all fixed:

- **`setRole` had a TOCTOU window.** The previous role was read in a separate
  query before the write, so two concurrent changes to the same Explorer could
  both capture the same `before` value and file wrong audit history. The read and
  the write now share one statement — a CTE for the upsert, `RETURNING role` for
  the revoke.
- **A bare `POST /api/admin` hung until the platform timeout.** With no
  `_adminPath` the shim left `request.url` as `/api/admin`, which misses
  `isAdminPath`, so the router called `next?.()` — and a serverless function has
  no next handler, so nothing was ever written. The shim now always rebuilds with
  the trailing slash, so it answers 401.
- **An audit failure turned a committed role change into a 503.** `setRole` has
  already committed by then, so the response claimed a failure that did not
  happen — and because the retry is a no-op, the audit row would never be
  written. Now best-effort with its own `catch`, matching the mirror.
- **The Clerk mirror `fetch` had no timeout**, so a slow Clerk held the admin's
  request open after the database write succeeded. Bounded to 5s.
- **Re-running `grant-admin.mjs` rewrote `updated_at` and filed a `role.grant`**
  for a change that did not happen. It now reads the current role first and
  exits cleanly on a no-op.

This supersedes the earlier "dismissed with reason" note above: the endpoint's
audit write is still best-effort by design, but it no longer misreports the
outcome of the change it failed to record.

---

## Phase 4 — Webhook inbox

- **PR**: _pending_
- **Branch**: `feat/webhook-inbox`
- **ADR**: `docs/adr/0016-store-then-process-webhook-inbox.md`
- **Migration**: `db/migrations/0009_webhook_inbox.sql`

### Delivered

- `webhook_inbox` keyed on `(provider, event_id)`, so a repeat delivery collides
  and is a no-op rather than a second state change.
- `server/webhook-inbox.js` — store, the `receive` / `retryPending` pair, and one
  `processEvent` seam shared by the inline path and the retry loop.
- `server/internal-route.js` — `/api/internal/webhook-retry`, guarded by a
  constant-time secret comparison. Vercel cron calls it with `GET` and
  `Authorization: Bearer $CRON_SECRET`; `POST` with `x-cron-secret` also works
  for driving it by hand. Daily schedule — see deviations 7 and 8.
- `server/lifetime-service.js` split into `verifyWebhook` +
  `processVerifiedWebhook`, with `processWebhook` preserved as the old entry
  point so its existing tests keep their meaning.
- Clerk deliveries keyed on the `svix-id` header, which is what a redelivery
  reuses.
- `scripts/list-dead-webhooks.mjs` → `npm run webhooks:dead`, exiting nonzero
  when any dead row exists, and `scripts/prune-webhook-inbox.mjs` →
  `npm run webhooks:prune` for retention.
- Tests: `tests/webhook-inbox.test.js`, `tests/internal-route.test.js`, new cases
  in `tests/migration.test.js` and `tests/vercel-functions.test.js`.

### Gate

- `npm run check`: green (593 tests / 11 skipped).
- `npm run check:full`: green (111 e2e / 5 skipped) on a clean run.

  The unit suite has its own intermittent fault: `vitest` occasionally reports
  "Vitest caught 1 unhandled error during the test run" with one test file not
  completing, then passes cleanly on every rerun (four consecutive clean runs
  each time it appeared). It surfaced twice during this phase, and the first
  occurrence exited non-zero from the pre-push hook and silently blocked a push —
  the branch stayed at its previous SHA and only a manual check of the remote ref
  caught it. Unreproducible so far; likely an async pool error escaping after the
  run ends. **"The gate is green" and "the push landed" are separate facts.**

  **The e2e flakiness is now a real problem, not a footnote.** Across this phase
  three separate full-suite runs failed three *different* tests — a chunk-load
  test, a Warden Challenge dialog, and the guest second-Labyrinth invariant —
  each passing on targeted rerun and on other full runs. That is roughly a 1-in-3
  chance that any given `check:full` reports a failure unrelated to the change
  under test, which is close to the point where a red gate stops carrying
  information. It is not caused by this phase (it was visible in phases 1 and 2),
  and it deserves its own fix outside this plan.

### Deviations

1. **The retry endpoint is not its own serverless function.** The project is at
   Vercel's 12-function Hobby ceiling, so `vercel.json` rewrites `/api/internal/*`
   onto `api/stripe-webhook.js`, which rebuilds the path before dispatching. The
   plan assumed a free function slot; phase 2 spent the last one. Recorded in the
   ADR so nobody "tidies" it back into a new file.
2. **`last_error` stores a redacted class name, not the provider's message.** The
   plan's schema comment implies the error text. A failing payload may quote the
   very fields the Journal and audit rules keep out of storage, so only the class
   name is kept. Asserted by test.
3. **No lock-based claim on the retry loop.** An earlier draft used
   `FOR UPDATE SKIP LOCKED` and the ADR claimed it stopped two cron invocations
   colliding. It did not — the loop reads through the pooled adapter in
   autocommit, so the locks released at statement end. Removed, and the ADR now
   states the real guarantee: `processEvent` is idempotent per provider, so
   processing a row twice is a no-op.
4. **An unset `CRON_SECRET` closes the endpoint with 503** rather than leaving it
   open or falling through. A missing secret must never mean an open internal
   endpoint.
5. **Both webhook routes keep their pre-inbox behaviour when no inbox is
   configured.** Guest-only and database-less deployments are unaffected, and the
   existing `stripe-lifetime.test.js` / `clerk-webhook-route.test.js` semantics
   are untouched.
6. **New env var**: `CRON_SECRET`.
7. **The cron contract in the plan does not match the platform.** Vercel cron
   issues `GET` with `Authorization: Bearer $CRON_SECRET`; the plan's `POST` +
   `x-cron-secret` would have returned 401 to every scheduled run. Both shapes
   are accepted now.
8. **The schedule is daily, not every ten minutes.** Vercel Hobby — the same plan
   whose 12-function ceiling shaped where this endpoint lives — allows one run
   per cron job per day. A day between retries is a long time for a failed
   refund; this is a plan constraint, not a design choice, and it is a one-line
   change on a paid plan. **Worth an explicit decision from the repo owner.**
9. **Auditing moved into the `processEvent` seam.** In the routes, the retry loop
   produced no audit rows and the Clerk inbox path wrote no `user.delete` audit
   row for a `user.deleted` event — a silent regression against phase 1.
   (`user.deleted` is Clerk's event name, `user.delete` our audit action; the
   two names are deliberately distinct.)

### Local review

Both axes run. Eight findings, all fixed, four of them serious:

- **Path traversal into a hang.** `_internalPath=../..` normalizes to `/`, which
  no namespace recognises, so the request reached a `next?.()` that does not
  exist in a serverless function — an unauthenticated caller could hang a
  function until the platform timeout. `api/admin.js` had the same hole. Both
  shims now validate the segment.
- **Audit rows lost.** The Clerk inbox path returned before `recordAudit`, and
  the retry loop audited nothing for either provider, so with a database
  configured no `user.delete` row was written at all.
- **`FOR UPDATE SKIP LOCKED` did nothing** (see deviation 3).
- **The cron endpoint would never have run** (see deviations 7 and 8).

Also fixed: the no-Clerk branch built a second lifetime service without the
inbox, so that deployment ran pre-inbox Stripe handling while its retry endpoint
was live; a `markFailed` failure turned into a 503 for a delivery already stored;
and `receiveThroughInbox` dropped `purchaseId` from the audit resource, which the
move into `processEvent` resolves.

### CodeRabbit review

Two findings, both fixed:

- **The inbox retained raw Clerk identities indefinitely.** `payload` was stored
  forever with no purge, and a Clerk `user.deleted` payload carries the raw Clerk
  id — the exact identity `README.md` documents as never being stored raw, since
  deletion keeps only a SHA-256 tombstone. The ADR had reasoned about excluding
  the payload from phase 6's export but never about retaining it at all. Fixed:
  `markProcessed` clears the payload the moment the delivery succeeds, a row with
  no payload is not selected for retry, and `npm run webhooks:prune` bounds how
  long a dead row can hold one.

  Worth naming plainly — this phase introduced a privacy regression against an
  invariant documented in the README, and neither the local review nor the gate
  caught it. It was found by reading the schema against the docs, which is the
  check I should have run myself when adding a table that stores provider
  payloads.
- `README.md` and this log still described the pre-correction cron contract
  (`POST`, every ten minutes) after the ADR had been corrected to `GET` +
  `Bearer` on a daily schedule.

### CodeRabbit full review

`@coderabbitai review` on the privacy fix returned **"Review skipped: incremental
reviews are disabled"** with a green status. That is a no-op, not a clean review:
incremental reviews are off for this org, so the command reviewed nothing.
Merging on that green status would have shipped the privacy fix unreviewed.
`@coderabbitai full review` is the command that actually re-reviews. **A green
CodeRabbit status means the review process terminated, not that the current code
was reviewed — the description string is what distinguishes them.**

The full review found five more, three Major, all fixed:

- **`inbox.receive` was unguarded in the Clerk route.** The router dispatches
  that handler with `void`, so a store failure rejected with no response written
  and the request hung until the platform timeout. Now 503, which is right: the
  delivery was never stored, so Clerk should redeliver. This is the fourth
  instance of the hang-on-unwritten-response class in this codebase.
- **The Stripe inbox path double-audited.** `processEvent` writes the row, then
  the route wrote a second one from the returned result — so an inline delivery
  produced two `lifetime.webhook` rows while a retried one produced one.
- **Both webhook scripts built their pool before the `try`**, so a malformed
  `DATABASE_URL` threw past the handler and bypassed the documented exit code,
  and neither pool had connection or query timeouts.
- README's script count, and a naming ambiguity between Clerk's `user.deleted`
  event and our `user.delete` audit action.

The same pool-construction pattern exists in `verify-audit-chain.mjs`,
`prune-rate-limits.mjs`, and `grant-admin.mjs` from earlier phases. Left alone
here to keep this PR's diff to its own phase; worth a follow-up.

### Note on a defect this phase caught in its own wiring

The Vercel shim class of bug appeared for the third time: the no-`DATABASE_URL`
branch of `server/player-api.js` did not recognise `/api/internal/*`, so the
request fell through to a `next?.()` that has no callback in a serverless
function — the endpoint would have hung until the platform timeout rather than
answering. It was caught by the shim test written for this phase, not by the
gate. Every dispatch guard in that file now enumerates all three namespaces, and
each one has a test that asserts a response is actually written.
