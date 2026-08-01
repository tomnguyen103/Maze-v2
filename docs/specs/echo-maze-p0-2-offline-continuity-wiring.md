# P0.2 — Wire the Offline Run Continuity vertical slice

Parent issue: [#150](https://github.com/tomnguyen103/Maze-v2/issues/150)

## Problem Statement

Echo Maze already contains the signed receipt, deterministic replay, service
worker, offline Practice, and local scrub mechanisms for Offline Run
Continuity, but the running application does not connect them. An Explorer can
therefore not take an already-authorized Quest Run through **Continue Offline**
and return with a replay-verified result. The current gaps also leave account
state, suffixed Practice pins, worker restarts, exports, and expired receipts
without the end-to-end privacy boundary promised by ADRs 0034–0036.

## Solution

Wire one complete signed-in Personal Quest journey: online Run admission issues
and verifies an exact device-bound receipt; the browser pins the receipt-bound
assets and records the real Run Action Log v2; a disconnected Explorer uses
Continue Offline; reconnect submits the same bounded package and idempotency key;
the server replays before any Quest, Journal, or shared-score write; and
sign-out/account deletion remove every account-scoped offline artefact. Keep
Classroom Run Grants online-only and preserve all unresolved production key and
migration work as explicit release boundaries.

## User Stories

1. As a signed-in Explorer, I want an admitted Quest Run to receive a signed
   receipt, so that a network outage can continue that exact Run without
   creating new access.
2. As an Explorer, I want the receipt to name my exact Run, seed, Quest Level,
   Labyrinth Number, ruleset, content pack, and device, so that copied or
   altered state cannot be treated as the same Run.
3. As an Explorer, I want the browser to verify the receipt before showing
   Continue Offline, so that a malformed or stale receipt never looks like
   offline authority.
4. As a Guest Explorer, I want eligible existing Guest admission to use the
   same receipt contract when supported, so that the implementation does not
   invent a second admission rule.
5. As a Classroom Student, I want a disconnected Class Run to remain paused
   local recovery rather than become playable offline, so that Membership and
   assignment authority remain authoritative.
6. As an Explorer, I want the active Run to keep one coherent app, ruleset, and
   reviewed content pack across a worker update, so that replay matches what I
   saw while disconnected.
7. As an Explorer, I want worker pin state to survive a worker restart, so that
   a browser restart does not silently release or mix my active Run's assets.
8. As an Explorer, I want account-scoped caches isolated from another account
   on the same device, so that shared-device use cannot reveal private state.
9. As an Explorer, I want to choose Continue Offline from the visible game
   surface, so that offline play is a normal, discoverable continuation rather
   than an undocumented storage trick.
10. As an Explorer, I want movement, Pulse, Bell, Hint, answer, and Skip
    actions recorded as bounded version-2 actions, so that the server can
    reproduce the Run without storing reviewed text.
11. As an Explorer, I want the selected option identifier tied to the exact
    Reviewed Question Revision I saw, so that replay rejects a mismatched
    Question instead of accepting a client assertion.
12. As an Explorer, I want a long or unrecordable Run to stay playable but be
    honestly marked unverifiable, so that the app never claims replay proof it
    does not possess.
13. As an Explorer, I want a terminal offline result to say Pending
    verification before replay finishes, so that a local result is not confused
    with a server-accepted result.
14. As an Explorer, I want transport failure to preserve the detailed package
    and retry with the same key, so that reconnecting repeatedly cannot lose my
    result or create duplicate effects.
15. As an Explorer, I want successful server replay to update cloud state only
    after the replay passes, so that a forged score, Quest boundary, or Journal
    outcome cannot reach shared state.
16. As an Explorer, I want a terminal replay rejection to preserve an
    outcome-only Run Record marked Offline—unverified, so that a failed trust
    check does not erase my local memory or write cloud state.
17. As an Explorer, I want missing the submission deadline to discard only the
    detailed verification package, so that the outcome remains visible without
    retaining answer or route history.
18. As an Explorer, I want sign-out to warn me before discarding an unverified
    result, so that a shared-device privacy cleanup is not surprising.
19. As an Explorer, I want sign-out to clear receipts, reviewed packs, pending
    logs, recovery data, Run Replay details, worker account caches, and suffixed
    Practice pins, so that the next account cannot inspect or reuse my state.
20. As an Explorer, I want account deletion to use the same local cleanup
    boundary, so that deletion does not leave a browser copy behind.
21. As an Explorer, I want my server-held offline records represented in data
    export, so that portability and deletion cover the same personal data.
22. As an operator, I want expired receipt rows pruned through the existing
    maintenance route, so that bounded verification records do not accumulate.
23. As an operator, I want reads to remain expiry-guarded even before pruning,
    so that housekeeping delay cannot extend privacy or authority windows.
24. As a maintainer, I want the receipt public key bundled without private
    material, so that browser verification works without exposing signing
    authority.
25. As a maintainer, I want local tests to use ephemeral keys and injected
    persistence, so that development proves the contract without generating or
    deploying production key material.
26. As a release owner, I want browser evidence to identify fixture-backed and
    production-dependent portions separately, so that this task does not claim
    live migrations, keys, or production readiness that were not authorized.

## Implementation Decisions

- The first end-to-end path is signed-in Personal Play. Guest issuance may use
  the same server contract where existing Guest admission supplies authority;
  Classroom Play is permanently excluded from offline receipts.
- Receipt and pending-submission endpoints are mounted through the existing
  shared player function and Vercel rewrite budget. They use the existing
  signed receipt and replay services rather than duplicating their rules.
- The server validates an existing Run Access grant and derives ruleset and
  reviewed content-pack identity from server-controlled data. The browser may
  present a bounded installation nonce, but the server derives the persisted
  device hash with a server-only salt and never stores the nonce.
- A single client continuity controller owns receipt verification, bounded
  package storage, worker messages, Continue Offline, retry identity, and
  reconciliation labels. The existing game transition and terminal seams feed
  it; no second deterministic engine is introduced.
- Offline action logging is enabled only for Quest Runs, never Verified Daily.
  The existing version-2 recorder remains the only durable action shape, and
  detailed logs are deleted immediately after accepted replay or terminal
  rejection.
- The service worker uses durable IndexedDB state for pinned versions, Run
  references, staged versions, and account scope. Public shell assets may
  remain; account-scoped content and cache manifests are removed on sign-out.
- The existing scrub boundary is called on identity end and account deletion,
  and its account-key namespace is widened to cover suffixed Practice pins.
- Export gains only the server-held offline receipt/submission records needed
  for portability. Reviewed content, selected options, and action logs remain
  device-local and are never export rows.
- Expired receipt pruning is added to the existing internal maintenance
  surface; expiry predicates remain in reads and submission functions.
- Production receipt keys, migration application, database provisioning, and
  enforcement remain external release operations.

## Testing Decisions

- Route tests use injected signer, verifier, database, clock, identity, and
  replay dependencies. They cover admission validation, device derivation,
  exact binding, auth isolation, duplicate Run/key behavior, expiry, and no
  cloud write before successful replay.
- Continuity-controller tests use fake storage, fake worker ports, fake network,
  and a restartable worker state. They cover restart, account switch, quota
  failure, staged updates, transport retry, replay rejection, expiry, and
  deletion.
- Existing game-session tests remain the behavioral authority for gameplay;
  integration tests prove the live transition and terminal seams append v2
  actions and persist the pending outcome.
- Privacy tests assert that durable storage and server records contain no
  reviewed text, selected option identifiers, or full route, and that the
  suffixed Practice key is scrubbed.
- A built-page desktop/mobile browser journey exercises the visible Continue
  Offline control and Pending verification/Offline—unverified states. Any
  fixture-backed API or external migration/key limitation is recorded as such.
- The standard local gate remains lint, typecheck, full Vitest, build, and
  bundle budget, followed by browser checks for this UI-facing feature.

## Out of Scope

- Applying migration 0024 to a live database.
- Generating, deploying, rotating, or activating production receipt keys.
- Offline Class Play, offline payment, entitlement inference, or new offline
  Run admission.
- Replacing the existing deterministic engine or Verified Daily v1 contract.
- Adding Workbox, a PWA dependency, or increasing the game bundle budget.
- Live billing, production enforcement, irreversible production changes, or
  production secret configuration.

## Further Notes

The highest implementation seam is the client continuity controller plus the
existing server player-function composition root. The work is one PR batch
unless implementation proves the non-generated diff exceeds roughly 1,000
lines or separates into genuinely independent server and client slices. Ticket
files declare blockers; tickets are not separate PRs.
