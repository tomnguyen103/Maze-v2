# A+ audit report — Echo Maze

**Run:** 1 (no prior report — this file is the trend baseline for the next run)
**Date:** 2026-08-03
**Commit audited:** `5e55e3a`
**Mode:** `heavier` armed. Healthcare not armed — data class is minors' PII plus
payment, no PHI or clinical data.
**Status:** plan approved 2026-08-03; **no fixes implemented**. Step 5 deferred at
the operator's request.

Sixteen parallel audit lanes ran read-only over 405 indexed files, followed by
twelve adversarial verification agents. Steps 1–4 changed zero code.

Interactive dashboard: <https://claude.ai/code/artifact/c0c2eeec-8d51-4826-a69a-0561df38dcd8>
Lane evidence: session scratchpad `audit-out/<lane>.md` (not committed — regenerate
by re-running the audit).

---

## 1. Grades

| Dimension | Grade | Δ vs last | Blocking gap |
|---|---|---|---|
| Correctness | B | n/a — first run | 7 confirmed high findings open; worst is `Q-04`, a plain `Error` escaping the `ReplayInputError` catch at `server/player-api.js:447` → 500 poison-pill loop, receipt never terminally rejected. Deterministic game rules themselves verified clean. |
| Security | B\* | n/a — first run | One confirmed High survives verification: `SG-13`, anonymous unmetered `/api/leaderboard` with an attacker-growable partition sort (`server/player-api.js:947`). **Asterisk is mandatory: gitleaks never ran, so secrets are ungraded.** |
| Performance | C | n/a — first run | Measured LCP fails on 100% of routes (3,633–4,868 ms vs 2,500 ms) with Load Delay and Load Time both exactly 0 — all render delay. Plus a confirmed 4,594 ms synchronous server replay. |
| Testing | C | n/a — first run | A flake was reproduced (`Q-14`), and the repo's strongest security test — forced-RLS cross-tenant denial — executes nowhere (`tests/classroom-rls.integration.test.js:19`). |
| Maintainability | C | n/a — first run | Copy-first duplication has produced live divergences, not just repetition: `questIdentityMatches` exists 7× and the server copy already behaves differently (`shared/offline-receipt.js:139`). |
| DX / CI | A | n/a — first run | Meets the operational definition — `npm run check` ran end to end, `CHECK_EXIT=0`, all five steps, all 15 bundle budgets PASS. Held off A+ only because the gate's coverage gaps are real; those are graded under Testing. |
| Front-End | C | n/a — first run | 53–56/58 slop gates · 18 app-shell violations · dashboard G1/G3/G5/G9 FAIL · primary CTA measured off-viewport at 390 px · 15 of 18 focusables with no visible focus indicator. |
| Back-End | B | n/a — first run | Framework correctness is strong (4 findings total). Held at B by the definition's "migrations safe" clause: three migrations mutate already-live tables without `CONCURRENTLY` or a documented quiesce. |

### Terminable A+ definitions used

- **Correctness** — zero confirmed crit/high correctness findings open.
- **Security** — zero confirmed crit/high, and all step-4b tools ran clean. Graded
  only on the 4d-verified set.
- **Performance** — no measured budget violation on key pages; zero confirmed perf
  must-fix open.
- **Testing** — every must-fix behavior change test-covered; no flaky test found.
- **Maintainability** — zero confirmed must-fix open.
- **DX/CI** — local gate runs clean end to end.
- **Front-End** — 58/58 slop gates + zero app-shell violations + dashboard checkable
  G-gates clean + `design.md` conformance + browser-verified a11y + zero new must-fix.
- **Back-End** — zero confirmed crit/high framework/data-layer findings; migrations safe.

### What came back genuinely strong

A findings list distorts the picture, so this is stated plainly. Classroom
multi-tenancy is enforced by real `FORCE RLS` plus `SECURITY DEFINER` at the SQL
layer across 26 tables — not convention-only JS scoping. The tenant GUC is
transaction-local (`set_config(…, true)`, `server/tenant-context.js:33`), `BEGIN`
precedes the set, and a failed ROLLBACK destroys the connection rather than
returning it to the pool. Webhook idempotency, the audit hash chain, fail-closed
RBAC, fail-closed offline-receipt verification, and server-side replay — which
reads windows from the *stored* receipt, never the presented one — all held up
under direct attack. Zero committed secrets. Zero import cycles. `osv-scanner`
and `npm audit` clean; all 8 semgrep findings confirmed false positives.

