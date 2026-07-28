# Echo Maze — Enterprise Hardening Plan

Status: phases 1–7 DELIVERED (PRs #57–#60, #62, #63, #67–#70; ADRs 0013–0019;
see `enterprise-hardening-log.md` and the phase 7 delivery note below for
evidence and deviations). Phases 8–9 remain PLANNED and not started.
Created: 2026-07-26
Source: senior-architect review of the codebase (Clerk auth, Postgres + migrations, Stripe lifetime checkout, Clerk/Stripe webhooks, ~50 test files, bundle budget gate, Vercel serverless).

Goal: evolve Echo Maze from a polished demo into software that reads as production-grade internal/enterprise tooling. Nine features, ordered so every later feature demos on top of earlier ones.

---

## Ground rules (apply to every phase)

- **Workflow**: each feature = one branch off fresh `main` (`feat/<slug>`) → draft PR → local gate → CodeRabbit review (draft-first, flip ready once) → squash-merge with branch delete. Follow the global PR workflow (`pr-workflow` skill): batched fixes, one re-review, park on rate limit. No GitHub Actions — the local gate IS CI.
- **Local gate before every push**: `npm run check` (lint + typecheck + unit tests + build + bundle budget). Run `npm run check:full` (adds Playwright e2e) before flipping a PR ready.
- **TDD**: every feature starts with failing tests (route tests, store tests, domain tests) matching the existing test layout in `tests/`. Bugfixes get a repro test first.
- **Migrations**: additive SQL files in `db/migrations/`, following existing naming. Never edit an applied migration. Every migration gets coverage in `tests/migration.test.js`.
- **Existing invariants must not break**: guest run flow, three free signed-in runs, lifetime membership semantics, quest progress sync/merge rules, journal privacy minimization, daily labyrinth isolation. The current test suite is the guardrail — it stays green at every commit.
- **Serverless constraints**: everything must work on Vercel functions — no in-memory state across requests, no long-lived background workers. Scheduled work uses Vercel cron hitting an internal endpoint.
- **No new heavy dependencies without justification.** Preferred additions are listed per feature; anything else needs a note in the PR body.

## Sequencing and dependency graph

| Phase | Feature | Depends on | Effort |
|---|---|---|---|
| 1 | Audit log (tamper-evident) | — | 1–2d |
| 2 | RBAC + permission matrix | 1 (audit writes) | 2–3d |
| 3 | Rate limiting + security headers | — (parallelizable) | 1d |
| 4 | Webhook inbox (outbox pattern + idempotency) | 1 | 2d |
| 5 | Observability (structured logs, health, tracing, errors) | — | 2–3d |
| 6 | GDPR data export | 1 | 0.5–1d |
| 7 | Admin dashboard + question bank in DB | 1, 2, 4, 5 | 5–7d |
| 8 | Multi-tenancy (classrooms/orgs + RLS) | 2, 7 | 7–10d |
| 9 | SSO / Google Workspace auto-join | 8 | 1–2d |

Phases 3, 5, 6 can interleave anywhere after phase 1. Phases 8–9 are the "v3 enterprise" arc and are the riskiest — they touch every store; do them last, migration-first, behind the full suite.

---

## Phase 1 — Immutable audit log

**What**: append-only `audit_events` table + one `recordAudit()` helper called from every mutating route; hash-chained rows for tamper evidence.

