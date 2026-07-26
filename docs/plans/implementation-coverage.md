# Four-plan implementation coverage

**Opened:** 2026-07-25

**Live baseline:** `cd3cc87` on `main`; signed-in allowance, lifetime
membership, Echo Atlas, Gate Wardens, and Daily Shared Labyrinth are merged
through PRs #49-#51 and #54. Explorer Access Settings are delivered on the #46
branch with adapter/view tests and complete desktop/mobile presentation-only
journeys; merge remains pending.

**Authority:** the attached implementation approval, then `AGENTS.md`, then the
combined master plan. A source document being marked draft or superseded does
not remove its unique requirements.

Status values describe the live code at ledger creation. Test and merge columns
are updated only from verified evidence.

## Requirement coverage

| ID | Requirement | Source sections | Initial status | Chosen resolution | Ticket | Test / merge evidence |
|---|---|---|---|---|---|---|
| C01 | Preserve answer-based Warden combat, safe Questions, Quest-wide uniqueness, five difficulty bands, Hint, Skip, score, and deterministic replay | Master 5-6, 22.4; Roadmap 3-4; Membership 14 Compatibility | Already implemented | Keep `createRun` and `applyAction` as deterministic seam; add regression coverage around new integrations | Existing #18-#22 | 113 unit / 55 browser baseline; final PRs pending |
| C02 | Public `/` landing creates no Run; `/play` owns gameplay; explicit and legacy share links preserve replay | Entry 1-5, 9-10, 13; Master 7.1, 11.1 | Already implemented | Retain current entry modules and route contract | Existing #33 | `tests/e2e/entry.spec.js`; merged by PR #34 |
| C03 | Landing remains game-first, responsive, honest, and optional-Clerk | Entry 6-8, Tasks 4, 6-8; Master 11.1 | Partial | Preserve locked Workbench/Threshold design; update account value and membership preview without turning hero into pricing | Existing #33; #42 | Current desktop/mobile entry tests; copy/value proof pending |
| C04 | One complete Guest Run; all later Guest starts require account; escape and defeat both consume demo | Master 6.2, 7.1-7.2, 22.1; Membership 2, 8.1, 14; Entry Task 6 | Already implemented | Keep browser-local versioned demo record and Clerk handoff | Existing #35-#36 | `demo-access` unit tests and guest browser journey; PRs #37-#38 |
| C05 | Exactly three signed-in free Run starts, server-authoritative and cross-device | Master 6.2, 7.3, 8.3, 13-15, T3-T6, 22.1; Roadmap 7; Membership 2, 5, 7, M2-M3/M7, 14 | Missing | Add PostgreSQL `player_access` plus atomic grant ledger keyed by Clerk user and stable `runId` | #41 | 9 transactional store tests; live Neon concurrency proof: 3 admitted / 1 blocked / retry duplicate; merged PR #49 |
| C06 | Reloads, retries, duplicate requests, multiple tabs, direct links, Record replay, Quest continuation, and new Quest never double-consume | Master 7.3, 14.2, 15, T4-T6, 22.1; Membership 2.2, 7.5, 9-10, M3/M7; Entry 4-5 | Partial | Existing active locator stays; add stable access `runId` and idempotent server grant across every start path | #41 | v1/v2 locator and access-id tests; 55 desktop/mobile browser cases passed with 3 intentional Clerk-network skips; merged PR #49 |
| C07 | Existing accounts receive three signed-in free Runs; existing profiles, scores, Guest state, Quest Progress, and Records remain readable | Master 13.5, T3, 22.1/22.6; Membership 2.3, 7, 14 | Missing | Add additive migration with lazy/default access row; never infer usage from scores | #41 | Additive development-Neon proof and migration regression; merged PR #49 |
| C08 | `$5.99 USD` one-time lifetime access; never recurring; no paid power | Master 1, 5-6, 8.2, 22.2; Roadmap 7; Membership 1-5, 14 | Missing | Stripe-hosted Checkout in `payment` mode; PostgreSQL entitlement; fixed server-owned price and copy | #42 | Fixed 599-cent/USD domain tests, transparent dialog/browser proof, and live development-Neon activation pass; merged PR #50 |
| C09 | Checkout creation is authenticated, server-owned, idempotent, and cannot be altered by browser fields | Master 8.5-8.6, 14.3, 15, T7; Membership 6.2-6.3, 10, M4 | Missing | Official Stripe server SDK; fixed Price ID, quantity, origins, user, and purchase metadata | #42 | Adapter and HTTP-boundary fixtures verify fixed Price/quantity/origin/metadata and reject browser commercial fields; merged PR #50 |
| C10 | Direct return verification and webhook fulfillment converge idempotently | Master 8.6, 14.4-14.5, 15, T8-T9, 22.2; Membership 6.4-6.5, 9-10, M5-M6 | Missing | One fulfillment interface used by signed return confirmation and raw-body webhook adapter | #42 | Paid/unpaid/wrong-owner/reordered/duplicate/signature fixtures pass through shared activation store; merged PR #50 |
| C11 | Refund, dispute, restored-funds, duplicate Checkout, outage, and account recovery behavior | Master 8.7, 15, T8-T10/T17, 22.2; Membership 5.2, 8.5, 9-12, M8-M9 | Missing | Normalize provider state; active Run may finish; gate next start; publish support runbook | #42 | Replay and same-second lifecycle tests plus `docs/lifetime-membership-operations.md`; merged PR #50 |
| C12 | Lifetime entitlement follows Clerk account across browsers without normal Stripe calls | Master 7.7, 8.2, 13-14, 22.5; Membership 2.3, 5-7, 14 | Missing | Read durable entitlement from PostgreSQL through access API | #42 | Two independent development-Neon pools using the same Clerk identity proved `allowed=true`, `state=member` with no Stripe call on second-browser admission; merged PR #50 |
| C13 | Purchase UI says `$5.99 once`, `lifetime access`, `no subscription`, `no renewal`; parent help; `Not now`; no dark patterns | Master 7.6, 11.3-11.6, 16, T10; Membership 8, M8 | Missing | Focused accessible dialog with transparent Atlas/value summary and no embedded card fields | #42 | View tests plus desktop/mobile, 200% text, 320/375/414/768 responsive, focus, contrast, and 58-gate Hallmark proof; merged PR #50 |
| C14 | Five-region, twenty-node Echo Atlas derived from Quest Progress | Master 7.4, 9, 11.5, T11-T12, 22.3; Roadmap 8 Tasks 1-2/5-6 | Missing | Pure immutable Atlas projection plus focused overlay; no new progress store | #43 | `quest-atlas` projection/view tests and 5-region/20-node browser proof pass; merge pending |
| C15 | Atlas state is non-color-only, keyboard/screen-reader discoverable, timer-pausing, mobile/zoom/reduced-motion safe | Master 9.6, 16, T12, 22.3; Roadmap 8.7 Tasks 5-6 | Missing | Dialog focus trap/return, text state labels, five region headings, responsive node grid | #43 | Text labels, accessible names, current-node focus, pause/return-focus, 320 px, 200% text, reduced-motion, desktop/mobile proof pass; merge pending |
| C16 | Gate Wardens occur only at 4, 8, 12, 16, 20 and reuse one configured Warden without raising score ceiling | Master 7.5, 10, T13, 22.4; Roadmap 8 Tasks 1/3 | Missing | Pure milestone classifier and reserved-Warden state inside deterministic Run config | #43 | Exact milestone, fixed-seed, configured-count, score-ceiling, and non-milestone shape tests pass; merge pending |
| C17 | Gate Warden appears after Echo recovery; sealed/open Gate states; normal Question, Vitality, Hint, Skip, fallback, and paused timer rules | Master 10.3-10.5, T14-T15, 22.4; Roadmap 8.2-8.7 Tasks 3-6 | Missing | Extend current transition interface; reuse current Question controller and accessible presentation | #43 | Locked/correct/wrong/defeat/Hint/Skip tests plus forced-provider-fallback desktop/mobile Labyrinth 4 passages pass; merge pending |
| C18 | Atlas milestones create derived cosmetic sigils and memorable victory feedback, never currency or power | Master 9.7, 10.4; Roadmap 8.1-8.3 | Missing | Derive one sigil per completed four-Labyrinth region; celebrate in results and Atlas | #43 | Derived sigil counts and compact result milestone proof pass with no storage migration; merge pending |
| C19 | Cloud Quest Continuity syncs only boundary progress, preserves uniqueness, migrates local state, supports offline retry | Master 17/25; Roadmap 9, Release B | Missing | Versioned authenticated cloud Quest record; active Run remains device-local | #44 | Store/route/offline/two-device tests pending |
| C20 | Same-Quest conflicts merge monotonic history; incompatible Quests require explicit player choice; no silent overwrite | Roadmap 9 Acceptance/vertical slices | Missing | Optimistic revision and explicit conflict dialog comparing Quest Level and boundary | #44 | Conflict fixtures and browser tests pending |
| C21 | Lantern Journal remembers bounded reviewed learning outcomes and can be cleared separately | Master 17/25; Roadmap 10, Release D | Missing | Add allowlisted `topicId` and `learningObjectiveId`; local bounded attempt-event projection | #45 | Metadata validation/projection/clear tests pending |
| C22 | Optional Practice uses a different reviewed card, no Warden/timer/Vitality/score/Quest effect, encouraging feedback | Roadmap 10 Acceptance/vertical slices | Missing | Result-screen Practice Lantern through reviewed Question seam | #45 | Isolation and non-repeat tests pending |
| C23 | Explorer Access Settings: stronger contrast, larger marks, reader-friendly Questions, reduced effects, preview/save/reset | Master 17/25; Roadmap 11, Release E | Delivered | Versioned local presentation-only settings adapter; default remains `design.md` | #46 | Adapter/view tests and keyboard browser flows prove preview/save/cancel/reset, unchanged Run facts, 390x844 fold fit, 200% text, and OS reduced motion; merge pending |
| C24 | Daily Shared Labyrinth is date-deterministic, fair, privacy-safe, separate from Quest, casual, shareable, and expiry-safe | Master 17/25; Roadmap 12-15, Release F | Delivered | UTC-dated bundled contract, separate local Daily record, no scarce reward or global claim | #47 | Pure contract/storage fixtures plus desktop/mobile same-maze, bundled-Question, no-access, Quest-isolation, privacy-safe share, expiry, and Personal Best passages; merged PR #54 |
| C25 | Platform trust: explicit database certificate verification, Clerk timeout fallback, bundle baseline, storage/migration characterization | Roadmap 6; Master 15/24 | Partial | Keep dynamic Clerk boundary; normalize production/preview DB SSL config; document bundle budgets and migration proof | #41 | 3 SSL tests, four budgets, Clerk fallback, and development-Neon proof; merged PR #49 |
| C26 | Observability uses privacy-minimized allowlisted events and never logs secrets, raw webhooks, card data, or child data | Master 17, 23; Membership 10, 15 | Missing | Small structured event interface and in-memory test adapter; no new analytics vendor | #41, #48 | Access and lifetime allowlist tests exclude IDs, secrets, and commercial/card fields; #42 PR pending |
| C27 | Support, refund, dispute, deletion, privacy, rollback, and receipt-recovery runbooks exist before live payment | Master T17-T18, 22.6; Membership 8.5, 12, M9 | Missing | Add production setup and support runbooks; enforcement flag can disable gates without deleting entitlements | #48 | Lifetime test setup/support/recovery/privacy/rollback runbook added; final cross-feature drill pending |
| C28 | All major journeys work at desktop/mobile, 200% text, keyboard, screen reader, and reduced motion | Master 16, T18, 22.6; Entry 6-10; Roadmap all feature gates | Partial | Extend Playwright projects and focused fixtures for every access/member/Atlas/follow-on state | #48 | Current entry/game coverage passes; new journeys pending |
| C29 | Two or three tested small surprise improvements strengthen discovery, mastery, anticipation, celebration, learning, or return motivation | Attached approval | Missing | Select after full feature playtest; keep deterministic and local/free | #48 | Pending; reveal only at final delivery |
| C30 | Plans, README, environment template, migrations, support docs, coverage ledger, issues, PRs, and remote `main` show truthful final state | Attached approval; Master T17-T18, 19, 22.6; Entry Task 8; Membership M9 | Partial | Update evidence after each merged PR; never mark completion from a plan label | #40, #48 | Final remote verification pending |

