# 0038: Wire Offline Run Continuity through existing application boundaries

- Status: Accepted
- Date: 2026-08-01

## Context

Milestone 5B delivered the Offline Continuity Receipt, replay, service-worker,
Practice, and scrub mechanisms, but the running application does not reach
them. The wiring must preserve the exact-Run authority and privacy contracts in
ADRs 0034-0036 while fitting the existing Vercel function ceiling, lazy game
chunks, and Clerk/database boundaries.

## Decision

The first player-facing vertical slice is a signed-in Personal Quest Run. The
same receipt seam may admit an eligible Guest Run when the existing Guest
admission contract supplies enough authority. Classroom Run Grants never enter
the offline path and remain paused local recovery until Membership and
assignment are rechecked online.

Offline receipt issue and pending submission use `/api/offline/receipt` and
`/api/offline/submission`. Vercel rewrites route both through the existing
shared player function rather than adding functions. The server composes the
existing receipt signer and submission service with database-backed receipt and
idempotency calls. It validates an existing Run Access grant before issuing a
receipt, derives the receipt-bound ruleset and reviewed content-pack identity
from server-controlled inputs, and derives the device installation hash from a
bounded installation nonce plus server-only salt. Raw nonces never enter the
database or logs.

One client continuity controller owns the device-local Offline Verification
Package, the service-worker message channel, receipt verification, retry key,
and reconciliation labels. `main.js` feeds the existing game transition and
terminal seams into that controller; it does not create a second game engine.
Continue Offline can only restore the exact receipt-bound Run. Offline
transitions append Run Action Log v2 entries, and terminal state persists the
outcome as Pending verification before attempting submission. Transport failure
keeps the same package and key; accepted replay deletes the detailed package;
terminal rejection or expiry keeps only the outcome-only
Offline—unverified Run Record.

The service worker persists pin/run state in IndexedDB, with account-scoped
cache manifests and explicit public-asset scope. A worker restart re-derives
state from durable records. Staged activation and eviction continue to obey
ADR 0036, and sign-out removes account-scoped caches through the same cleanup
boundary as local storage.

Sign-out and account deletion call the shared offline scrub path before the
identity boundary completes. Scrub matches the full account-key namespace,
including suffixed Practice pins, and the server export includes only the
offline records held for that Explorer. Expired receipt cleanup is exposed as
the existing authenticated internal maintenance job; reads remain expiry
guarded so pruning is not the only privacy control.

Receipt keys and migration 0024 remain external release operations. Local
tests may use generated ephemeral keys and injected database/route adapters,
but no private key, live migration, or production enforcement is created by
this feature.

## Consequences

- The browser can demonstrate one complete authorized offline journey without
  weakening Run Access or Classroom fail-closed behavior.
- The server remains the authority for admission, content identity, replay, and
  cloud writes; the browser stores only bounded recovery state.
- The worker survives restart and account switching without sharing private
  caches across Explorers.
- The application still needs explicit release evidence for real database
  migrations, receipt-key deployment, and production configuration.

## Testing decision

The highest-value seams are the route handlers with injected persistence,
the continuity controller with fake storage/worker/client boundaries, the
existing game transition/finish seams, and a built-page browser journey. Tests
must cover restart, account switching, staged update, quota failure, rejected
replay, transport retry, sign-out, deletion, and the absence of reviewed text
or selected option identifiers from durable state.
