# Unfinished Features — Consolidated Backlog

Generated: 2026-07-27 | Updated: 2026-07-28 after PR #94 delivery

## Summary

17 items were catalogued here; all 17 are delivered in repository scope. The
four product plans (master plan, roadmap, entry, membership) and all 23
`.scratch` specs/tickets are also delivered — their unchecked checkboxes are
stale, not open work. PR #94 closes the final two items with bounded
server-authoritative replay and a replay-verified current-UTC Daily board.
Migration 0018 is authored and tested but intentionally not applied to a live
database; that remains an external operator action. Daily routes reuse the
existing leaderboard function, preserving the enforced Vercel function ceiling.

## Backlog

### 1. Wire scheduled pruning into the cron endpoint — [PARTIAL] — DONE, PR #64

- What: Guest rate-limit counter rows go dead daily as address hashes rotate, and processed webhook-inbox rows accumulate. Pruning exists only as manual CLI scripts; the daily cron endpoint never calls it.
- Why it matters: Unbounded table growth in production with no operator action; ADR 0014 explicitly names the cron endpoint as "the natural place to call it on a schedule."
- Source: docs/adr/0014-serverless-rate-limits-and-strict-headers.md (Consequences); docs/security-headers.md ("Maintenance")
- Evidence checked: Read `server/internal-route.js` — cron route calls only `inbox.retryPending()` (lines 79–97), no prune call. `scripts/prune-rate-limits.mjs` and `store.prune` (`server/rate-limit.js:169`) exist and work.
- Touches: server/internal-route.js, server/rate-limit.js, server/webhook-inbox.js, tests
- Depends on: none
- Effort: S
- Acceptance criteria:
  - [x] `POST /api/internal/webhook-retry` (or the same cron entry) invokes rate-limit prune and webhook-inbox prune in addition to retryPending
  - [x] Tests assert prune is called on the cron path and failures don't abort retryPending

### 2. Document hardening env vars in `.env.example` — [PARTIAL] — DONE, PR #65

- What: Phases 1/3/4/5 added ~10 optional env vars (`REQUEST_ADDRESS_SALT`, `TRUST_PROXY_HEADERS`, `CRON_SECRET`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT/HEADERS`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE`, `POSTHOG_API_KEY`, `POSTHOG_HOST`). Each hardening-log entry deferred updating `.env.example`; the debt was never picked up.
- Why it matters: Operators provisioning a new environment have no single source listing the observability/security knobs.
- Source: docs/plans/enterprise-hardening-log.md — Phase 1 deviation 4, Phase 3 deviation 7, Phase 4 deviation 6, Phase 5 deviation 7
- Evidence checked: Read `.env.example` — contains only question-provider, Clerk, DB, enforcement, Stripe vars; none of the hardening vars. Note `tests/operations-contract.test.js:13` pins parts of this file.
- Touches: .env.example (NOT .env), tests/operations-contract.test.js
- Depends on: none
- Effort: S
- Acceptance criteria:
  - [x] Every env var read by server/ and src/ appears in `.env.example` with a comment and safe default
  - [x] `tests/operations-contract.test.js` still green (updated if it pins the file)

### 3. Pre-push hook names the failing step — [NOT_STARTED] — DONE, PR #66

- What: `.githooks/pre-push` is `set -eu; npm run check`; when a step fails the push aborts without saying which step failed. Called out twice in the hardening log as an out-of-scope follow-up after it silently blocked a push.
- Why it matters: "The gate is green" and "the push landed" are separate facts; silent failure wastes contributor time.
- Source: docs/plans/enterprise-hardening-log.md — Phase 4 gate note; PR #61 closing note
- Evidence checked: Read `.githooks/pre-push` — verbatim two-liner, unchanged.
- Touches: .githooks/pre-push
- Depends on: none
- Effort: S
- Acceptance criteria:
  - [x] A failing lint/typecheck/test/build step prints which step failed before the hook exits nonzero
  - [x] Passing path behavior unchanged

### 4. `/admin` client route guard reading the mirrored Clerk role — [NOT_STARTED] — DONE, PR #67

