# Milestone 5 — Shared Wonder and Offline Resilience

Spec for the final milestone of the frozen Next Expedition roadmap
(`docs/plans/echo-maze-next-expedition-roadmap.md` §9.12, §9.13, §10 Milestone 5).
Two committed features: **Daily Trail Constellation** and **Offline Run
Continuity**. Governed by ADRs 0033–0036, building on 0024, 0025, and 0027.

## Ground truth this spec is written against

Established by direct reading of the tree at `a6559fc`, not assumed:

- **There is no service worker.** No `serviceWorker` reference, no `sw.js`, no
  PWA plugin in `vite.config.mjs`, no `manifest.json`. ADR 0036's pinned-asset
  behaviour is greenfield.
- **There is no asymmetric signing.** The only signing facility is server-side
  symmetric HMAC for audit checkpoints (`server/audit-checkpoint.js:64`, `:91`).
  ADR 0034's key pair, bundled public key, and rotation are all new build.
- **The game chunk has 2 bytes of headroom** — 30.00 KB against a 30 KB ceiling,
  with `src/main.js` contributing ~66% of its source bytes. `vite.config.mjs`
  declares no `manualChunks`; every split today is Rollup's automatic one.
- **Run Action Log v1** is `{ version: 1, actions }` with four entry types
  (`src/game/run-action-log.js:1-25`); the server rejects any other version
  outright (`server/run-replay.js:93`).
- **Export** is `echo-maze-export/3` with 18 sections and a `const` schema id in
  `shared/export-schema.json:9`. **Deletion verification asserts exactly 12
  boolean columns** (`server/user-deletion-store.js:132`) — a literal that must
  be bumped by hand for every new personal table.
- Next migration number: **0023**.

## Implementation decisions

Recorded per the autopilot contract: question → chosen answer → source.

1. **Which module leaves the game chunk first?** → The Daily path
   (`src/game/daily-labyrinth.js` + `src/player/daily-submission.js`, 8.9 KB
   raw) becomes a lazy chunk with its own budget row, extracted as ticket 1
   before any Milestone 5 code lands. *Source:* the roadmap's bundle risk row
   ("Lazy chunks, asset budgets, no budget increase as workaround") and the
   Milestone 4 evidence's headroom debt. The Daily path is the cleanest cut
   because ADR 0035 explicitly keeps Verified Daily on Run Action Log v1, so
   Daily and offline never share a chunk.
2. **Receipt signature algorithm?** → ECDSA P-256 with SHA-256, public key
   bundled as a JWK. *Source:* ADR 0034 requires a browser-verifiable signature
   with a server-held private key; `crypto.subtle` supports P-256 everywhere the
   supported browser matrix runs, whereas Ed25519 support is still uneven. This
   is the boring, universally-supported choice.
3. **Service worker tooling?** → Hand-written `public/sw.js` with an explicit
   versioned cache name and a message channel for pin/unpin. *Source:* the
   standing "no new dependencies" constraint rules out `vite-plugin-pwa` and
   `workbox-*`. Flagged plainly: a Workbox build would be the conventional
   choice, and this is the one place the constraint forces a hand-rolled
   mechanism. Its scope is deliberately narrow — precache a pinned manifest,
   never activate while a Run is non-terminal.
4. **One migration or two?** → Two. `0023_daily_trail_constellation.sql` and
   `0024_offline_run_continuity.sql`, so each feature's tables, RLS, and
   deletion cascade land with the tickets that use them.
5. **Export schema id?** → Bump to `echo-maze-export/4`. New sections join it;
   `shared/export-schema.json` and its `const` both change. *Source:* ADR 0033
   makes the contribution receipt personal data that must appear in export, and
   ADR 0034 requires offline state to be erasable on account deletion.
6. **Constellation aggregation host?** → Inside the existing Daily verification
   handler (`server/daily-route.js:151`), after `verifyRunReplay` succeeds and
   before the response. *Source:* ADR 0033 requires aggregation to happen during
   verification with the log in request memory only — a separate endpoint would
   require the log to travel or persist twice.
7. **48-hour deletion mechanism?** → A `scripts/prune-constellation.mjs` job on
   the `scripts/prune-rate-limits.mjs` model, plus a defensive `WHERE` clause on
   every read so an unpruned row can never be served. *Source:* migration 0007
   is the repo's existing precedent for time-bounded rows with a prune job;
   belt-and-braces because ADR 0033's deletion is a privacy guarantee, not a
   housekeeping nicety.
8. **Does offline Practice share the Lantern Trail cache with Quest?** → No.
   The preselected Trail is pinned as its own manifest entry, keyed separately,
   so Practice expiry never disturbs a non-terminal Quest Run. *Source:* ADR
   0034's practice-sync decision keeps Practice current-tab-only and
   non-durable, while ADR 0036 pins Quest assets until terminal — different
   lifetimes, therefore different keys.

## Feature A — Daily Trail Constellation

**Contract** (roadmap §9.12, ADR 0033). Visible only after a Daily escape.
Accepts only the first verified escape per signed-in Explorer per canonical UTC
Daily. Aggregate density and Pulse-use areas only. Thresholds: 20 distinct
contributors to publish at all, 5 distinct contributors per visible cell or
marker, 10 new contributors per published batch update. Bands are Quiet /
Glowing / Bright — never counts. No username, identity, answer, elapsed time, or
raw log. The submitted log stays in request memory. Aggregate counters and a
route-free receipt persist; both hard-delete 48 hours after the Daily expires.
Guests may view after escaping but never contribute.

