# Milestone 5 Shared Wonder and Offline Resilience release evidence

- Evidence date: 2026-07-31
- Parent: [#134](https://github.com/tomnguyen103/Maze-v2/issues/134)
- Release ticket: [#147](https://github.com/tomnguyen103/Maze-v2/issues/147)
- Batch A branch: `feat/milestone-5-constellation`, merged as `ef66d24`
- Batch B branch: `feat/milestone-5-offline-continuity`
- Base: `c51aaa9`
- Scope: device-local engineering evidence only. No live identity, billing,
  provider, database, or player-research claims are made anywhere below.

## Child-ticket ledger

| Ticket | Delivered contract | Commit | Result |
| --- | --- | --- | --- |
| [#135](https://github.com/tomnguyen103/Maze-v2/issues/135) | Lazy chunk buying game-chunk headroom | `db249bb` | Delivered, **re-scoped** — see below |
| [#136](https://github.com/tomnguyen103/Maze-v2/issues/136) | Migration 0023, Constellation counters and receipts | `45e908a` | Delivered as authored SQL; **not executed** against any database |
| [#137](https://github.com/tomnguyen103/Maze-v2/issues/137) | Aggregation inside Daily verification | `6dbca5b` | Delivered |
| [#138](https://github.com/tomnguyen103/Maze-v2/issues/138) | Threshold-gated projection surface | `477b931` | Delivered |
| [#139](https://github.com/tomnguyen103/Maze-v2/issues/139) | Export section, prune job, 48-hour read guard | `6dbca5b` | Delivered; prune job **not executed** against any database |
| [#140](https://github.com/tomnguyen103/Maze-v2/issues/140) | ECDSA P-256 receipt signing and verification | `cbe8fb0` | Delivered |
| [#141](https://github.com/tomnguyen103/Maze-v2/issues/141) | Migration 0024, receipt and pending-submission records | `e3cca55` | Delivered as authored SQL; **not executed** against any database |
| [#142](https://github.com/tomnguyen103/Maze-v2/issues/142) | Run Action Log v2 and the offline replay path | `ed4c6c7` | Delivered |
| [#143](https://github.com/tomnguyen103/Maze-v2/issues/143) | Hand-written service worker pinning Run assets | `e7c2b24` | Delivered; **not exercised in a real browser** — see below |
| [#144](https://github.com/tomnguyen103/Maze-v2/issues/144) | Continue Offline flow and verification labels | `a1ccb6f` | Delivered |
| [#145](https://github.com/tomnguyen103/Maze-v2/issues/145) | Offline Practice on one preselected Trail | `b9a7e27` | Delivered |
| [#146](https://github.com/tomnguyen103/Maze-v2/issues/146) | Sign-out and account-deletion local cleanup | `b9a7e27` | Delivered |

Batch A also carries `2c85876` (review findings, three axes) and `7e05d16`
(CodeRabbit findings). Both are described in their commit bodies.

### #135 was re-scoped, and the issue text was not edited

The ticket named `src/game/daily-labyrinth.js`. That module is not extractable
as written: `resolveDailyRequest` runs at module top level in `src/main.js`, so
it is on the critical boot path and making it dynamic would force an async boot
refactor — far more than a headroom errand justifies. The other half of the
ticket's pair, `src/player/daily-submission.js`, had already been extracted in
`bcdff1d` during Milestone 4. `src/learning/journal-continuity.js` was
extracted instead. The re-scope is recorded as a comment on the issue, and the
issue body still reads as originally written; a reader of the issue alone would
expect a Daily chunk.

## Privacy record — Daily Trail Constellation

| Guarantee | Evidence | Executed |
| --- | --- | --- |
| Publication at 20 distinct contributors | `tests/constellation.test.js`, boundary at 19 and 20 | Yes |
| Per-marker suppression at 5 | same file, boundary at 4 and 5 | Yes |
| Batch advance at 10 new contributors | same file, boundary at 9 and 10 | Yes |
| Small-cohort reconstruction | same file — a solo corridor at one contributor is absent from the published projection | Yes |
| Request-memory only | `tests/constellation-aggregation.test.js` — markers, audit payloads, and captured log lines carry no action-log content | Yes, with the limit below |
| 48-hour deletion, both mechanisms | `tests/constellation-lifecycle.test.js` — the prune function and the independent read guard, which issues zero statements for an expired Daily | Yes |
| No count, identity, or timing on the surface | `tests/daily-constellation-view.test.js` and the browser `innerText` digit check | Yes |

**Reconstruction threat model.** Publication requires 20 distinct
contributors, and no position is visible below 5. An Explorer who knows their
own route and subtracts it from the published projection is left with the
shared spine, because everything only they touched sits below the per-marker
threshold. The published figure advances a whole batch at a time, so a single
new escape can never be seen as a single-Explorer delta — enforced in the
application, and re-enforced under the totals row lock in
`publish_daily_trail_batch` after CodeRabbit found the eligibility check was
not atomic.

**Small-cohort model.** At exactly the publication threshold with one Explorer
on a private corridor, that corridor is entirely suppressed. The test asserts
each of its three markers is absent from the projection.

**Stated limits.** The request-memory proof spies `console.error` only;
`console.log`, `console.warn`, and the request logger are not captured. No leak
was found on the path, but the assertion is narrower than "no log line"
suggests. Separately, `GET /api/daily/constellation` is readable without an
identity, because the spec allows a Guest to view the Constellation after
escaping and a Guest cannot prove an escape to the server. The post-escape gate
is therefore client-side. What the endpoint can return is bounded by the
thresholds and carries no identity, count, or timing, and it now has its own
rate-limit budget — but a caller who has not escaped can read the published
band map.

## Offline record — Offline Run Continuity

| Guarantee | Evidence | Executed |
| --- | --- | --- |
| Receipt binds device, Run, seed, Level, Labyrinth, ruleset, content pack | `tests/offline-receipt.test.js` — each field drifted independently | Yes |
| A copied receipt is refused | same file, plus `tests/offline-submission.test.js` at the submission path | Yes |
| Play authority ends at issue + 7 days | `tests/offline-receipt.test.js`, both sides of the instant | Yes |
| Submission validity ends at terminal + 48h, capped at issue + 9 days | same file; the cap sits exactly at play expiry + 48h, so it never cuts a legitimate Run short | Yes |
| Classroom Run Grants never receive a receipt | same file — the signer refuses, rather than a downstream filter | Yes |
| Key rotation keeps outstanding receipts verifiable | same file — verifies under the retiring key while it remains published, and stops when removed | Yes |
| No private key in any client bundle | same file — every `src/` module scanned for the import and the variable; built assets scanned for PEM material and for a P-256 JWK carrying `d` | Yes |
| No cloud write without a successful replay | `tests/offline-submission.test.js` — a rejected replay calls no cloud writer | Yes |
| One idempotency key, one effect | same file — three submissions, one cloud write | Yes |
| v2 carries no reviewed text | `tests/run-action-log-v2.test.js` — asserted per entry type, key for key | Yes |
| Verified Daily still validates as v1 | same file — v1 passes unchanged and refuses a v2 log | Yes |
| Option identifiers never persist | `tests/offline-submission.test.js` — the recorded submission's exact seven fields | Yes |
| No staged version activates while a Run is non-terminal | `tests/service-worker.test.js` | Yes, in a sandbox |
| Sign-out erases every account-scoped artefact | `tests/offline-practice-and-scrub.test.js` — asserted per key | Yes |
| Labels are exactly Pending verification / Offline—unverified | `tests/offline-continuity.test.js` and the browser suite | Yes |

**Stated limits.** The service worker is exercised in a `node:vm` sandbox with
a fake service-worker global and a fake Cache Storage, not in a real browser
with a real Cache API. Its nine cases are about its own logic; registration,
real caching, and real activation timing are unproven here. The offline flow's
receipt issue and reconnect are covered at the module and service level; there
is no end-to-end browser proof of a full offline Run, because that needs a
registered worker and a real network partition.

## Gate record

Run as separate commands with exit codes checked. No gate output was piped
through `tail` or any other filter that could mask a failure.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Unit | `npm test` | 1284 passed, 18 skipped, 1302 total |
| Build | `npm run build` | exit 0 |
| Bundle | `npm run check:bundle` | exit 0 |
| Browser, run 1 | `npm run test:e2e` | 230 passed, 20 skipped |
| Browser, run 2 | `npm run test:e2e` | 230 passed, 20 skipped |

Both browser runs were consecutive on the same build, with no retry and no
quarantine: 230 passed and 20 skipped each time, in 2.0 and 1.8 minutes.

The 18 skipped unit files are the database integration suites, which are
environment-gated behind `RUN_DATABASE_INTEGRATION=1` and a disposable
migrated database. They did not run. The 20 skipped browser cases are
project-scoped: cases that assert a single-project behaviour skip on the other
project by design.

## Bundle record

| Chunk | Measured | Ceiling | Headroom |
| --- | --- | --- | --- |
| Landing JavaScript | 6.13 KB gzip | 8 KB | 1.87 KB |
| Game JavaScript | 29.89 KB gzip | 30 KB | 0.11 KB |
| Campfire Resume | 3.95 KB gzip | 5 KB | 1.05 KB |
| Shared styles | 11.79 KB gzip | 12 KB | 0.21 KB |
| Trail Compass | 1.81 KB gzip | 6 KB | 4.19 KB |
| Class Expedition play | 1.01 KB gzip | 5 KB | 3.99 KB |
| Question Narration | 1.47 KB gzip | 6 KB | 4.53 KB |
| Deck picker | 0.41 KB gzip | 2 KB | 1.59 KB |
| Daily submission | 0.37 KB gzip | 2 KB | 1.63 KB |
| Lantern Journal continuity | 1.52 KB gzip | 3 KB | 1.48 KB |
| Daily Constellation | 0.59 KB gzip | 2 KB | 1.41 KB |
| Offline continuity | 0.63 KB gzip | 3 KB | 2.37 KB |
| Optional Clerk | 544.21 KB gzip | 600 KB | 55.79 KB |
| Admin | 6.03 KB gzip | 20 KB | 13.97 KB |
| Optional Sentry | not built (DSN unset) | 120 KB | — |

**The Daily extraction's effect on the game chunk.** The chunk entered this
milestone at 30.00 KB against a 30 KB ceiling. Extracting
`journal-continuity.js` took it to 28.90 KB. Milestone 5's own work then spent
almost all of that: the Constellation surface wiring, the offline continuity
wiring, and the offline scrub import brought it to 29.89 KB. **The game chunk
now has 0.11 KB of headroom.** No ceiling was raised anywhere in this
milestone, and the next feature to touch `src/main.js` should expect to pay for
its bytes by extraction before it writes any code — as #135 did.

## Screenshot inventory

Under `docs/playtests/screenshots/`, desktop and mobile unless noted:

- `milestone-5-daily-constellation-{desktop,mobile}.png` — published projection
- `milestone-5-daily-constellation-forming-{desktop,mobile}.png` — below threshold
- `milestone-5-daily-constellation-200pct-desktop.png` — 390×844 at 200% text
- `milestone-5-offline-pending-verification-{desktop,mobile}.png`
- `milestone-5-offline-unverified-{desktop,mobile}.png`

## Design inspection

Both new surfaces use `tokens.css` values only — no raw colour, spacing, or
radius. The Constellation map is a grid of tokened squares over the night
surface; the offline label uses the same Warden accent the Verified Daily
Board's error state uses, which is deliberate: an unverified result is
something to notice, while Pending is neutral because it may still resolve.
One raw `border-radius` was found in local review and replaced with
`--radius-sm`.

## Assistive-technology review — automated proxy only

Recorded honestly as a proxy, not as a session with an assistive-technology
user. What was checked automatically:

- The Constellation map is one image to assistive technology, with a single
  description; every tile is `aria-hidden`, because per-tile geometry is not
  something an Explorer can act on.
- One polite status per action on both surfaces, asserted by test.
- Keyboard reachability of the only interactive control in the Constellation
  section, asserted in the browser suite.
- 390×844 at 200 percent text with no horizontal overflow, asserted in the
  browser suite.

Not checked: how either surface actually reads aloud in a screen reader, and
whether "Paths are still forming" is understood by a child as a state rather
than an error. **A human assistive-technology session remains outstanding.**

## Deferred external actions

None of these were performed, and none can be inferred from anything above.

1. **Live migration application.** Migrations 0018 through 0024 have not been
   applied to any database. 0023 and 0024 are new in this milestone and are
   authored, text-tested, and unexecuted. No integration test ran, so the SQL
   is unverified by execution — this is the largest unverified surface in the
   milestone.
2. **Live Stripe activation.** No billing action, price, or product change was
   made. No USD price is proposed.
3. **Human assistive-technology session.** Outstanding, as above.
4. **Service-worker registration in production.** `public/sw.js` ships but is
   not registered by the application; registration, real caching, and real
   activation timing are unproven.
5. **Offline receipt key material.** `OFFLINE_RECEIPT_PRIVATE_KEY`,
   `OFFLINE_RECEIPT_KEY_ID`, and `VITE_OFFLINE_RECEIPT_PUBLIC_KEYS` are
   documented and unset. Offline continuity is unavailable until an operator
   generates a key pair and publishes the public half.

## Checkpoint ledger

| Roadmap criterion | Status | Evidence |
| --- | --- | --- |
| Constellation publishes only above threshold | Met | Boundary tests at every threshold |
| Constellation reveals no route, identity, or count | Met | Leak tests in DOM, ARIA, and response body |
| Constellation data is gone 48 hours after its Daily | Met in code, **unexecuted in SQL** | Prune function and read guard both tested; neither run against a database |
| Receipts bind one exact Run and one device | Met | Per-field drift tests |
| Both expiry edges hold | Met | Both instants, both sides |
| Class Play never goes offline | Met | Refused at the signer and at the offer |
| No cloud write without replay | Met | Rejected replay writes nothing |
| Retries produce one effect | Met | Three submissions, one write |
| Updates never disturb a non-terminal Run | Met **in a sandbox** | Service-worker suite is not a browser |
| Sign-out clears the device | Met | Asserted per key |
| Run Action Log v2 carries no reviewed text | Met | Asserted per entry type |
| Verified Daily still validates as v1 | Met | Unchanged coverage plus a v2 refusal |
| Full gate green | Met | Gate record above |