---

## 2. Front-end sub-metrics

### Hallmark slop gates

| Surface | Score | Failing gates | Macrostructure verdict |
|---|---|---|---|
| `/` landing | 56 / 58 | 44, 51 | Intentional structure |
| `/play` Workbench | 53 / 58 | 5, 20, 25, 38, 48 | Intentional structure |
| `/play` dialogs (14) | 54 / 58 | 20, 23, 38, 48 | Intentional — except `level-dialog` |
| `/admin` | 55 / 58 | 5, 25, 38 | Intentional structure |
| `/class` | 55 / 58 | 5, 38, 48 | Intentional structure |

Gates 40/41 (contrast), 34 (overflow), 24 (spacing scale — zero literal values
project-wide) and 39 (input states) pass everywhere. Token discipline is
exemplary: zero raw hex/rgb/hsl/oklch outside `tokens.css`.

`design.md` conformance: **B−**. Nine cited divergences, including the
one-decision rule, the 16 px dialog body floor, and 3 px borders against the
stated "two-pixel navy" MUST.

### App-shell contract — violation count

| Surface | Applicability | Violations |
|---|---|---|
| `/` landing | Exempt — marketing surface | N/A |
| `/play` | Exempt — single-screen game; all 13 `showModal()`, none URL-addressable | N/A |
| `/admin` | In scope — 6 permission-gated staff areas | 12 |
| `/class` | In scope — 5 distinct workflow sections | 8 |

`SHELL-11` is the root cause of 7 of the 18: the shell is re-implemented four
times with no single layout owner.

### Dashboard G-gate scorecard

| Gate | `/admin` "Operations pulse" | `/class` debrief + Constellation |
|---|---|---|
| G1 signed brief | FAIL — absent entirely | FAIL — ADR 0042/0043 are privacy records, not a brief |
| G2 data contract | UNVERIFIED — no local DB | UNVERIFIED — no local DB |
| G3 layout matrix | FAIL — no 12-col grid, zero filters, no hero | FAIL — reads interleaved with write-forms |
| G4 palette | PASS — 14.06:1 and 7.18:1 | FAIL — validator exit 1, light-end 1.00:1 |
| G5 slop pack | FAIL — #1, #14, #15 | FAIL — #8, #11, #14, #15 |
| G6 responsive | PASS — 1440/768/375/320 | PASS — 3 states each |
| G7 a11y | PARTIAL — no aria-label, no `<dl>` | PARTIAL — "BRIGHT" at 1.95:1 |
| G8 perf budgets | PASS — 370 ms load, 454 ms @10k rows | PASS — 1.3–3.8 ms |
| G9 5-second test | FAIL — 2 of 4 questions unanswerable | UNVERIFIED — no default view exists |
| G10 machine diff | UNVERIFIED — no local DB | UNVERIFIED — no local DB |

G9 verbatim, from a fresh-context agent given only the screenshot and four
questions: *"All seven tiles are styled identically… nothing claims primacy. The
biggest visual element is actually the headline 'Keep the Quest safe and moving,'
which is decorative copy, not data."* and *"I cannot tell. No tile shows a trend,
comparison, target, or change indicator."*

**Mandatory-dashboard rule: not satisfied, and no exemption applies.** "Operations
pulse" is an ungoverned ad-hoc panel — no brief, no data contract, no metrics
dictionary, no layout matrix, no gates run — and it violates three invariants it
would have been checked against. The project produces data, metrics and
user-facing state, and is not a pure library, one-off script, or docs repo.

### Measured browser evidence

Lighthouse, **production build** (`:4173`). Dev-server numbers were distorted
4.98× and are excluded from the grade.

| Page / form factor | Perf | LCP | CLS | TBT | Bytes | Reqs |
|---|---|---|---|---|---|---|
| `/` desktop | 62 | 3,991 ms | 0 | 0 ms | 732 KiB | 18 |
| `/` mobile | 83 | 3,633 ms | 0 | 0 ms | 731 KiB | 18 |
| `/play` desktop | 61 | 4,868 ms | 0.00057 | 0 ms | 848 KiB | 44 |
| `/play` mobile | 74 | 4,697 ms | 0.0000083 | 0 ms | 848 KiB | 44 |