**Acceptance gates**

- A reconstruction threat-model test: given synthetic verified logs for a cohort
  at each threshold boundary (19/20 contributors, 4/5 per cell, 9/10 per batch),
  the projection reveals nothing below the threshold.
- A small-cohort leakage test: no single contributor's route is recoverable from
  the published projection plus its own known route.
- A request-memory test proving the action log reaches no table, log line, or
  analytics sink on the verification path.
- A 48-hour deletion test over both the prune job and the read-path guard.
- Contribution receipts appear in export and are erased by account deletion,
  with the deletion-verification column count bumped accordingly.
- Guests can view post-escape and cannot contribute; a second escape by the same
  Explorer neither replaces nor subtracts the first.

## Feature B — Offline Run Continuity

**Contract** (roadmap §9.13, ADRs 0034–0036). Player action is **Continue
Offline**. A successful online admission for an eligible Guest or Personal Run
may issue one server-signed, device-bound Offline Continuity Receipt scoped to
the exact Run ID, seed, Quest Level, Labyrinth Number, ruleset revision, and
reviewed content-pack hash. Play authority ends at terminal state or issue+7d.
A terminal receipt stays submission-valid ≤48 further hours, never past issue+9d.
Offline play records Run Action Log v2 — deterministic actions plus exact
Reviewed Question Revision IDs and selected option identifiers, never reviewed
text. On reconnect the server validates the receipt and replays the whole Run;
only a successful replay may touch Cloud Quest Progress, Lantern Journal, or
shared score. Local Run Record starts **Pending verification**; terminal
rejection leaves it **Offline—unverified** with no cloud change. Retries share
one idempotency key. Classroom Run Grants never receive receipts, and no Class
Run starts or continues offline.

**Acceptance gates**

- Receipt binding: a receipt copied to another device, or presented for a
  different Run ID / seed / ruleset revision / content-pack hash, is rejected.
- Both expiry edges: play authority at 7 days, submission validity at 9 days,
  and immediate end of play authority at terminal state.
- Class exclusion: a Classroom Run Grant is never issued a receipt, and a Class
  Run offline is preserved only as paused local recovery pending an online
  recheck of Membership *and* assignment.
- Replay authority: no cloud or shared write occurs without a successful replay;
  a rejected replay leaves cloud state byte-identical.
- Idempotency: repeated submission under one key produces one effect.
- Update safety: a staged service-worker version cannot activate, route the
  active Run, or evict pinned assets while the Run is non-terminal; activation
  only after terminal state plus durable pending-verification storage; a
  security-blocked version pauses the Run and preserves recovery.
- Sign-out and account deletion erase receipts, reviewed packs, Active Run
  Recovery, pending action logs, and device-local Run Replay data, with a
  warning when an unverified offline result would be lost.
- Run Action Log v2 carries no reviewed text, and selected option identifiers
  never enter persistent Run Replay storage.

## Ticket breakdown and PR batching

Sized deliberately against the CodeRabbit review budget: this organisation is
under adaptive Fair Usage limits (95th percentile, roughly one review per 40–50
minutes), so the milestone plans **two** batch PRs, not one per ticket.

Parent spec issue: **#134**.

**PR batch A — Constellation and the headroom that pays for B**

- **#135** Extract the Daily path into a lazy chunk with its own bundle-budget
  row. Buys the headroom every later ticket spends. No behaviour change.
- **#136** Migration 0023: Constellation aggregate counters and route-free
  contribution receipts, forced RLS, cascade, deletion-verification bump.
- **#137** Constellation aggregation inside Daily verification:
  request-memory-only, first-escape-per-Explorer, threshold gating.
  *Blocked by #136.*
- **#138** Constellation projection surface: post-escape only, three density
  bands, "Paths are still forming" below threshold. *Blocked by #137, #135.*
- **#139** Export section, prune job, and read-path 48-hour guard.
  *Blocked by #136.*

**PR batch B — Offline Run Continuity**

- **#140** Receipt issue and verification: ECDSA P-256, bundled public JWK,
  rotation-safe through the submission deadline. *Blocked by #135.*
- **#141** Migration 0024: receipt and pending-submission records, RLS,
  cascade, deletion-verification bump.
- **#142** Run Action Log v2 plus the server's second validator branch and
  replay path. *Blocked by #141.*
- **#143** Hand-written service worker: versioned pinned manifest, no
  activation while non-terminal, security-block pause. *Blocked by #140.*
- **#144** Continue Offline client flow, Pending verification /
  Offline—unverified labels, one-key retry. *Blocked by #140, #142, #143.*
- **#145** Offline Practice: one preselected immutable five-Question Lantern
  Trail, current-tab-only sync. *Blocked by #143.*
- **#146** Sign-out and account-deletion local cleanup with the
  unverified-result warning. *Blocked by #140, #143.*
- **#147** Integrated release evidence and milestone gate.
  *Blocked by #139, #144, #145, #146.*

Batch B is the larger diff and depends on batch A only for bundle headroom, not
for code. #135 must land first regardless of batching.

Frontier order for implementation: #135 and #136 and #141 are unblocked at the
start; everything else waits on its edges.

## Out of scope, stated so it is not inferred

No offline Class Play. No offline payment or entitlement inference. No stale
verified Daily submission after UTC expiry. No historical Constellation archive.
No second deterministic engine. No live migration application, live billing, or
USD price proposal. No new dependency. No bundle-budget increase as a workaround.