## Source task crosswalk

Every implementation task from the four source plans maps to the requirement
rows above:

- **Combined master T1-T18:** T1 `C05/C14/C16`; T2 `C01/C06/C16`; T3-T6
  `C05-C07/C25`; T7-T10 `C08-C13`; T11-T12 `C14-C15`; T13-T15 `C16-C18`;
  T16 `C04-C18`; T17 `C26-C27`; T18 `C28-C30`.
- **Entry Tasks 1-8:** Tasks 1-5 `C02/C06`; Task 6 `C03-C04`; Task 7
  `C03/C28`; Task 8 `C30`. Existing work is credited only where current tests
  and merged issues prove it.
- **Membership M1-M9:** M1 `C05/C08`; M2-M3 `C05-C07`; M4-M6 `C08-C12`;
  M7-M8 `C06/C12-C13`; M9 `C26-C30`.
- **Roadmap Atlas Tasks 1-6:** `C14-C18`.
- **Roadmap Cloud slices 1-4:** `C19-C20`.
- **Roadmap Journal slices 1-4:** `C21-C22`.
- **Roadmap Settings slices 1-3:** `C23`.
- **Roadmap Daily slices 1-3:** `C24`; optional verified Global Daily ranking
  is excluded because the approved MVP explicitly defers competitive claims.

## Conflicts and duplicates

- Entry-plan optional unlimited Guest play is superseded by the approved
  one-Guest-Run contract. Existing entry routing and optional *first* Guest
  entry remain.
- ADR 0005/0006 signed-in unlimited behavior is superseded only for starting a
  new Run. Identity, profile, scoreboard, and deterministic boundaries remain.
- The master plan originally deferred Cloud Continuity, Journal, Settings, and
  Daily. The attached approval explicitly includes every valuable unique
  roadmap requirement, so those features are in scope.
- Master plan says production enforcement and a real live payment need separate
  approval. The attached approval allows implementation and Stripe test mode,
  but explicitly withholds authority to charge real money or change live
  billing. Test-mode proof is required; live smoke purchase remains a
  production-only blocker unless separately authorized.

## Evidence update rule

An item moves to complete only when its public behavior is tested, its PR has a
completed CodeRabbit review with findings resolved, the PR is merged, and the
merge is present on remote `main`.