Own network-free a11y probe against `/play`:

```
[readiness]   data-game-ready present: true
[contrast]    0 failing real-text nodes (base surface, dialogs closed)
[skip-link]   href=#labyrinth  target=<article>  tabindex=null  -> focus cannot move
[focus]       18 focusable; 15 with NO visible indicator
[targets@390] 0 below 44x44; 2 clipped off-viewport; scrollWidth=390 vw=390
              CLIPPED left=394 right=467  "Sound off"
              CLIPPED left=471 right=550  "New Quest"   <- the primary CTA
[motion]      prefers-reduced-motion honored; 0 elements over 150 ms
```

Token-pair contrast, rasterized through a canvas so `oklch()` resolves exactly:

```
FAIL   1.17:1  need 4.5   tide-door glyph  rgb(215,210,9) on rgb(165,230,255)
FAIL   4.38:1  need 4.5   lifetime error   rgb(223,32,50) on --color-paper
PASS   4.65:1  need 4.5   lifetime error   ...          on --color-stone
FAIL   4.32:1  need 4.5   success / gate   rgb(0,133,72) on --color-paper
PASS   4.59:1  need 4.5   success / gate   ...          on --color-stone
PASS  16.50:1  ink on paper (control)
```

Dialog typography, all 14 force-opened: **133 sub-16px text nodes**
(access-settings 25, practice 23, level 21) against `design.md`'s stated 16 px
floor for decision-heavy dialogs.

---

## 3. Security record

### 4a — surface map

49 logical HTTP routes (6 public, 30 Clerk-session, 11 permission-gated, 4
signature/secret) · 12 Vercel functions · 22 `vercel.json` rewrites · 1 cron · 2
webhook receivers · 12 CLI scripts, 3 privileged · 29 migrations yielding 39
`SECURITY DEFINER` functions, 26 `FORCE RLS` tables, 3 NOLOGIN roles · 22 client
URL-param reads · 2 `postMessage` receivers · 38 `localStorage` reads · 57
`innerHTML` sites and **zero** `eval`/`new Function`/`document.write` · 51 env
vars with zero undocumented secrets and zero orphans.

Three-source route reconciliation came back clean: the `api/*.js` shims rewrite
`request.url` to a canonical pathname *before* dispatch, so authorization always
runs after path reconstruction. No reachable-but-unauthorized case exists. The
codegraph cross-check surfaced no entry point the manual sweep missed.

15 trust boundaries were mapped, each with its enforcing line.

### 4b — baseline tooling

| Tool | Result |
|---|---|
| `osv-scanner` 2.4.0 | `No issues found` — 760 packages |
| `npm audit` | `"total": 0` across 808 dependencies |
| `semgrep --config auto` 1.169.0 | 8 findings, 0 ERROR — all confirmed false positives |
| **`gitleaks`** | **NOT INSTALLED — did not run. This is why the Security grade carries an asterisk and is an automatic A+ blocker until it executes locally.** |

Substitute for gitleaks: a full-history regex sweep for live key formats, private
keys and credentialed connection strings. Every hit was a synthetic test fixture.
The one that looked real — `postgres://app:9f2c…@db.neon.tech/echo_maze` at
`tests/request-identity.test.js:23` — is the negative fixture for a test asserting
the connection string never leaks into the derived address salt. This is weaker
coverage than gitleaks (no entropy analysis) and does not clear the blocker.

### 4d — verification outcome

Every critical/high finding received its own adversarial prove-or-refute pass;
mediums were batch-verified. **21 findings were refuted**, including the two that
looked worst on first read.

