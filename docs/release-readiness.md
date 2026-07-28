# Echo Maze release readiness

**Evidence date:** 2026-07-28

**Release decision:** test-mode engineering candidate only. Production Run
Access enforcement remains off. No live charge, live Product, live Price, or
production purchase-and-refund smoke test is authorized by this record.

This is the durable evidence index for the four-plan program. It is finalized
only after every feature PR is merged, the complete local gate passes against
one integrated commit, CodeRabbit is resolved, and that commit is present on
remote `main`.

## Integrated journey matrix

| Journey | Automated and browser evidence | Required profiles | Final result |
|---|---|---|---|
| Public landing and Guest entry | `tests/e2e/entry.spec.js` | Desktop, mobile, 200% text, reduced motion | Pass - integrated closure candidate |
| Guest demo completion and account handoff | `tests/demo-access.test.js`, `tests/e2e/entry.spec.js`, `tests/e2e/game.spec.js` | Escape, defeat, reload, direct link | Pass - integrated closure candidate |
| Signed-in profile and score continuity | Player client/controller/route/store tests plus `tests/e2e/game.spec.js` | Signed fixture, Guest fallback | Pass - integrated closure candidate |
| Three free Run starts and idempotent replay | Run Access domain/route/store/integration tests | Duplicate, multi-tab, retry, outage | Pass - integrated closure candidate |
| `$5.99 USD` one-time test Checkout | Lifetime domain/service/route/store tests and membership browser passage | Desktop, mobile, 200% text; test mode only | Pass - fixed adapter fixtures; no live charge |
| Direct confirmation and signed webhook convergence | Lifetime service/store fixtures | Return-first, webhook-first, duplicate, wrong owner | Pass - integrated closure candidate |
| Refund, dispute, restored funds, and outage | Lifetime transition/store fixtures | Active Run finishes; next start gated | Pass - integrated closure candidate |
| Echo Atlas and Gate Warden milestones | Atlas/session/view tests plus `tests/e2e/game.spec.js` | Desktop, mobile, keyboard, 200% text, reduced motion | Pass - integrated closure candidate |
| Cloud Quest Continuity | Quest continuity/controller/route/store tests and browser passage | Offline retry, same-Quest merge, incompatible-Quest choice, two-device proof | Pass - integrated closure candidate |
| Lantern Journal and Practice Lantern | Journal/learning-objective/continuity tests and browser passage | Clear, sync, non-repeat, no gameplay effect | Pass - integrated closure candidate |
| Explorer Access Settings | Settings adapter/view tests and browser passage | 390 px, 200% text, reduced motion, persistence/reset | Pass - integrated closure candidate |
| Daily Shared Labyrinth | Daily contract/storage tests and `tests/e2e/daily.spec.js` | Desktop, mobile, UTC rollover, expired link, Quest isolation | Pass - integrated closure candidate |
| Account deletion | Signed Clerk webhook, deletion-store, and migration tests | Retry-safe transactional cascade | Pass - integrated closure candidate |
| Billing disable and rollback | Access-config tests and `docs/lifetime-membership-operations.md` | Desktop/mobile starts, entitlement preserved, webhook retained | Pass - integrated closure candidate |
| Explorer Access Settings profile sync | Settings adapter/controller/route/store and export/deletion tests | Guest local-only, signed-in optimistic sync, conflict, device change | Pass - export schema `echo-maze-export/2` approved |
| Audit ownership and immutable checkpoints | Migration, append-function, checkpoint adapter, chain verifier, and operations-contract tests | Non-owner runtime, create-only checkpoints, retained-anchor verification | Pass - adapter configured for `<immutable sink/bucket>`; live sink provisioning remains external |
| Classroom authority and Class Play isolation | Authority, tenant-context, RLS, route/store/controller tests plus `tests/e2e/classroom.spec.js` | Signed-out, empty, Student, Teacher, loading, stale, error; desktop/mobile/200%/keyboard/reduced motion | Pass - live PostgreSQL cross-Class denial and count-only Teacher read |

Semantic assertions cover dialog names, heading focus, focus return, visible
keyboard focus, non-color state labels, live status regions, native button
behavior, and accessible control names. These are the automated screen-reader
contract; a production launch may add manual assistive-technology acceptance
without weakening this gate.

## Complete local gate