- What: ADR 0015 mirrors the DB-authoritative role into Clerk `publicMetadata.role` on every change specifically so a client can gate an `/admin` route before the first profile fetch resolves. Nothing reads the mirror yet.
- Why it matters: Entry ticket for the whole phase-7 admin surface; without it there is no admin UI shell to attach anything to.
- Source: docs/adr/0015-database-authoritative-roles.md — Decision ("The Clerk claim is a mirror, written but never read"); docs/plans/enterprise-hardening-plan.md — Phase 7
- Evidence checked: `src/player/can.js` reads only the `access` field from `/api/profile` (lines 9–27); grep `publicMetadata` in src/ — no app read. Mirror write exists (`mirrorRole`, `server/admin-route.js:97`). No `src/admin/` directory.
- Touches: src/player/can.js, src/player/clerk-browser.js, new src/admin/ entry, src/app.js routing
- Depends on: none
- Effort: S
- Acceptance criteria:
  - [x] Navigating to `/admin` as a non-admin shows a denial state without any admin data fetch
  - [x] Admin role (from Clerk mirror, confirmed by profile fetch) renders the admin shell

### 5. Admin data export (`export:any`) — [NOT_STARTED] — DONE, PR #68

- What: An admin-initiated GDPR export of any Explorer's data, reusing `buildUserExport` unchanged, gated by the already-declared `export:any` permission and audited as `export.admin`.
- Why it matters: GDPR/support workflows currently require direct DB access; the permission exists but no route consumes it.
- Source: docs/adr/0018-gdpr-data-export.md — Consequences; docs/data-privacy.md ("Export")
- Evidence checked: grep `export:any|export.admin` — `shared/permissions.js:21` and tests only (`tests/permissions.test.js:47`, `tests/rbac.test.js:243`); no consuming route. Self-export exists: `server/data-export.js`, `server/data-export-route.js`.
- Touches: server/admin-route.js (new sub-path on existing api/admin.js function — 12-function ceiling), server/data-export.js (reuse), tests
- Depends on: none (UI exposure depends on 8)
- Effort: S
- Acceptance criteria:
  - [x] Admin with `export:any` can fetch another user's export matching `shared/export-schema.json`
  - [x] Call is audited as `export.admin`; non-admin gets 403

### 6. Dead-webhook surfacing for admins — [PARTIAL] — DONE, PR #69

- What: Webhook deliveries that fail five times go `dead`; today `scripts/list-dead-webhooks.mjs` (CLI, exit-nonzero) is the only consumer. ADR 0016 says "phase 7 surfaces them in the dashboard."
- Why it matters: A dead delivery can be a lost refund; operators shouldn't need shell access to notice.
- Source: docs/adr/0016-store-then-process-webhook-inbox.md — Decision ("Failures escalate, then stop"); docs/plans/enterprise-hardening-plan.md — Phase 7
- Evidence checked: `scripts/list-dead-webhooks.mjs` exists (`npm run webhooks:dead`); `server/admin-route.js` serves only the role path (`ROLE_PATH` regex, line 7); no route reads the inbox.
- Touches: server/admin-route.js, server/webhook-inbox.js, tests; UI in 8
- Depends on: 4 (for UI), none for API
- Effort: S
- Acceptance criteria:
  - [x] Admin API sub-path lists dead deliveries with id, type, failure count, last error
  - [x] Permission-gated; non-admin 403; covered by tests

### 7. Question bank in Postgres with bundled fallback — [DELIVERED] — DONE, PR #70

- What: Move question content from the bundled `src/questions/question-bank.js` into DB tables (`questions`, `question_versions`) with draft/publish versioning, keeping the bundled bank as fallback when the DB is unreachable.
- Why it matters: Content updates currently require a code deploy; phase 7's question CRUD needs a storage home first.
- Source: docs/plans/enterprise-hardening-plan.md — Phase 7
- Evidence checked: `db/migrations/0010_question_bank.sql` defines constrained question/version tables; `server/question-bank-store.js` serves exact published ordinal overlays and `server/question-service.js` falls back to the bundled generator for absent, invalid, or unavailable DB content. Admin draft/publish/delete routes consume `questions:*` permissions.
- Touches: db/migrations/0010_question_bank.sql, server/question-bank-store.js, server/question-service.js, server/admin-route.js, tests
- Depends on: none; the migration was explicitly approved for this delivery.
- Effort: L
- Acceptance criteria:
  - [x] Reviewed questions served from DB when configured; bundled bank fallback verified by test
  - [x] Draft/publish versioning with only published questions reaching players

### 8. Admin dashboard UI — [DELIVERED] — DONE, PR #70

