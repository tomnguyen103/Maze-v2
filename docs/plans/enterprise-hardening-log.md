# Enterprise hardening — execution log

One entry per phase of `docs/plans/enterprise-hardening-plan.md`. Each entry
records the PR, the local gate results, and any deviation from the plan with its
reason.

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

- `npm run check`: green (475 tests / 11 skipped).
- `npm run check:full`: green (105 e2e passed / 5 skipped).

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
6. **No `users:read` route yet.** The permission exists in the matrix because
   phase 7's admin dashboard needs it, but no endpoint checks it in this phase.
   This is the one place the matrix runs ahead of the code; it is called out here
   rather than silently shipped.
7. **`GET /api/profile` gains an additive `access` field.** Existing profile
   tests use `toMatchObject` and pass unmodified — no existing test changed
   meaning.