| Claim | Filed | Verdict | Deciding evidence |
|---|---|---|---|
| SM-18 | High | Refuted | `public/sw.js:344` uses `cache.add`, never `cache.put` — attacker picks the URL, the server supplies the bytes. No `cache.put` exists in the repo. |
| TM-02 | High | Refuted | `db/migrations/0029_class_expedition_constellation.sql:72` suppresses output entirely at n=1 and n=2, emitting `{published:false}` rather than an attributable band. |
| TM-03 | High | Refuted | Cited a `HAVING` suppression clause as if it were an exposure; the reader returns objective-grouped counts with no `clerk_user_id` projected. |
| TM-07 | High | Refuted | 14/14 directive names identical; `script-src` never gains `'unsafe-inline'`/`'unsafe-eval'`/`*` in any variant. Byte-pinned by `tests/security-headers.test.js:288`. |
| TM-08 | High | Refuted | `db/migrations/0025_offline_run_continuity_forward.sql:215` scopes every receipt read to the issuing Explorer; a cross-account copy returns no row. |
| TM-09 | High | Refuted | Eviction fires inside `settle` at `public/sw.js:377`; the cited lines are not on the terminal+durable path. |
| TM-23 | Med | Refuted | Load-bearing. `set_config(…, true)` — `is_local` is `true` on both GUCs (`server/tenant-context.js:33`). RLS story stands. |
| TM-22 | Med | Refuted | Client `score` is never read — `score: computeRunScore(run)`. Once-only via `ON CONFLICT` + `xmax = 0`. |
| SG-15 | Med | Refuted | UI copy literally says "three or more Classroom **responses**" — exactly what the SQL does. |
| SG-23 | Low | Refuted | The replay check exists: `IF v_grant.status <> 'issued' THEN RAISE EXCEPTION` (`db/migrations/0021_class_expeditions.sql:678`). |
| SM-19, SM-20, SM-06, TM-14, TM-15, TM-16, TM-18, TM-19, TM-24, TM-25, SG-10 | various | Refuted | Each with a quoted controlling line. |

Verification also corrected findings in the harsher direction. `SG-02`'s claimed
1,361 ms measured at **4,594 ms** — 2.7–3.4× too low. `TM-01` was refuted *as
filed* (the cited mechanism is a SHA-256 integrity control, and all 48
normalization vectors were rejected) but confirmed via a different defect
entirely. `SG-13`'s "defeats the index" wording was wrong — the partial index
matches the predicate exactly; what is missing is an index led by `player_id`,
and that correction *is* the fix.

### 4e — compliance

Data class: **PII of minors** (classroom Students, Clerk identities, learning
outcomes) plus **payment** (Stripe). No PHI, no clinical data — HIPAA lanes
correctly skipped. GDPR/COPPA-relevant gaps are captured as `TM-11` (erasure
incompleteness) and `TM-12` (telemetry egress), both below. PCI-DSS scope is
minimal: Stripe-hosted Checkout, no card data touches this codebase.

---

## 4. Ranked findings

Schema: ID | Sev | Conf | Effort | Dimension | file:line | Fix | Grade impact.
Deduplicated across lanes — the dead `public/index.html` was filed by four lanes
and the undefined `--font-mono` by three; each is counted once. Effort: S under
2 h, M half to two days, L over two days.

### Group A — must-fix for A+

#### Security and back-end