- What: The `/admin` SPA area from phase 7: user listing and role management, question CRUD, membership/refund lookup, audit-log viewer, dead-letter viewer, metrics tiles. Only the role-change endpoint (`POST /api/admin/users/:id/role`) and RBAC plumbing exist.
- Why it matters: ADR 0015 admits "the moderator role currently grants nothing enforceable" — the permission matrix is dead weight until this ships.
- Source: docs/plans/enterprise-hardening-plan.md — Phase 7; docs/adr/0015-database-authoritative-roles.md — Decision
- Evidence checked: `src/admin/admin-view.js` renders permission-aware users, questions, membership/refund, audit, dead-delivery, metrics, and export surfaces. `server/admin-route.js` has method-specific guards for every declared permission, and `server/admin-store.js` supplies the operator read models.
- Touches: src/admin/, server/admin-route.js, server/admin-store.js, server/question-bank-store.js, server/stripe-lifetime.js, api/admin.js, tests
- Depends on: 4, 5, 6, 7
- Effort: L
- Acceptance criteria:
  - [x] Each declared permission in shared/permissions.js has at least one enforced consuming route + UI surface
  - [x] Audit viewer pages through audit_events; role changes and refund lookups audited

### 9. Explorer Access Settings profile sync — [DELIVERED] — DONE, PR #81

- What: Access settings shipped device-local by ADR 0011; the roadmap lists "persistent local settings with optional profile sync later." Settings currently never reach the server.
- Why it matters: Accessibility preferences vanish on device change — worst for the users who need them most.
- Source: docs/plans/echo-maze-prioritized-feature-roadmap.md — §11 Recommended MVP; docs/plans/enterprise-hardening-log.md — phase 1 deviation 3, phase 6 deviation 2
- Evidence checked: `server/access-settings-route.js` and `server/access-settings-store.js` provide authenticated optimistic synchronization; `shared/export-schema.json` requires `access_settings` in `echo-maze-export/2`; account deletion removes and verifies the row.
- Touches: server/player-store.js or new store, src/player/access-settings.js, migration (STOP-and-ask), privacy review of export schema
- Depends on: none
- Effort: M
- Acceptance criteria:
  - [x] Signed-in Explorer's settings persist across devices; guests stay device-local
  - [x] Synced settings appear in the GDPR export and deletion path

### 10. Guest demo server-side entitlement enforcement — [DELIVERED] — DONE, PR #70

- What: The one-free-Run guest demo boundary is browser-local only; clearing storage resets it indefinitely. ADR 0007 made *signed-in* Run Access server-authoritative; the guest gate was named out-of-scope, not solved.
- Why it matters: The free-demo funnel to the $5.99 membership is trivially bypassable by anonymous users.
- Source: docs/adr/0006-demo-account-gate.md — Consequences ("server-side entitlement enforcement is outside this change")
- Evidence checked: `server/guest-demo-store.js` enforces one admitted Run per daily hashed-address bucket with full-Run idempotency; `server/run-access-route.js` exposes the public admission boundary with pre-transaction throttling and fail-open degradation; ADR 0019 records the privacy tradeoff.
- Touches: server/guest-demo-store.js, server/run-access-route.js, server/rate-limit-config.js, server/player-api.js, src/player/player-controller.js, tests
- Depends on: none; the daily rotating hash approach was explicitly approved and stores neither raw addresses nor raw Run facts.
- Effort: M
- Acceptance criteria:
  - [x] A repeat guest from the same hashed address cannot mint unlimited free Runs by clearing storage
  - [x] Privacy posture (daily-rotating hash, no raw address storage) preserved per ADR 0014

### 11. Audit-chain tamper-proofing (separate owner + external anchoring) — [DELIVERED] — DONE, PR #81

- What: The audit log is tamper-evident, not tamper-proof: the app role can drop the append-only triggers and rechain history. Fix needs (a) a separate non-login table owner or SECURITY DEFINER append function, and (b) periodic chain checkpoints (HMAC/signature over `(max(id), row_hash)`) anchored outside the database.
- Why it matters: Defeats the purpose of the audit chain against exactly the attacker it exists for (compromised app credentials).
- Source: docs/adr/0013-tamper-evident-audit-log.md — "What this does not defend against"; docs/plans/enterprise-hardening-log.md — Phase 1 CodeRabbit dismissed items 1–2 ("Deferred rather than declined")
- Evidence checked: migrations 0012-0013 transfer audit ownership to `echo_maze_audit_owner`; runtime appends only through `append_audit_event(text)`; `server/audit-checkpoint.js` writes HMAC-signed create-only Object Lock checkpoints; `scripts/verify-audit-chain.mjs` verifies the database chain and every retained external anchor.
- Touches: new db migration (STOP-and-ask), server/audit-store.js, scripts/verify-audit-chain.mjs, external sink; the Neon role change itself is infra outside the repo
- Depends on: none (external sink availability helps)
- Effort: M
- Acceptance criteria:
  - [x] Append path works without the app role owning audit tables (or via SECURITY DEFINER)
  - [x] Checkpoint adapter and opt-in immutable-sink proof land outside the DB; `verify-audit-chain` validates retained anchors

