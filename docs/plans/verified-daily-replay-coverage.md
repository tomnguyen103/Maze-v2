# Verified Daily replay implementation coverage

**Status:** In progress

**Scope:** Backlog features 16 and 17, delivered together in one branch and one
pull request.

**Authoritative inputs:** `/goal` contract dated 2026-07-28,
`docs/UNFINISHED-FEATURES.md`, `CONTEXT.md`, ADRs 0001, 0003, 0005, 0012, and
0024, plus the Daily sections of both product plans referenced by the backlog.

## Reconciliation

- ADR 0005's ordinary Global Scoreboard remains casual. Feature 16 adds a
  separate replay verifier; it does not retroactively certify Score Entries.
- ADR 0012's Daily isolation contract remains binding. ADR 0024 supersedes only
  its temporary decision to omit global ranking, now that the approved
  server-verification prerequisite is being built.
- The superseded prioritized roadmap still contributes unique Daily acceptance
  requirements. Its casual-first sequencing is satisfied by the shipped local
  Daily; this batch implements its separately approved verified follow-up.
- The master plan deferred Daily ranking until the fairness contract was strong
  enough. ADR 0024 records that contract and chooses server verification rather
  than a casual trust model.
- ADR 0003 keeps generated and database-overlaid Questions outside
  deterministic Runs. Verified Daily replay uses only the existing canonical
  bundled reviewed Question sequence. Ordinary generated-question Runs stay on
  the casual compatibility path.
- No source defines testable streak or reward behavior. Streaks, rewards,
  scarce cosmetics, and historical boards remain deliberately deferred.

## Agreed test seams

1. Run Action Log public module: records only accepted replay actions and
   produces bounded version-1 payloads.
2. Replay verifier public module: reconstructs with `createRun`, injects trusted
   Questions, replays with `applyAction`, and returns derived terminal facts.
3. Daily HTTP handler: current-date contract, authentication, validation,
   idempotency, public privacy, and truthful failure responses.
4. Daily store: one best row per Explorer/date and deterministic Top-N order.
5. Browser journey: signed-in verified submission plus loading, empty,
   rejection, signed-out, unavailable, keyboard, mobile, reduced-motion, and
   200-percent-text states.

These seams were supplied or authorized by the goal and match existing public
boundaries. No lower-level private helper tests are planned.

## Requirement ledger