| ID | Sev | Conf | Eff | Dimension | file:line | Fix | Grade impact |
|---|---|---|---|---|---|---|---|
| SG-13 | High | High | M | Security | `server/player-api.js:947` | Add an index led by `player_id`, a `leaderboard.read` rate budget, and a best-only cap per `(player, partition)`. | Sole confirmed High; only blocker on Security besides the gitleaks asterisk. |
| GATE-1 | High | High | S | Security | tooling | Install gitleaks; run over the full commit range. | Clears the mandatory asterisk. |
| SG-01 | Med | High | M | Security | `server/lifetime-store.js:57` | Refuse checkout creation for any non-`none` state, or make `refunded` recoverable. Fix the runbook, which only works from `disputed`. | High at launch: charges a parent twice and leaves the child with 0 runs vs a stranger's 3, with account deletion the only exit. |
| SG-02 | Med | High | M | Security, Perf | `server/run-replay.js:189` | Move the terminal-state and ledger-duplicate checks ahead of the replay loop; consume the receipt on rejection. | Measured 4,594 ms for a 207.7 KiB request ≈ 21.6 µs CPU per attacker byte; receipt is a 9-day reusable primitive. |
| TM-01v | Med | High | M | Security | `data/public-email-domains.json` | Add `tuta.com` and re-derive the list; add a freshness check. | A free mailbox claims a Verified Classroom Domain and squats it via `PRIMARY KEY`. |
| TM-13 | Med | High | S | Security | `db/migrations/0017_verified_classroom_domains.sql:1206` | Parameterize auto-join instead of the `TRUE` literal on INSERT and ON CONFLICT. | Contradicts ADR 0023:29; compounds TM-01v into silent non-consensual enrollment. |
| TM-11 | Med | High | S | Security | `server/user-deletion-store.js:38` | Delete `user_roles`, `rate_limit_counters`, `classroom_authority_versions`; add an `information_schema` drift guard for `DELETION_ASSERTIONS`. | Erasure returns success while Clerk identifiers remain outside RLS scope. |
| TM-12 | Med | High | S | Security | `server/tracing.js:33` | Configure `HttpInstrumentation` to suppress `client.address` and `url.query`; document the trace backend in `docs/data-privacy.md`. | Raw IPs of children plus a child's Clerk id in the admin-export URL reach a third party erasure never touches. |
| SM-01 | Med | High | S | Security, Correctness | `api/profile.js:8` | Add `constellation` to the rewrite guard. | The one correctly k-anonymized teacher view 404s in production. Proved by executing both regexes. |
| SG-06 | Med | High | S | Security | `server/lifetime-config.js:10` | Throw at startup when enforcement is requested but unachievable, instead of returning `null`. | A live `sk_live_` key silently forces Run Access enforcement off, and `/api/access/config` then reports a state operators read as an intentional billing-disable. |
| SG-07 | Med | High | S | Security | `server/run-access-route.js:270` | Log the underlying error on the fail-open path. | Two sub-claims refuted (salt absence implies no DB; `degraded:true` *is* emitted) — the residual is error-identity loss. |
| SG-17 | Med | High | M | Security | `server/player-validation.js:19` | Add a denylist/PII heuristic; add one admin action to blank a username. | Child-safety design gap, not a vulnerability. Anonymous readers, zero screening, and no proportionate staff remedy short of deleting the child's account. |
| BE-F-01 | High | High | S | Back-End | `server.js` | Add `process.on("unhandledRejection"/"uncaughtException")`; stop the `void handler(...)` dispatch bypassing Express 5 error forwarding. | One escaped exception kills the persistent server for every player. |
| DB-01/02/03 | High | High | M | Back-End | `db/migrations/0014,0015,0019` | Re-author with `CONCURRENTLY` where possible; document a quiesce window otherwise. | Directly gates the Back-End "migrations safe" clause. |
| DB-04 | High | High | S | Back-End | `db/migrations/0021_class_expeditions.sql:111` | Add an index on `classroom_run_grants(clerk_user_id, classroom_id)`. | Export seq-scans the whole table once per classroom membership. |

#### Correctness and testing

| ID | Sev | Conf | Eff | Dimension | file:line | Fix | Grade impact |
|---|---|---|---|---|---|---|---|
| T-01 | Crit | High | S | Testing | `scripts/vitest-test-count.json:1` | Pin `skipped` in the manifest alongside `testFiles` and `tests`. | Today's green run printed "gate passed" while 18 tests did not execute. ~20 lines. |
| T-02 | Crit | High | M | Testing | `tests/classroom-rls.integration.test.js:19` | Provide a `DATABASE_URL` path so the 18-test DB/S3 lane actually runs. | Forced-RLS cross-tenant denial and seat oversubscription are dark in every gate run. |
| Q-14 | High | High | S | Testing, DX/CI | `scripts/run-vitest-gate.mjs:62` | Separate stdout and stderr buffers; do not anchor the summary parser on EOL. | A false gate failure was reproduced — the only CI fails on green code. |
| T-03/04/05 | High | High | S | Testing | `playwright.config.mjs:29`, `package.json:28` | Add `forbidOnly`; make `reuseExistingServer` conditional; decide whether e2e joins `check`. | A committed `test.only` narrows the suite and exits 0; e2e can pass against a stale bundle. |
| Q-04 | High | High | S | Correctness | `server/player-api.js:447` | Throw `ReplayInputError`, not a plain `Error`. Fix `Q-34` (`run-replay.js:496`) with it. | 500 poison-pill loop; receipt never terminally rejected. |
| Q-26 | High | High | M | Correctness | `server/player-store.js:102` | Handle `DeletedUserError` in all 17 routes, not 4. | Deleted account reported as 500/503 and retried forever. |
| Q-27/28 | High | High | S | Correctness | `server/run-access-route.js:377`, `server/question-route.js:302` | Classify by error class, not `message.startsWith`. Stop returning raw internal text. | Raw `pg` SQL returned at 400 to unauthenticated callers. |
| Q-46 | High | Med | M | Correctness | `src/game/game-session.js:594` | Replace object-identity signalling with an explicit result type. | Server verifier and replay viewer disagree on `ring-bell`. |
| FE-F-01 | High | High | S | Front-End, Correctness | `src/main.js:860` | Apply the repo's own `?retry=1` pattern. Fix `FE-F-05` with it. | Unbounded listener duplication on `#atlas-dialog`; `FE-F-05` permanently disables crash recovery for the tab. |
| Q-64 | High | High | M | Maintainability | `shared/offline-receipt.js:139` | Consolidate the 7 copies of `questIdentityMatches`. | The server copy has already diverged; gates receipt binding, recovery and Run Access. |
| Q-16 | Med | High | M | DX/CI, Correctness | `eslint.config.mjs` | Add a determinism and module-boundary rule block; bring `public/sw.js` under lint and typecheck. | Turns `Q-02` (`localeCompare` in Lured-Warden rules) and `Q-03` (`Date.now()` in `createRun`) into build errors. `public/sw.js` currently has zero lint and zero typecheck. |

