# 0034: Admit offline continuity with a signed exact-Run receipt

- Status: Accepted
- Date: 2026-07-29

## Context

Offline Run Continuity must distinguish continuing an already-authorized Run
from creating access while disconnected. Personal Play has account-bound Run
Grants, while Guest Play already receives online admission for one exact Run
through an opaque daily-address-hash marker. Neither browser state nor a copied
cache entry is sufficient authority by itself.

## Decision

Successful online admission for an eligible Guest or Personal Run may issue one
versioned Offline Continuity Receipt. The server signs it with a private key
that never enters the browser. The offline client validates it against a bundled
public key.

The receipt is bound to:

- the current device installation;
- one exact Run ID, seed, Quest Level, and Labyrinth Number;
- the deterministic ruleset revision;
- the immutable reviewed Run-content pack hash; and
- its issue, play-expiry, and submission-expiry times.

Offline play authority ends when the Run becomes terminal or seven days after
issue, whichever comes first. A terminal Run's receipt remains usable only as
verification evidence for up to 48 additional hours and never later than nine
days after issue. It cannot authorize more play, a new Run, different
configuration, replacement content pack, entitlement, purchase, Daily
submission, or direct cloud write. Copying it to another device or Run does not
grant continuity.

Classroom Run Grants are ineligible for Offline Continuity Receipts. Membership
removal must stop active Class Play, and a disconnected client cannot establish
that Membership and assignment authority remain active. Network loss therefore
preserves a Class Run only as paused local recovery until both authorities are
rechecked online.

If play authority expires while disconnected, a non-terminal Run is preserved
as paused local Active Run Recovery and **Continue Offline** requires
reconnection. Missing the submission deadline preserves only an outcome-only
local Run Record marked **Offline—unverified**. Expiry never deletes that local
memory. Public-key rotation retains verification for every receipt through its
submission deadline.

Signing out deletes that Explorer's Offline Continuity Receipts, reviewed
packs, Active Run Recovery, pending action logs, and device-local Run Replay
data. The UI warns when this will discard an unverified offline result. Account
deletion performs the same local cleanup without retaining a copy. Public app
shell, font, and non-account assets may remain, but another account can neither
reuse nor inspect the previous Explorer's offline state.

## Consequences

- Guest and Personal Runs can continue through a bounded outage without
  inventing offline access.
- Class Play remains fail-closed under authoritative Membership removal.
- A service-worker cache or local recovery record is never treated as authority
  by itself.
- Device-key loss or cleared storage requires reconnection but does not create a
  second Run.
- Sign-out may intentionally discard unsynchronized local progress after a
  visible warning in order to protect shared-device privacy.
- Receipt signing, device binding, rotation, tamper, replay, dual deadlines, and
  clock handling require dedicated tests and an operational key procedure.