### 12. Phase 8 — Multi-tenancy: classrooms/orgs + Postgres RLS — [DELIVERED] — DONE, PRs #81-#83

- What: Clerk Organizations for a teacher/classroom model; `organizations`/`org_memberships` tables; nullable `org_id` on tenant-scoped tables; Postgres RLS via `SET LOCAL app.org_id` per request; teacher dashboard at `/class`. Plan mandates a three-PR migration-first sequence.
- Why it matters: Unlocks the education market the hardening plan targets; plan calls it the riskiest phase.
- Source: docs/plans/enterprise-hardening-plan.md — Phase 8; docs/adr/0015-database-authoritative-roles.md — Consequences (org_role deliberately kept out of user_roles)
- Evidence checked: migrations 0014-0016 establish Classroom authority, nullable Classroom ownership, forced RLS, and the count-only Teacher projection. Signed Clerk organization webhooks synchronize Membership authority; Class Play writes through tenant transactions; `/class` covers signed-out, Student, Teacher, loading, empty, stale, and error states. Live PostgreSQL tests prove crafted cross-Class reads/writes return no rows or fail with `42501`.
- Touches: db/migrations/ (STOP-and-ask), server/database.js (SET LOCAL transaction wrapper), every store, new teacher UI, webhook inbox for Clerk org events
- Depends on: 8 (admin surface helps operate it); hard prerequisite for 13, 14
- Effort: L
- Acceptance criteria:
  - [x] RLS denies cross-org reads even with application-layer bugs (tested)
  - [x] Teacher can create a Classroom, invite Students, and see only count-minimized progress for owned Classrooms

### 13. Classroom-aware `question.fetch` rate budget — [DELIVERED]

- What: `GET /api/question` uses optional Clerk authentication to key signed-in
  Explorers by user while preserving the existing address-hash budget for
  guests.
- Why it matters: A 30-student classroom exhausts the question budget in the first minute of a lesson.
- Source: docs/adr/0014-serverless-rate-limits-and-strict-headers.md — "Rate limiting"; docs/security-headers.md — "Rate limits"
- Evidence checked: `server/question-api.js` composes optional Clerk middleware;
  `server/question-route.js` passes the resolved user id to the durable limiter;
  route tests prove signed-in users behind one address do not share a budget and
  guests remain address-keyed.
- Touches: server/question-api.js, server/question-route.js, tests
- Depends on: 12
- Effort: M
- Acceptance criteria:
  - [x] Authenticated members of an org draw from a per-org or per-user budget, not per-address
  - [x] Anonymous budget unchanged

### 14. Phase 9 — SSO / Google Workspace auto-join — [DELIVERED]

- What: Google OAuth via Clerk; `org_domains` table with teacher domain verification; auto-create student memberships on matching-domain sign-in; public-domain blocklist; `docs/sso.md`.
- Why it matters: Schools won't hand-provision accounts; domain auto-join is the standard onboarding path.
- Source: docs/plans/enterprise-hardening-plan.md — Phase 9
- Evidence checked: migration 0017 stores one verified non-public domain per
  Classroom behind forced RLS; Teacher GET/PUT domain routes verify the exact
  primary email domain; minimized `user.created`/`user.updated` events request
  an idempotent Clerk `org:member` Membership; the later signed Membership event
  remains PostgreSQL authority. `docs/sso.md` covers setup and recovery.
- Touches: migration 0017, existing Classroom and Clerk webhook functions,
  Teacher UI, docs/sso.md
- Depends on: 12
- Effort: M
- Acceptance criteria:
  - [x] Sign-in with a verified org domain auto-joins the matching org; public domains blocklisted
  - [x] docs/sso.md documents setup and failure modes

### 15. Gate Warden curated capstone Question cards — [DELIVERED]