**Schema** (`db/migrations/NNN_audit_events.sql`):

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,            -- Clerk user id or 'system' / 'webhook:stripe'
  actor_role TEXT NOT NULL DEFAULT 'player',
  action TEXT NOT NULL,              -- e.g. 'profile.update', 'lifetime.confirm'
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before JSONB,
  after JSONB,
  request_id TEXT,
  ip_hash TEXT,                      -- sha256(ip + daily salt), never raw IP (journal privacy precedent)
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL,            -- sha256(prev_hash || canonical-json(row fields))
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, created_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events (resource_type, resource_id, created_at DESC);
-- Revoke UPDATE/DELETE from the app role in the migration.
```

**Implementation**:
- `server/audit-store.js` — `appendAudit(pool, event)`: reads latest `row_hash` (per-chain, single global chain is fine at this scale; serialize with `SELECT ... FOR UPDATE` on a one-row `audit_chain_head` table to avoid race), computes hash, inserts. Canonical JSON = stable key order.
- `server/audit.js` — `recordAudit(ctx, action, resource, before, after)` thin wrapper; never throws into the request path (log + continue on failure, matching `safe-error-log.js` philosophy — but count failures for observability).
- Call sites: profile update, access settings save, quest progress writes at boundaries, run-access grants, lifetime checkout/confirm, journal clears, user deletion, webhook processing (actor `webhook:stripe` / `webhook:clerk`).
- `scripts/verify-audit-chain.mjs` — walks the chain, recomputes hashes, exits nonzero on break. Demo-able.

**Tests**: `tests/audit-store.test.js` (chain integrity, tamper detection, race on concurrent appends), `tests/audit-store.integration.test.js` (real pg, mirroring existing `*-store.integration.test.js` pattern), route tests asserting audit rows on each mutating endpoint.

**Acceptance**: every mutating API writes exactly one audit row; `verify-audit-chain` passes; manual UPDATE of a row makes it fail; suite green.

---

## Phase 2 — RBAC + permission matrix

**What**: roles (`admin`, `moderator`, `player`) with server-side source of truth; permissions checked per-route.

**Schema** (`db/migrations/NNN_roles.sql`):

```sql
CREATE TABLE user_roles (
  user_id TEXT PRIMARY KEY,          -- Clerk user id
  role TEXT NOT NULL CHECK (role IN ('admin','moderator','player')),
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Implementation**:
- `shared/permissions.js` — single permission matrix, e.g.:
  ```js
  export const ROLE_PERMISSIONS = {
    admin:     ["users:read","users:roles:write","questions:read","questions:write","questions:publish","refunds:issue","audit:read","export:any"],
    moderator: ["users:read","questions:read","questions:write","audit:read"],
    player:    []
  };
  ```
- `server/rbac.js` — `getRole(pool, userId)` (default `player`, cache per-request only), `requirePermission(perm)` Express middleware factory: 401 unauthenticated, 403 missing permission. Composes after existing Clerk auth middleware in `server/player-api.js`.
- Mirror role into Clerk `publicMetadata.role` on change (via Clerk backend API) for cheap client-side UI gating — but the DB row is authoritative; server never trusts the claim.
- Role changes go through an admin endpoint (`POST /api/admin/users/:id/role`) which itself requires `users:roles:write` and writes audit (`role.grant` / `role.revoke`). Bootstrap: `scripts/grant-admin.mjs <clerk-user-id>` for the first admin (documented, audited as actor `system:bootstrap`).
- Client: `src/player/` gains a tiny `can(permission)` helper fed from profile payload; used only to hide UI, never to authorize.

**Tests**: matrix unit tests, middleware tests (401/403/200 paths per permission), role-change route tests incl. audit assertion, "player cannot self-promote" test.

**Acceptance**: all `/api/admin/*` routes deny `player` and `moderator` appropriately; denial paths tested; role grant produces audit row; existing player routes unchanged for players.

---

## Phase 3 — Rate limiting + security headers

**What**: token-bucket rate limiting on abuse-prone endpoints; strict security headers.

**Implementation**:
- `server/rate-limit.js` — Postgres-backed fixed-window-with-burst counter (serverless-safe): `rate_limit_counters(key TEXT PRIMARY KEY, window_start TIMESTAMPTZ, count INT)` with `INSERT ... ON CONFLICT` atomic upsert. Key = `route:userId` (signed-in) or `route:ipHash` (guest). Returns `429` with `Retry-After`.
- Budgets (config in `server/rate-limit-config.js`): guest Run start 20/min, question fetch 30/min, score submit 10/min, checkout create 5/min, profile write 10/min, export 2/hour. Generous — protective, not punitive.
- Headers: extend `vercel.json` + Express: `Content-Security-Policy` (script-src 'self' + Clerk + Stripe domains only), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `Strict-Transport-Security`. Verify Clerk/Stripe still load under CSP via Playwright e2e.
- Rate-limit hits recorded as `product-events` (not audit — high volume).

**Tests**: limiter unit tests (window rollover, burst, concurrent upsert), route tests for 429 + `Retry-After`, e2e smoke that app boots under CSP.

**Acceptance**: hammering an endpoint past budget yields 429; normal play never hits limits (e2e proves); securityheaders.com-style checklist documented in `docs/security-headers.md`.

---

## Phase 4 — Webhook inbox (idempotency + retry + dead-letter)

**What**: store-then-process for Stripe and Clerk webhooks.

**Schema** (`db/migrations/NNN_webhook_inbox.sql`):

```sql
CREATE TABLE webhook_inbox (
  provider TEXT NOT NULL,            -- 'stripe' | 'clerk'
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|processed|failed|dead
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id)
);
```

**Implementation**:
- Rework `api/stripe-webhook.js` / `api/clerk-webhook.js`: verify signature (unchanged) → `INSERT ... ON CONFLICT DO NOTHING` (duplicate delivery = 200 no-op) → attempt inline processing in a transaction → mark `processed` or `failed`. Always 200 after successful insert so providers stop retrying; our retry loop owns recovery.
- `server/webhook-processor.js` — pulls `failed`/`pending` rows, retries with attempt cap (5), marks `dead` past cap. Exposed at `POST /api/internal/webhook-retry` guarded by `CRON_SECRET` header; Vercel cron (`vercel.json` `crons`) every 10 min.
- Existing handlers (`server/stripe-lifetime.js`, `server/clerk-webhook-route.js` logic) refactored into pure `processEvent(pool, provider, event)` — the seam both inline path and retry path share. Handlers must be idempotent internally too (they largely are — keep tests proving it).
- Dead rows surface later in admin dashboard (phase 7); until then, `scripts/list-dead-webhooks.mjs`.

**Tests**: duplicate delivery no-op, out-of-order delivery, failure → retry → success, failure ×5 → dead, signature failure still rejected before insert, cron endpoint auth.

**Acceptance**: replaying same Stripe event N times causes one state change; kill-the-DB-mid-process leaves row retryable; suite green including existing `stripe-lifetime.test.js` semantics.

---

## Phase 5 — Observability

**What**: structured logs with request correlation, health/readiness, tracing, error tracking.

**Implementation**:
- `server/logger.js` — pino (JSON), child logger per request with `request_id` (accept inbound `x-request-id` or generate UUID), user id when known. Replace ad-hoc `console` paths; `safe-error-log.js` becomes redaction serializer feeding pino (its PII-safety semantics preserved — reuse its tests).
- Request middleware in `server/player-api.js`: log start/finish with route, status, duration ms. `request_id` echoed in response header and written into audit rows (phase 1 column already there).
- `api/health.js` — liveness: static ok + version (git SHA injected at build). `api/ready.js` — readiness: `SELECT 1`, Stripe key presence, Clerk key presence; 503 with per-check detail on failure.
- Tracing: OpenTelemetry Node SDK, spans for request + pg queries, OTLP export to Grafana Cloud free tier; env-gated (`OTEL_EXPORTER_OTLP_ENDPOINT` unset = disabled, zero overhead locally).
- Errors: Sentry (`@sentry/node` + browser) with release tagging = git SHA; source maps uploaded in build script; PII scrubbing on (`beforeSend` strips user data beyond id).
- Server-side product events already exist (`server/product-events.js`) — forward to PostHog server-side where client events cannot be trusted (checkout confirmed, run authorized).
- `docs/observability.md`: log schema, trace how-to, dashboards, alert suggestions.

**Tests**: logger redaction tests, request-id propagation test, health/ready route tests (each dependency failure → 503 shape), config-off = no-op tests.

**Acceptance**: every request produces one structured log line with `request_id`; `/api/ready` flips 503 when DB unreachable; a checkout flow shows a connected trace; Sentry receives a thrown test error with release tag; bundle budget still passes (Sentry browser SDK counted).

---

## Phase 6 — GDPR data export

**What**: complete the data-rights pair (deletion exists in `server/user-deletion-store.js`).

**Implementation**:
- `server/data-export.js` — `buildUserExport(pool, userId)`: profile, quest progress, journal outcomes, run access history, lifetime purchase record (Stripe ids only, no card data), access settings. Versioned envelope: `{ schema: "echo-maze-export/1", generated_at, data: {...} }`.
- `api/me-export.js` → `GET /api/me/export`, auth required, rate-limited (phase 3: 2/hour), audit-logged (`export.self`). `Content-Disposition: attachment`.
- Admin variant in phase 7 reuses `buildUserExport` (`export:any` permission, audit `export.admin`).
- `docs/data-privacy.md` — deletion + export + retention in one page; note COPPA-minded posture (kid-focused product; journal already privacy-minimized).

**Tests**: export completeness (fixture user with data in every table appears in every section), no-cross-user-leak test, auth + rate-limit + audit assertions.

**Acceptance**: export JSON validates against a checked-in JSON schema (`shared/export-schema.json`); every user-owned table represented; delete-then-export yields empty sections.

---

## Phase 7 — Admin dashboard + question bank in Postgres

**Delivery note (PR #70)**: the bundled Warden Question bank is a deterministic,
unbounded generator rather than the finite source array assumed when this plan
was drafted. A finite SQL seed would silently cap Quest-wide uniqueness and
could not be byte-identical for later ordinals. The delivered design therefore
uses published Postgres rows as an editorial overlay and the bundled generator
as the floor whenever a band has no published rows or Postgres is unavailable.
DB-hit, empty-bank, invalid-row, and DB-failure fallback tests replace the
inapplicable finite-seed equivalence test. Versions record `edited_by`; draft
writers cannot move or delete live content, and publish authority owns every
live-content change.

The consolidated backlog intentionally narrows the operator surface to the
repo-owned data and permissions: a local Explorer directory (not a Clerk
backend search), paged audit viewing, dead-letter viewing, and database-backed
DAU/Run/conversion plus inventory tiles. Manual dead-letter replay is not
exposed under the read-only `webhooks:read` grant; the existing signed inbox
retry path remains the only replay mechanism until a separate mutation
permission and confirmation contract are approved.

Admin mutations use ADR 0013's existing outcome-only, best-effort recorder:
failed or no-op operations do not create false history, while an audit-store
outage is logged and counted without rewriting the completed domain action.
Strict atomic coupling between every domain write, Stripe request, and the
audit chain is not claimed by phase 7; that reliability/tamper-resistance work
belongs with consolidated backlog item 11's separate-owner append path.

**What**: `/admin` SPA area (RBAC-gated) with user management, question CRUD + draft/publish, membership/refund lookup, audit viewer, dead-letter viewer, metrics tiles. Content moves from source arrays to DB with versioning.

**Question bank migration** (`db/migrations/NNN_question_bank.sql`):

```sql
CREATE TABLE questions (
  id TEXT PRIMARY KEY,               -- keep existing stable ids from question-bank.js
  objective_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',  -- draft|published|retired
  current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE question_versions (
  question_id TEXT NOT NULL REFERENCES questions(id),
  version INT NOT NULL,
  body JSONB NOT NULL,               -- prompt, choices, answer, reader-friendly text
  edited_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, version)
);
```

**Implementation**:
- Seed migration imports current `src/questions/question-bank.js` content verbatim (same ids → quest-wide uniqueness rules and existing progress remain valid).
- `server/question-service.js` reads published questions from DB with in-function memo + short TTL; **fallback to bundled bank on DB failure** so gameplay never breaks (test this explicitly). Client keeps receiving the same shape — zero client gameplay changes.
- Admin API under `/api/admin/*` (all `requirePermission`, all audited): user search (Clerk backend API + local join), role management (phase 2 endpoint), question CRUD (writes new `question_versions` row, publish flips status + bumps `current_version`), membership lookup + refund trigger (`stripe.refunds.create`, audited `refund.issue`, updates lifetime state via existing domain logic), audit log query endpoint (filters: actor, action, resource, date), dead-letter list + manual retry (phase 4), metrics tiles endpoint (DAU from product events, runs started, lifetime conversions).
- Frontend: `src/admin/` following existing vanilla controller/view pattern (`*-controller.js` / `*-view.js` — match `src/player/access-settings-view.js` style, no framework). Route `/admin` in the SPA; hidden unless `can('audit:read')`. Design tokens from `tokens.css` / `design.md` — this is UI work: desktop + mobile screenshots required in PR, slop-test gate applies.
- Refund semantics: refund revokes lifetime unlock but never claws back completed progress (document in `docs/lifetime-membership-operations.md`).

**Tests**: question service DB/fallback paths, version bump + publish flow, refund route (Stripe mocked, state + audit asserted), admin route permission matrix sweep (every endpoint × every role), seed migration equivalence test (DB content === bundled bank), view tests per existing pattern, e2e: admin logs in, edits question, publishes, plays and sees it.

**Acceptance**: content editable without deploy; every admin action visible in audit viewer; player experience byte-identical when DB matches seed; e2e green.

---

## Phase 8 — Multi-tenancy: classrooms/organizations + Postgres RLS

**What**: teacher/classroom model on Clerk Organizations; tenant isolation enforced in the database, not just app code.

**Schema** (sketch — final design during implementation spec):

```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,               -- Clerk org id
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'classroom',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE org_memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  org_role TEXT NOT NULL CHECK (org_role IN ('teacher','student')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
-- org_id TEXT NULL column added to: quest progress, journal outcomes, scores tables.
-- NULL = personal/consumer play (existing behavior untouched).
```

**RLS**: enable on tenant-scoped tables; policy `USING (org_id IS NULL OR org_id = current_setting('app.org_id', true))`; every pooled connection sets `app.org_id` (and `app.user_id`) per request via `SET LOCAL` inside a transaction wrapper in `server/database.js`. App role loses `BYPASSRLS`. This is the load-bearing claim: an app-layer bug cannot leak cross-tenant rows.

**Implementation**:
- Clerk Organizations for membership/invites (teacher creates class → invite link; student joins → `org_memberships` row via Clerk webhook, through phase 4 inbox).
- Teacher dashboard: `src/admin/`-style area at `/class` for `teacher` org-role — per-student objective mastery aggregated from journal outcome data (respecting its minimization: aggregate counts only, never per-question timestamps), class progress overview. This is the exec-demo centerpiece.
- Student play flow unchanged; when playing "in" a class, progress rows carry `org_id`. Personal play (`org_id NULL`) coexists.
- Free-run/lifetime semantics per account, unchanged — classes don't alter monetization (explicit non-goal this phase; school licensing is future work).
- Riskiest phase: every store touched. Strategy: migration adds nullable column + RLS with permissive NULL policy first (zero behavior change, full suite must pass), then org write paths, then teacher reads. Three PRs, not one.

**Tests**: RLS isolation tests hitting pg directly (user in org A cannot read org B rows even with crafted queries through app role), `SET LOCAL` wrapper tests (setting leaks between pooled requests = the classic bug — test it), membership webhook flow, teacher aggregate correctness, existing consumer-flow suite untouched and green.

**Acceptance**: cross-tenant read attempt returns zero rows at the DB layer; consumer play regression-free; teacher sees only own class; three-PR sequence each independently green.

---

## Phase 9 — SSO / Google Workspace auto-join

**What**: school-friendly sign-in; domain-based auto-join to organization.

**Implementation**:
- Google OAuth via Clerk (config, free tier). SAML/OIDC enterprise connections documented as paid-tier upgrade path in `docs/sso.md` — do not build custom SAML.
- `org_domains(org_id, domain)` table: teacher registers verified domain (verification = teacher's own email on that domain, keep simple); on first sign-in with matching domain, auto-create `org_memberships` row as `student` (through Clerk webhook → phase 4 inbox → phase 8 membership path). Audited (`org.autojoin`).
- Guardrails: auto-join only into `kind='classroom'` orgs with the flag enabled; teacher can revoke members; public email domains (gmail.com etc.) rejected via blocklist.

**Tests**: domain match/auto-join, public-domain rejection, revoke flow, no-domain-match = normal consumer signup.

**Acceptance**: sign in with `student@school.org` → lands in the school's class with zero clicks; `@gmail.com` cannot create auto-join.

---

## Cross-cutting definition of done (whole plan)

- [ ] All nine phases merged to `main` via squash PRs, branches deleted, no parked PRs left open.
- [ ] `npm run check:full` green on final `main`.
- [ ] No GitHub Actions workflows added; Actions disabled on repo.
- [ ] Every mutating endpoint: RBAC-checked (or explicitly public), rate-limited or exempt-by-decision, audit-logged, structured-logged with `request_id`.
- [ ] `docs/` updated: `security-headers.md`, `observability.md`, `data-privacy.md`, `sso.md`, admin operations additions to `lifetime-membership-operations.md`, ADR per phase in `docs/adr/`.
- [ ] Chain verification script, admin bootstrap script, dead-webhook script documented in README or docs.
- [ ] Existing gameplay invariants regression-free (full existing suite untouched in semantics and green).

---

## Execution

This document is the authoritative spec. Execution happens in a dedicated Claude Code session using the kickoff prompt provided alongside this plan. Progress is logged per phase in `docs/plans/enterprise-hardening-log.md` (created during phase 1).