| ID | Source | Unique requirement | Planned implementation | Verification |
| --- | --- | --- | --- | --- |
| R01 | Goal F16 | Client emits a deterministic versioned action log with only replay-required state changes | Version-1 Run Action Log module integrated at the `transition` boundary | Unit tests prove allowed entries, omissions, order, and stable serialization |
| R02 | Goal F16 | Server reconstructs from trusted seed and allowed configuration | Replay verifier owns seed/config inputs and calls existing `createRun` | Fixed-seed verifier tests |
| R03 | Goal F16 | Server replays through existing deterministic rules | Replay verifier calls existing `applyAction`; no second game engine | Replay tests plus invariant suite |
| R04 | Goal F16 | Terminal outcome and score are server-derived | Verifier returns derived status, score, Warden, Echo, Move, and elapsed facts | Tampered claim tests |
| R05 | Goal F16 | Reject malformed logs | Strict object/version/action schema | Invalid-shape table tests |
| R06 | Goal F16 | Reject impossible or out-of-order actions | Require each action to be legal and effective in current replay state | Move, Pulse, Challenge, and ordering tests |
| R07 | Goal F16 | Reject incomplete/non-terminal submissions | Daily submit accepts only terminal escaped replay | Route and verifier tests |
| R08 | Goal F16 | Reject resource exhaustion | 64 KiB body, 1,024 actions, four-hour cumulative time | Boundary and over-limit tests |
| R09 | Goal F16 | Reject divergent claims | Compare repeated contract and terminal claims to canonical/derived facts | Seed, level, Labyrinth, score, outcome, Move, elapsed tests |
| R10 | Goal F16 | Reject duplicate terminal actions | Stop accepting actions after first terminal transition | Post-terminal replay test |
| R11 | Goal F16 | Unknown action types fail closed | Explicit action allowlist | Unknown-type test |
| R12 | Goal F16 | Altered encounter outcomes fail | Server injects trusted Questions; answer IDs replay real Challenge transitions | Correct, wrong, Skip, defeat, and forged-answer tests |
| R13 | Goal F16 | Existing score submission remains during rollout | Preserve `/api/scores` as explicit `casual-v1` compatibility path | Existing player route/store tests plus compatibility assertion |
| R14 | Goal F16 | Safe default never labels unverified results verified | Global Scoreboard copy/API remain explicitly casual; verified data uses separate routes/table | Unit and browser assertions |
| R15 | Goal F16 | Personal Records continue working | Do not change Run Record persistence/ranking | Existing storage and browser tests |
| R16 | Goal F16 | Guest and offline gameplay continue working | Logging is local/pure; Daily Personal Best remains local; network failure does not block play | Unit and E2E failure tests |
| R17 | Goal F16 | ADR covers trust, versioning, limits, compatibility, migration, rollback | ADR 0024 | Documentation test/review |
| R18 | Goal architecture | Identity, networking, ranking, persistence stay outside deterministic Run calculations | Add adapters around game-session boundary only | Code review and existing determinism tests |
| R19 | Goal security | Parameterized database access and idempotency | Daily store uses parameters and unique keys | Store SQL assertions and integration test |
| R20 | Goal privacy | Public responses contain no Clerk/email/database/child details | Daily public mapper returns rank, username, score, Moves only | Route privacy test |
| D01 | Goal F17 | Competitive Daily submissions require feature-16 verification | Daily submit persists verifier output only | Route integration test with forged claims |
| D02 | ADR 0012 / Goal | Canonical UTC Daily contract | Server derives current `utcDateKey` and `createDailyContract` | UTC boundary tests |
| D03 | Goal F17 | Only intended current Daily contract accepted | Reject expired, future, or mismatched date/version/seed/level/Labyrinth | Route validation matrix |
| D04 | Goal F17 | Repeated submission is idempotent | Idempotency key uniqueness with stable duplicate response | Store and route tests |
| D05 | Goal F17 / ADR 0024 | One best verified result per Explorer/date | Additive table with one row per player/date and conditional best upsert | Migration, store, integration tests |
| D06 | Goal F17 / ADR 0024 | Deterministic ranking tie-breakers | Score descending, Moves ascending, verified time ascending, private stable final key | Store ranking tests |
| D07 | Goal F17 | Public bounded Top-N | Current Daily board limited to 10 entries | Store and route tests |
| D08 | Goal F17 | Approved public facts only | Return rank, username, score, Moves; no elapsed or identifiers | Exact-body route test |
| D09 | ADR 0012 | Daily bypasses Run Access | Existing start path unchanged | Existing Daily E2E plus access-spy assertion |
| D10 | ADR 0012 / Goal | Daily never changes Quest Progress | Existing isolated Daily finish path retained | E2E storage snapshots |
| D11 | ADR 0012 / Goal | Daily never changes active Run locator | Existing locator preservation retained | E2E restore assertion |
| D12 | ADR 0012 / Goal | Daily never changes Personal Records or demo state | Existing storage/demo isolation retained | E2E storage snapshots |
| D13 | ADR 0012 / Goal | Daily never changes Atlas, cosmetics, or ordinary Global Scoreboard | Separate client/server modules and table | Unit/E2E API-spy assertions |
| D14 | Goal F17 | Guest Daily remains usable but cannot submit verified entry | Signed-out board is readable; submission UI explains sign-in; server returns 401 | Route and E2E tests |
| D15 | Goal F17 | Truthful loading state | Daily board region shows loading copy/status | E2E test |
| D16 | Goal F17 | Truthful network failure/unavailable state | Child-safe retryable message; local Daily remains playable | E2E test |
| D17 | Goal F17 | Truthful empty-board state | Explicit no-verified-entries copy | E2E test |
| D18 | Goal F17 | Truthful rejected-submission state | Result dialog distinguishes local save from rejected verification | E2E test |
| D19 | Roadmap §12 / Goal | Two clients get same maze | Preserve canonical Daily seed/config and fixed fixture | Unit/E2E deterministic fingerprint test |
| D20 | Roadmap §12 / Goal | Two clients get same reviewed Question order | Server and browser reuse `getDailyQuestion` | Unit/E2E literal Question ID sequence |
| D21 | Roadmap §12 | Old links explain UTC expiry and offer current Daily | Preserve existing expired-link behavior | Existing Daily E2E |
| D22 | Roadmap §12 | No high-value reward depends on client result | No rewards, streaks, cosmetics, or Quest effects added | Coverage review and absence assertions |
| D23 | Goal F17 | Authorization covered | Public read, authenticated write, Guest rejection | Route tests |
| D24 | Goal F17 | Date boundaries covered | Before/after 00:00 UTC and mid-Run rollover | Unit/route/E2E tests |
| D25 | Goal F17 | Persistence covered at unit/integration level | Migration, mocked store, opt-in live Postgres integration | Migration/store/integration tests |
| D26 | Goal F17 | Keyboard use | Board trigger/dialog/table/retry actions keyboard reachable; focus restored | Playwright |
| D27 | Goal F17 | Reduced motion | Existing reduced-motion contract applies; no required motion added | Playwright/emulation and CSS audit |
| D28 | Goal F17 | 200-percent text | Board remains readable without hidden actions or horizontal page overflow | Playwright |
| D29 | Goal F17 | Desktop and mobile proof | Gameplay and board screenshots at desktop and 390x844 | Playwright screenshots and visual review |
| G01 | Goal invariants | Correct answers defeat Wardens; wrong answers cost Vitality/fresh Question; final Vitality ends Run | Replay reuses `applyAction` and trusted Question injection | Existing game-session suite plus replay cases |
| G02 | Goal invariants | Questions stay reviewed, safe, short, and unambiguous with safe fallback | Verified Daily accepts bundled reviewed deck only; ordinary provider path unchanged | Question and Daily tests |
| G03 | Goal invariants | Twenty unique Quest layouts and Questions remain unique | Daily and replay stay outside Quest Progress | Existing Quest suites |
| G04 | Goal invariants | Difficulty escalation, free Skip, paid Skip, and free Hint remain exact | No gameplay-rule changes | Existing Quest/game/E2E suites |
| G05 | Goal invariants | Seed, Quest Level, and Labyrinth Number reproduce rules and maze | Canonical contract plus existing engine | Fixed fixture tests |
| G06 | Goal invariants | Network, identity, ranking, and Questions never alter maze generation/movement | Replay adapters do not enter `createRun`/`applyAction` state | Determinism tests and code review |
| O01 | Goal operations | No live migration, secret, billing, dashboard, or production enforcement action | Author/test migration only; document external apply | Final external follow-up |
| O02 | Backlog summary | Reuse an existing Vercel function | Daily rewrites share `/api/leaderboard` function | Vercel function-count/routing tests |
| O03 | Goal final proof | New endpoints support safe smoke checks and auth rejection | Public board GET; submit POST rejects unauthenticated request | Post-merge HTTP smoke |

## Completion evidence

To be filled from merged `main`. No row is considered delivered until its
implementation, tests, local review, CodeRabbit review, merge, merged-main gate,
and runtime smoke evidence are recorded.