Run against the integrated release commit:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:bundle
npx playwright test --workers=4
```

Final integrated closure-candidate evidence:

- Vitest: 867 passed; 15 intentional environment skips
- Playwright desktop/mobile: three consecutive green full runs at 4 workers;
  two were 117 passed / 5 intentional Clerk-network skips and one was
  115 passed / 7 skips while Clerk throttled two optional network passages
- Live PostgreSQL Classroom integration: 1 passed after migrations 0001-0016
- Landing JavaScript: 7.39 KB gzip / 8 KB
- Game JavaScript: 27.00 KB gzip / 30 KB
- Shared styles: 10.21 KB gzip / 12 KB
- Admin JavaScript: 5.78 KB gzip / 20 KB
- Optional Clerk boundary: 544.21 KB gzip / 600 KB

## Operational drills

The executable support, receipt recovery, refund/dispute, account deletion,
billing-disable, rollback, privacy, and external-approval procedures live in
`docs/lifetime-membership-operations.md`.

The final drill must prove:

1. `RUN_ACCESS_ENFORCEMENT_ENABLED=false` returns unmetered starts without
   deleting a grant, purchase, or entitlement.
2. Signed webhooks continue while starts are unmetered.
3. An existing member remains active while Stripe is unavailable.
4. Account deletion removes application-owned cloud data transactionally while
   provider financial retention remains separate.
5. Structured events contain only bounded public states and never identities,
   secrets, tokens, raw webhooks, payment identifiers, card/billing data,
   Question text, or child-entered content.

All five engineering drills pass through the integrated access, membership,
deletion, product-event, safe-log, operations-contract, and browser fixtures.
The live PostgreSQL subset passes against the configured development database.
Stripe network credentials are not configured on this machine, so the Checkout
result above is fixed-adapter contract proof and does not claim an external
Stripe test transaction.

## Mandatory review follow-ups

PRs #81 and #82 were merged under the approved dependency-blocking fallback
after CodeRabbit confirmed its review limit. Their mandatory post-merge reviews
remain open until the refill trigger posts a completed review and its one-time
findings read is resolved. The Phase 8 release PR must also complete the normal
CodeRabbit protocol, or carry the same explicit post-merge obligation only if
the confirmed limit blocks the sole remaining deliverable.

PRs #52, #53, and #55 reached final `Review completed` status after refill.
Their one-time findings reads are complete. PR #55 has ten review threads, ten
CodeRabbit inline findings, two CodeRabbit resolution replies, and two owner
resolution replies. Its final Critical first-save clear-generation finding was
fixed in `d013f3f`, covered by the non-zero-generation PostgreSQL regression
test, answered with that evidence, and resolved. Live GraphQL verification
reports zero unresolved #55 threads.

PR #56 received a complete CodeRabbit review before merge. Its four inline
findings were fixed together in `b99aef4`, individually acknowledged by
CodeRabbit, and all four threads are resolved. After the confirmed adaptive
limit refilled, the required post-merge trigger reached terminal status and
posted no new actionable finding because the PR was already closed. The one-time
findings read is complete. No mandatory review remains outstanding.

## External deferrals

These are external production decisions, not unfinished engineering:

- approval of player-facing refund, dispute, privacy, deletion, and support
  language;
- creation and approval of a live one-time Stripe Product and `$5.99 USD`
  Price;
- authorization to enable production enforcement; and
- authorization for a live purchase-and-refund smoke test.

They remain deferred with production enforcement off. Stripe test-mode proof
is required and does not perform a live charge.

## Remote-main proof

Captured after the closure merge, mandatory review resolution, and issue
closure:

- closure PR: #56 merged at 2026-07-26T17:52:29Z
- remote `main` program merge commit: `5b378aafc9bf80b930d0e707e7b4b4e752cb27d0`
- issue #40 state: closed
- issues #41-#47 state: closed
- issue #48 state: closed
- GitHub Actions permissions: API verified `enabled=false`
- production deployment: GitHub deployment record `5612622739` maps to READY
  Vercel deployment `dpl_C7ARaDukdAwBCGqxyNvLwrD95X73` for the exact remote
  `main` program merge commit
- live routes: `/`, `/play`, and a deterministic shared link returned usable
  runtime state; Run Access reported `enforcementEnabled=false`