- What: MVP Gate Wardens (Labyrinths 4/8/12/16/20) reuse the next reviewed band-matched question; the roadmap says "a later content pass may curate special capstone cards."
- Why it matters: Milestone encounters feel identical to regular Wardens; pure content polish, code-light.
- Source: docs/plans/echo-maze-prioritized-feature-roadmap.md — §8.2 "Question source"
- Evidence checked: `src/questions/question-bank.js` contains 15 reviewed
  capstones across all five bands and three levels; the first Gate Warden
  attempt requests the capstone kind, while retries fall back to the ordinary
  reviewed deck. Service tests prove capstones bypass unreviewed overlays and
  providers, and every card passes the same normalizer as the reviewed bank.
- Touches: src/questions/question-bank.js, server/question-service.js,
  src/main.js, tests
- Depends on: none
- Effort: M
- Acceptance criteria:
  - [x] Gate Warden encounters draw from a curated capstone deck when available, band-matched fallback otherwise
  - [x] Capstone cards pass the same review/validation path as the reviewed bank

### 16. Server-authoritative action replay (anti-cheat) — [DELIVERED] — DONE, PR #94

- What: A modified client can fabricate plausible Run facts; the score route only recalculates from bounded client-supplied inputs. ADR 0005 says a cheat-resistant scoreboard "would require server-authoritative action replay and is outside this change."
- Why it matters: Global Scoreboard integrity rests on client honesty; also the prerequisite for any verified competitive claim (17).
- Source: docs/adr/0005-authenticated-profiles-and-global-scoreboard.md — "Security and integrity boundaries"
- Evidence checked: `src/game/run-action-log.js` records only accepted replay
  actions; `server/run-replay.js` validates bounded logs and replays the
  canonical Run through `createRun`/`applyAction`; ADR 0024 records trust,
  versioning, limits, compatibility, migration, and rollback.
- Touches: `src/game/run-action-log.js`, `server/run-replay.js`,
  `server/daily-route.js`, tests
- Depends on: none; ADR 0024 records the approved architecture decision.
- Effort: L
- Acceptance criteria:
  - [x] Server re-simulates a submitted Run from seed + action log and rejects divergent scores
  - [x] Existing casual submission path still works during rollout and is explicitly labelled `casual-v1`

### 17. Verified Global Daily Labyrinth ranking — [DELIVERED] — DONE, PR #94