#### Performance and front-end

| ID | Sev | Conf | Eff | Dimension | file:line | Fix | Grade impact |
|---|---|---|---|---|---|---|---|
| WP-01/02 | Crit | High | M | Performance | `src/landing/landing-controller.js:96`, `index.html:18` | Defer Clerk until sign-in is requested; server-render or inline the LCP text. | 559,030 B = 74.6% of `/`, 94.9% unused. LCP is 100% render delay. Sole blocker on the CWV clause. |
| P-01 | High | High | M | Performance | `scripts/check-bundle-budget.mjs:12` | Count `game-session` and `canvas-renderer` in the game budget. | Real start-a-Run weight ≈38.9 KB gzip, +26% over a ceiling the gate thinks it enforces; also at 99% headroom. |
| P-10 | High | High | M | Performance | `api/*.js:3` | Lazy-import Stripe per route. | 11 of 12 functions pay a measured 90.20 ms Stripe import on every cold start. |
| P-04 | Med | High | M | Performance | `vite.config.mjs` | Add `manualChunks`. | 12 chunks are byte-identical duplicates of 6 modules; ~19.4 KB gzip wasted. |
| FE-UI-1 | Crit | High | S | Front-End | `src/daylight.css:204` | Fix the mobile command-bar layout. | Primary CTA measured at `left=471` against `vw=390` — off-viewport. Filed by three lanes, confirmed by probe. |
| FE-UI-2 | Crit | High | S | Front-End | `src/admin/admin-controller.js:165` | Scope `.primary-button` geometry to the class, not bare `button`. | Renders 141×21 px. The admin auth gate's copy says "sign in" with no sign-in control present. |
| A11Y-F | High | High | S | Front-End | `src/daylight.css` | Restore focus indicators; add `tabindex="-1"` to the skip-link target. | 15 of 18 focusables have none. `/class` already does the skip link correctly. |
| A11Y-06/07/08 | High | High | S | Front-End | `src/daylight.css:1500,1949,1953` | Fix the token pairing, not just the hue. | Measured 1.17:1, 4.38:1, 4.32:1 — the latter two pass on `--color-stone` and fail on `--color-paper`. |
| A11Y-01/02 | High | High | S | Front-End | `src/main.js:622`, `index.html:148` | Make Trail Compass discoverable; add an `event.repeat` guard. | The documented "complete keyboard and screen-reader gameplay path" is off by default and spams the live region on key repeat. |
| HM-01 | Crit | High | M | Front-End | `index.html:433` | Split `level-dialog` into one decision per view. | 3 decisions plus a 4th action in one modal at 7.8% accent — breaks `design.md`'s own rule. |
| HM-02 | Crit | High | S | Front-End, Maintainability | `src/styles.css:1` | Delete. | 901-line orphan stylesheet, zero references, contradicts the locked paper. |
| TYPE | High | High | M | Front-End | `tokens.css:121` | Add a real type scale with a hard body-copy floor. | 187 `font-size` declarations across 57 values against one token; 133 sub-16px dialog text nodes. |
| TOKENS | High | High | S | Front-End | `src/classroom/classroom.css:87` | Define the 11 undefined custom properties. | `--font-mono` ×6 silently strips the Utility type role from `/class`; `--space-7/20/24` collapse margins to 0. |
| SHELL-11 | High | High | L | Front-End | `src/admin/admin-view.js:32` | Extract one layout owner. | Root cause of 7 of the 18 shell violations; collapses SHELL-01/03/05/08/09/12. |
| SHELL-07 | High | High | L | Front-End | `tokens.css:3` | Add dark tokens, `prefers-color-scheme`, a three-state control, and a blocking head script. | `color-scheme: light` hard-locked; the OS-dark screenshot is byte-identical to light. |
| SHELL-04/15 | High | High | L | Front-End | `src/admin/admin-view.js:110` | Convert panels to routes; move `/class` selection into the URL. | All six panels mount and all five datasets fetch on every load; nothing is shareable and the back button is inert. |
| DASH-01 | High | High | L | Front-End | `src/admin/admin-view.js:129` | Bring "Operations pulse" under `dashboard-creation` governance. | Satisfies the mandatory-dashboard rule. Carries DASH-02/03/04/05/18. |
| DASH-20/22/35 | High | High | S | Front-End | `src/classroom/classroom.css:204` | Rebuild the ordinal ramp per `dataviz`. | "Quiet" equals the surface colour exactly at 1.00:1; "BRIGHT" caption at 1.95:1; the ramp runs backwards. |

