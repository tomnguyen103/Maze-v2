# Echo Maze release readiness

**Evidence date:** 2026-07-26

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
| Public landing and Guest entry | `tests/e2e/entry.spec.js` | Desktop, mobile, 200% text, reduced motion | Pending integrated `main` |
| Guest demo completion and account handoff | `tests/demo-access.test.js`, `tests/e2e/entry.spec.js`, `tests/e2e/game.spec.js` | Escape, defeat, reload, direct link | Pending integrated `main` |
| Signed-in profile and score continuity | Player client/controller/route/store tests plus `tests/e2e/game.spec.js` | Signed fixture, Guest fallback | Pending integrated `main` |
| Three free Run starts and idempotent replay | Run Access domain/route/store/integration tests | Duplicate, multi-tab, retry, outage | Pending integrated `main` |
| `$5.99 USD` one-time test Checkout | Lifetime domain/service/route/store tests and membership browser passage | Desktop, mobile, 200% text; test mode only | Pending integrated `main` |
| Direct confirmation and signed webhook convergence | Lifetime service/store fixtures | Return-first, webhook-first, duplicate, wrong owner | Pending integrated `main` |
| Refund, dispute, restored funds, and outage | Lifetime transition/store fixtures | Active Run finishes; next start gated | Pending integrated `main` |
| Echo Atlas and Gate Warden milestones | Atlas/session/view tests plus `tests/e2e/game.spec.js` | Desktop, mobile, keyboard, 200% text, reduced motion | Pending integrated `main` |
| Cloud Quest Continuity | Quest continuity/controller/route/store tests and browser passage | Offline retry, same-Quest merge, incompatible-Quest choice, two-device proof | Pending integrated `main` |
| Lantern Journal and Practice Lantern | Journal/learning-objective/continuity tests and browser passage | Clear, sync, non-repeat, no gameplay effect | Pending integrated `main` |
| Explorer Access Settings | Settings adapter/view tests and browser passage | 390 px, 200% text, reduced motion, persistence/reset | Pending integrated `main` |
| Daily Shared Labyrinth | Daily contract/storage tests and `tests/e2e/daily.spec.js` | Desktop, mobile, UTC rollover, expired link, Quest isolation | Pending integrated `main` |
| Account deletion | Signed Clerk webhook, deletion-store, and migration tests | Retry-safe transactional cascade | Pending integrated `main` |
| Billing disable and rollback | Access-config tests and `docs/lifetime-membership-operations.md` | Desktop/mobile starts, entitlement preserved, webhook retained | Pending integrated `main` |

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

Record the final totals, intentional environment skips, and four bundle-budget
measurements here after the last dependency merges:

- Vitest: pending integrated `main`
- Playwright desktop/mobile: pending integrated `main`
- Landing JavaScript: pending integrated `main`
- Game JavaScript: pending integrated `main`
- Shared styles: pending integrated `main`
- Optional Clerk boundary: pending integrated `main`

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

Fill only after the closure PR merges:

- closure PR: pending
- remote `main` commit: pending
- issue #40 state: pending
- issues #41-#48 state: pending
- GitHub Actions permissions: expected `enabled=false`; final API proof pending
- production deployment for remote `main`: pending
