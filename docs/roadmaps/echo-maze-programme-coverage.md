# Echo Maze programme coverage

Status snapshot: 2026-08-02, `origin/main` includes PR #158 at `69f4cd6`
(PR #152 remains in its history at `a37dffa`).

This ledger reconciles the current development roadmap with the frozen Next
Expedition roadmap, the programme closeout, current issues, merged pull
requests, and live source evidence. A requirement is **Delivered** only when
current code, tests/browser evidence, and the relevant merged GitHub change
support it. A tested module without a reachable player path remains **Partial**.

## Historical and committed roadmap coverage

| ID | Requirement | Status | Source requirement | Issue/spec/ticket | Dependencies | PR batch | Tests and acceptance proof | Final commit/PR | External blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H01 | Truth and delivery headroom | Delivered | Next Expedition 9.1 | #89, #135 | None | Milestone 1/5 | Release evidence, bundle/function budgets, docs reconciliation | PR #94; PR #148 | None for repo work |
| H02 | First Light Tutorial | Delivered | Next Expedition 9.2 | #90-#93 | H01 | Milestone 1 | `first-light` unit and Milestone 1 browser evidence | PR #102 | Optional moderated research remains external |
| H03 | Active Run Recovery | Delivered | Next Expedition 9.4 | #90-#93 | H01 | Milestone 1 | Recovery/storage unit and browser journeys | PR #102 | None |
| H04 | Echo Atlas and Gate Wardens baseline | Delivered | Next Expedition 9.3 | #95-#99 | H01 | Milestone 2 | Atlas, milestone, Warden, desktop/mobile evidence | PR #115 | None |
| H05 | Run Replay | Delivered | Next Expedition 9.6 | #100-#104 | H03 | Milestone 2 | Replay contract/view and browser evidence | PR #115 | None |
| H06 | Living Regions and Trail Twists baseline | Delivered | Next Expedition 9.8/9.14 | #105-#109 | H04 | Milestone 2 | Region/twist/gameplay regression and browser evidence | PR #115 | None |
| H07 | Echo Lens and Lantern Trails baseline | Delivered | Next Expedition 9.5 | #110-#111 | H01 | Milestone 3 | Reviewed content, view, journal/trail tests and screenshots | PR #123 | None |
| H08 | Learning Decks | Delivered | Next Expedition 9.7 | #116-#119 | H06/H07 | Milestone 3 | Deck identity/selection/content and browser evidence | PR #123 | None |
| H09 | Class Expeditions | Delivered | Next Expedition 9.9 | #120-#122 | H08, Classroom authority | Milestone 4 | Classroom play, billing, privacy, desktop/mobile evidence | PR #133 | Live Stripe/test-mode boundary remains external |
| H10 | Trail Compass and Question Narration | Delivered | Next Expedition 9.10/9.11 | #124-#127 | H01 | Milestone 4 | Unit and keyboard/mobile/reduced-motion evidence | PR #133 | Human assistive-technology session remains external |
| H11 | Daily Trail Constellation | Delivered | Next Expedition 9.12 | #135-#139 | Verified Daily; privacy gate | Milestone 5A | Threshold, privacy, lifecycle, export, browser evidence | PR #148 | Migrations 0018-0023 and live Daily configuration remain external |
| H12 | Offline Run Continuity mechanisms and application wiring | Delivered (repo scope) | Next Expedition 9.13 | #140-#146, #149-#150 | H03, ADRs 0034-0038 | Milestone 5B | Signed receipt, reachable offline play, durable replay/cleanup, privacy/export tests, and desktop/mobile browser evidence | PR #149 mechanisms; PR #158 wiring (`69f4cd6`) | Receipt keys, migrations, deployment, and live smoke checks remain external |
| H13 | Programme closeout and release documentation | Delivered | Closeout report and implementation coverage | #40, #48 | H01-H12 | Release closure | Docs and merged-main evidence | PR #56 and `b9cfd20` | Live production approvals remain external |

## Current development roadmap

| ID | Requirement | Status | Source requirement | Issue/spec/ticket | Dependencies | PR batch | Tests and acceptance proof | Final commit/PR | External blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.1 | Vitest worker loss fails loudly; expected counts stay trustworthy | Delivered (owner override) | Current Development Roadmap P0.1 | #151 (bug contract; TDD exemption) | None | A | Red: fork worker loss produced a partial 1,289-pass run. Green: focused gate tests; full gate at 147 files / 1,327 tests; caller filters rejected; split-output worker-loss, failed, and unaccounted branches covered; `npm run check` | PR #152 merged as `a37dffa`; CodeRabbit review deferred by explicit owner override and recorded on the PR | None |
| P0.2 | Authorized Quest offline vertical slice reaches signed receipt, offline play, replay acceptance, and cleanup | Delivered | Current Development Roadmap P0.2; #150 | #150; #153-#157 | P0.1 | B | `npm run check:full`: 1,378 passed / 18 skipped across 159 files; 228 desktop/mobile browser passes; replay, privacy, restart, rejection, and Mixed Gate Warden parity coverage | PR #158 merged as `69f4cd6`; CodeRabbit rate-limit waiver recorded on PR | Key generation/deployment, live migrations, deployment, and live smoke checks remain external |
| P0.3 | Honest release proof, operational/privacy/recovery documentation, and repo-controlled checks | Delivered (repo scope) | Current Development Roadmap P0.3 | Release-proof batch; #150/#151 evidence | P0.1/P0.2 | C | Updated ledger/status/evidence docs; local gate, bundle/function budgets, browser proof, live demo/readiness snapshot, and explicit external-boundary record | This release-proof update on `origin/main`; source head `69f4cd6` | No live billing, production enforcement, irreversible migration, Stripe activation, production keys, or production-secret action without authorization |
| P1.1 | Echo Fossil Atlas for completed Labyrinth/Warden outcomes | Todo | Current Development Roadmap P1 | Feature spec/tickets pending | P0.2 | D | Projection invariants, privacy/export/deletion, desktop/mobile/keyboard/reduced-motion | Pending | None |
| P1.2 | Warden Tactics Lab with fixed unscored drills | Todo | Current Development Roadmap P1 | Feature spec/tickets pending | P1.1 | E | Deterministic drill coverage, no Quest/score/profile mutation, browser proof | Pending | None |
| P1.3 | Reviewed Echo Lens explanation packs using visual primitives | Partial | Current Development Roadmap P1; Next Expedition 9.5 | Feature spec/tickets pending | P1.1 | F | Reviewed content coverage, revision binding, post-answer-only behavior, browser proof | Existing Echo Lens baseline; extension pending | None |
| P1.4 | Quiet Expedition text/semantic, reduced-motion, keyboard, narration route | Partial | Current Development Roadmap P1; Next Expedition 9.10/9.11 | Feature spec/tickets pending | P1.1 | G | Nonvisual gameplay journey, semantic labels, reduced-motion and keyboard browser proof | Existing settings baseline; extension pending | Human assistive-technology session remains external evidence |
| P2.1 | Transparent Trail Compass intention choice: Review, Explore, Challenge | Partial | Current Development Roadmap P2; Next Expedition 9.10 | Feature spec/tickets pending | P1.4 | H | Explicit choice only, no hidden adaptation, settings and gameplay browser proof | Existing Trail Compass baseline; extension pending | None |
| P2.2 | Classroom Expedition Debrief with aggregate teacher next steps and private student reflection | Partial | Current Development Roadmap P2; Next Expedition 9.9 | #183 | P1.2/P2.1 | I | Tenant/RLS/privacy thresholds, teacher/student desktop/mobile proof, export/deletion | Feature branch `feat/classroom-expedition-debrief`; merge proof pending | Live migration/Stripe setup remains external |
| P2.3 | Privacy-reviewed Class Constellation only when the Daily aggregate gate is satisfied | Partial | Current Development Roadmap P2; ADR 0043 | #185-#187; feature spec and tickets | P2.2; privacy review gate | I | Threshold/reconstruction tests, bounded Teacher reader, forming/band-only Classroom UI, focused desktop/mobile proof; final full-gate and merge proof pending | Feature branch `feat/class-constellation`; PR pending | Live migration 0029 and production configuration remain external |
| P2.4 | Echo Postcards with seed-only deterministic invitations | Todo | Current Development Roadmap P2 | Feature spec/tickets pending | P2.1/P2.2 | J | Seed contract, no identity/score/route/action leakage, desktop/mobile browser proof | Pending | None |
| P3.1 | Quest II: Living Regions with five new arcs and unique reviewed content | Todo | Current Development Roadmap P3 | Feature spec/tickets pending | P1.1-P2.4 | K | Quest-wide map/question uniqueness, difficulty escalation, authored storylets, grey-box pacing, full browser/accessibility/content gates | Pending | Reviewed content authoring is repo-controlled; no AI-generated content |

## P0.2 ticket coverage

| Ticket | Contract covered | Status on this branch | Primary proof |
| --- | --- | --- | --- |
| #154 | Receipt issue, browser verification, exact binding, public/account worker pin | Delivered | `tests/offline-continuity-client.test.js`, route/client suites, `e7400f8`, PR #158 |
| #155 | Continue Offline, live Run Action Log v2, bounded terminal package, durable restart state | Delivered | `tests/offline-continuity-controller.test.js`, `tests/service-worker.test.js`, `tests/offline-worker-client.test.js`, `tests/e2e/game.spec.js`, PR #158 |
| #156 | Stable-key submission, replay-before-cloud-write, retry, rejection, and truthful labels | Delivered | `tests/offline-submission-route.test.js`, `tests/offline-submission-store.test.js`, `tests/offline-cloud-outcome.test.js`, `tests/offline-content-pack.test.js`, PR #158 |
| #157 | Sign-out/deletion scrub, suffixed Practice cleanup, export, expiry-guarded prune, and release proof | Delivered | `tests/offline-practice-and-scrub.test.js`, `tests/data-export.test.js`, `tests/internal-route.test.js`, browser matrix, release evidence, PR #158 |

The current branch also covers the cross-cutting constraints: Classroom Play
remains online-only; v2 action and export shapes carry no reviewed text or
selected option identifiers; account-scoped worker state is isolated and
durable; terminal storage fails closed; and successful replay is the only
cloud outcome boundary.

## Release-only boundaries

| Boundary | Status | Evidence/action required |
| --- | --- | --- |
| P0.1 browser parity context | Non-gating evidence | Playwright desktop/mobile validation recorded 228 passed / 22 intentional skips; P0.1 changes are limited to the local Vitest gate and test configuration |
| GitHub Actions disabled | Verified | `gh api repos/tomnguyen103/Maze-v2/actions/permissions` returns `enabled: false` |
| Production deployment | Deployed demo/test surface | Verify current deployment after every merge; `/api/ready` is not production-ready while Stripe/Daily/config are unavailable |
| Database migrations 0018-0025 | External pending | Authorized operator applies fresh migrations and runs smoke/integration checks |
| Offline receipt keys | External pending | Authorized operator generates and deploys keys; never commit private material |
| Stripe activation and access enforcement | External pending | Explicit authorization plus policy, refund, dispute, rollback, and smoke evidence |
| Human screen-reader session | External pending | Human assistive-technology acceptance; automated proxy is not equivalent |

## Ledger update rule

Each completed ticket adds its observed red-to-green test receipt, browser or
runtime evidence, local review result, CodeRabbit result, merged PR/commit, and
documentation updates here. External blockers stay separate from repo Todo
items; they never count as delivered engineering.