### Group B — quick wins under 30 minutes

- Delete `public/index.html` — a 25 KB abandoned v1 jQuery prototype with a CDN
  tag, copied into `dist/` on every build. Filed independently by four lanes.
- Delete the tracked zero-byte file `100` at the repo root (committed in `ef66d24`).
- Define the 11 undefined CSS custom properties; each currently fails silently.
- Add `forbidOnly` and make `reuseExistingServer` conditional in `playwright.config.mjs:29`.
- Pin `skipped` in the gate manifest — closes the single largest hole in the only CI.
- Fix the drifted raw `#f8f4df` `theme-color` at `index.html:10`.
- Add the missing `classroom_run_grants` index.
- Install and run gitleaks — clears the Security asterisk.
- Add `Retry-After`; it is set on exactly 1 of 22 retryable 503 responses.
- Parallelize the 15 sequential export queries at `server/data-export.js:200`. The
  `:226` loop is **not** parallelizable — it mutates transaction-local
  `set_config` state the next four queries read.
- Correct two stale docs: `docs/UNFINISHED-FEATURES.md:72` lists the admin export
  as unbuilt though it ships at `server/admin-route.js:294`; and the lifetime
  runbook's restore procedure only works from `disputed`.

### Group C — nice-to-have

Never a must-fix, never a termination blocker.

- **Decomposition** — `src/main.js` at 5,178 lines with 92 module-scope `let`s and
  53 listeners; `classroom-controller.js`'s single 701-line function at depth 9;
  `createPlayerApi`'s ~350 lines of policy. Real debt, but no confirmed defect
  rides on size alone.
- **Taste elevation** beyond the gates — the result dialog reads as a receipt and
  nothing celebrates (`--color-gate` used 12× sitewide, never there); 9
  transitions against 25 `:hover` + 13 `:active` rules; the playfield is a uniform
  dark slate grid, so "storybook expedition" lives only in the chrome.
- **Glossary drift** — `usedMapFingerprints` uses the term `CONTEXT.md` tells you
  to avoid for **Labyrinth**, baked into the cloud and GDPR-export contract;
  "Map marks" ships as a player-visible heading.
- **Dead but signed-off code** — `src/learning/offline-practice.js` is spec'd,
  tested and release-signed-off with zero production callers.
- **Dependency footprint** — 17 direct deps expand to 808 packages, root cause
  `@clerk/clerk-js`. The Solana and React-Native subtrees are tree-shaken and
  never reach the bundle; install surface only.
- **Cohort-threshold consistency** — expedition progress has no suppression while
  its sibling constellation gates at 20/5. Both readers are the same authorized
  teacher, so the gate is decorative rather than breached.

---

## 5. Locked system decision — deferred

The hallmark lane filed `design.md` **itself** as below bar: a page perfectly
conformant to it would still fail slop gates.

- **Gate 38 fails by construction.** `design.md:31` licenses "Utility" as a
  systematic third type role — exactly what the 2+1 rule caps at two slots. The
  system is the side that must move.