- What: A server-verified global leaderboard (ranking/streaks/rewards) for the Daily Shared Labyrinth. Casual personal Daily shipped (PR #54); global ranking was explicitly deferred "until the server can verify action replay or the product accepts a casual trust model."
- Why it matters: The competitive layer of the Daily loop; blocked on an explicit fairness decision.
- Source: docs/plans/echo-maze-prioritized-feature-roadmap.md — §12; docs/plans/echo-maze-lifetime-membership-and-echo-atlas-master-plan.md — §25 P3; docs/adr/0012-utc-casual-daily-shared-labyrinth.md — Decision
- Evidence checked: `server/daily-route.js` and `server/daily-store.js` accept
  replay-derived current-date entries; migration 0018 retains one best row per
  Explorer/date; `/api/daily/leaderboard` exposes a privacy-minimized Top-10;
  the Daily dialog covers signed-in, Guest, loading, empty, rejected, network,
  unavailable, UTC rollover, keyboard, reduced-motion, and 200-percent states.
- Touches: `db/migrations/0018_verified_daily_entries.sql`, Daily route/store,
  shared leaderboard function, player client/controller, Daily dialog, tests
- Depends on: 16, delivered in the same PR.
- Effort: L
- Acceptance criteria:
  - [x] Daily submissions are verified through feature 16 before persistence
  - [x] Top-10 Daily board is scoped to current UTC date and idempotent resubmission is tested

## Already Implemented (docs are stale)

| Feature | Doc claims | Reality (file:line) |
|---|---|---|
| All 4 `.scratch` specs + 15 tickets (question combat, quest progression 20-labyrinth, rewards/score, profile+scoreboard APIs, four-plan tickets 1–8) | Every acceptance checkbox literally unchecked `- [ ]` | Delivered per `docs/plans/implementation-coverage.md` (29/30 rows Delivered); e.g. `server/question-service.js:252-442`, `src/questions/quest-levels.js:26-196`, `src/game/game-session.js:401-423`, `server/player-store.js:148,189` |
| Cloud Quest Continuity | Master plan §17 "Next / separate release"; roadmap §9 | `src/game/quest-continuity.js`, `server/quest-progress-route.js`, `db/migrations/0004_cloud_quest_progress.sql` (PR #52, ADR 0009) |
| Lantern Journal cloud storage | Roadmap §10: "explicitly deferred until privacy and deletion behavior are approved" | `db/migrations/0005_lantern_journal.sql:7-18` (bounded, tombstoned), `server/learning-journal-store.js` (PR #55, ADR 0010) |
| Explorer Access Settings (local MVP) | Master plan §17 order 7 "P2 / Later" | `src/player/access-settings.js`, `access-settings-view.js` (PR #53, ADR 0011) |
| Daily Shared Labyrinth (casual) | Master plan §17 order 8 "P3 / Later" | `src/game/daily-labyrinth.js`, `tests/e2e/daily.spec.js` (PR #54, ADR 0012) |
| Enterprise hardening phases 1–6 | Plan checkboxes | Migrations 0006–0009, `server/audit*.js`, `rbac.js`, `rate-limit*.js`, `security-headers.js`, `webhook-inbox.js`, `logger.js`, `tracing.js`, `data-export*.js`, ADRs 0013–0018 |
| `prefers-reduced-motion` respected | MASTER.md Pre-Delivery Checklist unchecked | `src/daylight.css`, `src/styles.css` |
| Run Records (5 strongest, outcomes, seed replay), distinct-seed retry, swipe movement, Space/Q pulse, Warden mode text labels | design-system/echo-maze/pages/game.md stated as spec | `src/game/storage.js:3,118,210`; `src/main.js:306,351,1282-1286,2719-2721,2741-2756` |
| Warden Hunt/Intercept threshold tests | ADR 0001 "tuning hypotheses… must be covered" | `tests/game-session.test.js:269,297`; e2e evidence in docs/release-readiness.md |

## Excluded / Ambiguous

- **Live Stripe billing activation** (spec.md Out of Scope; coverage C27 "Deferred — external approval") — operational: live Product/Price, env secrets, $5.99 smoke purchase+refund, `RUN_ACCESS_ENFORCEMENT_ENABLED` flip. No engineering gap; blocked on external approvals.
- **Production provisioning** (scoreboard-spec "Open deployment inputs") — Clerk prod keys, Vercel linking, Neon production migration. External dashboard state, unverifiable from repo. UNVERIFIED.
- **Non-owner DB runtime role** (hardening log phase 1) — "a database provisioning change, not a code change; this repo does not own Neon role setup." Infra half of backlog item 11.
- **Webhook retry every 10 min** (ADR 0016) — one-line `vercel.json` change blocked on paid Vercel plan; owner decision, not code work.
- **Sentry source-map upload** (hardening log phase 5) — deliberate: `@sentry/cli` not on allowed dependency list; production path is the Vercel Sentry integration (config, not code).
- **Observability alert rules** (docs/observability.md "Alert suggestions") — live in Grafana/Sentry/PostHog; UNVERIFIED from repo.
- **Keyed-environment verification of sign-in + Checkout under CSP** (ADR 0014; docs/security-headers.md) — one-time manual ops check; leaves no code artifact. UNVERIFIED.
- **Clerk custom-domain CSP entry** (docs/security-headers.md) — conditional: only needed if/when a Clerk custom domain is configured.
- **Manual assistive-technology acceptance pass** (docs/release-readiness.md) — manual QA evidence, not code.
- **Log shipping + question-provider tracing spans** (ADR 0017 "What this does not do") — documented non-goals.
- **Cloud mid-Run cross-device resume** (master plan §25; roadmap §9) — explicit non-goal; building it would contradict ADR 0009 unless the ADR is revised first.
- **Spec Out-of-Scope lists** (.scratch specs): multiplayer, teacher dashboards beyond phase 8, free-text/voice answers, adaptive profiling, subscriptions/coupons/tiers, paid combat advantages, model-authored free-form child questions, visual rebrand — excluded by design, no code by intent.

## Suggested Execution Order

1, 2, 3 — independent S-size hygiene, zero risk, build momentum. Done: PRs #64-#66.
4 — admin shell guard; unblocks all admin UI work. Done: PR #67.
5, 6 — small admin API sub-paths on the existing function; each independently shippable after 4. Done: PRs #68, #69.
7, 8 — question bank storage and admin dashboard UI. Done: PR #70.
9 — settings sync. Done: PR #81.
10 — guest demo enforcement. Done: PR #70.
11 — audit anchoring. Done: PR #81; live immutable-sink provisioning stays external.
12 — phase 8 multi-tenancy. Done: PRs #81–#83.
13, 14 — delivered after 12 in PR #88.
15 — curated capstone content. Done: PR #88.
16, 17 — bounded replay plus verified Daily ranking. Done together: PR #94.