- **Gate 25 is unavoidable** — there is no measure rule at all: no `--measure`
  token, no ch-range. Both observed failures (28ch and 144ch) follow directly.
- **Gate 23 is at material risk** — no accent-footprint budget, which is how
  `level-dialog` reached 7.8%.

Behind all three: `tokens.css` enforces spacing rigorously and typography not at
all — one text token used 6 times against 193 `font-size` declarations spanning
~40 hand-written values.

**Decision status: unresolved, defaulting to KEEP.** The operator approved the
plan without electing an amendment. Under the default, all future fixes conform to
the existing `design.md` and only conformance is graded. Electing **amend** later
would redesign at system scope and regenerate `design.md` as an approved
amendment, edited in place via PR — git history is the versioning.

**Stitch pairing state: `neither`.** `design.md` has no YAML frontmatter at all —
no `stitch-project:` id, no `unpaired:` + `stitch-note:` pair. Pairing must be
created before any Stitch-governed UI work begins.

---

## 6. Sequencing constraint

`RUN_ACCESS_ENFORCEMENT_ENABLED` is `false` in the deployed configuration. This is
documented, intentional pre-launch state and the parse is fail-closed, so it is
**not** a vulnerability. But it means no `run_access_grants` rows are ever
written, so the entire signed-receipt offline subsystem is inert today and **every
offline finding activates simultaneously the day that flag flips.** There is no
gradual ramp.

Activating on the flip: grant writes plus the `UNIQUE` constraint, `FOR UPDATE`
lock and 409 conflict path; `free_runs_used` quota accounting; `run_access.decision`
audit rows; the entire offline receipt body past `offline-receipt-route.js:185`
including signing; offline submission acceptance; offline cloud-outcome merges;
admin metrics; GDPR export; deletion cascade.

The offline signing key is also not yet provisioned, so flipping without it turns
a clean 409 into a 503 on exactly the path children hit when their network drops.

`SG-01`, `SG-02`, `SG-06` and `SG-03` should all land before the flip.

---

## 7. Must be re-run locally

Nothing here could execute in this sandbox. None of it runs on GitHub's runners —
Actions are disabled for this repo, so the local gate is the CI.

- **gitleaks**, full commit range. Automatic A+ blocker on Security until it runs.
- **G2 and G10** dashboard reconciliation, and the 18-test DB/S3 lane including
  `tests/classroom-rls.integration.test.js` — both need a live `DATABASE_URL`.
- **`npm run test:e2e`** — needs a build plus browser download; judged statically
  only, so its findings are config-level.
- **On-platform replay timing** against Vercel's default `maxDuration`. There is no
  `functions` block in `vercel.json`, and a Vercel vCPU is roughly 1.5–2.5× slower
  than the benchmark machine, so legitimate max-config `maze-master` submissions
  may already be returning 504.

---

## 8. Audit method notes

- Lanes armed: front-end correctness, a11y, webperf, hallmark, app-ui-shell,
  dashboard-creation, design-taste, back-end framework, database, silent-failure,
  quality, security 4a/4c ×3, perf, test, generic security second opinion.
- Lanes skipped with reason: `ecc:mle-reviewer` (no ML path — questions come from
  an external LLM provider, no training or inference code); healthcare lanes (no
  clinical data); `ecc:dashboard-builder` (no Grafana or monitoring JSON).
- Graphs: codegraph live index (405 files, 4002 nodes, 8559 edges) and graphify
  rebuilt at HEAD (3684 nodes, 304 communities). **No semantic extraction was
  performed** — code-only pass, no documents sent to any LLM backend.
- `ecc:security-bounty-hunter` is installed as a **skill but not as an agent type**.
  All verification passes used `general-purpose` with that skill invoked inline.
- The `ecc:a11y-architect` agent type has no Bash tool, so its lane could not open
  a browser. Its two authored Playwright scripts were executed from the main
  thread instead, and two further probes were written to measure pseudo-element,
  dialog-scoped and token-pair contrast that the first sweep could not see.
- `ecc:security-scan`'s engine (`npx ecc-agentshield`) returned "Grade A, 0
  findings" but **scanned 0 files** — it audits AI-agent configuration, not
  application code. That result is not evidence about this application; the
  generic lane's findings are all manual.
