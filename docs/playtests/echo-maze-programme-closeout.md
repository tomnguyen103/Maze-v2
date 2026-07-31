# Echo Maze — programme closeout

Written 2026-07-31, against the state of `main` and the GitHub issue and pull
request records on that date. Every claim below is stated only where a command
run during the closing session produced the evidence for it; the deferred list
exists precisely because several things a reader might assume were done were
not.

## What shipped

All five roadmap milestones are merged to `main`, each as a single squash
commit from one batch pull request.

| Milestone | Pull request | Merged |
| --- | --- | --- |
| 1 — onboarding and recovery | [#102](https://github.com/tomnguyen103/Maze-v2/pull/102) | 2026-07-29 |
| 2 — World Map and Run Memories | [#115](https://github.com/tomnguyen103/Maze-v2/pull/115) | 2026-07-29 |
| 3 — learning and content variety | [#123](https://github.com/tomnguyen103/Maze-v2/pull/123) | 2026-07-30 |
| 4 — Classroom and Accessibility | [#133](https://github.com/tomnguyen103/Maze-v2/pull/133) | 2026-07-31 |
| 5A — Daily Trail Constellation | [#148](https://github.com/tomnguyen103/Maze-v2/pull/148) | 2026-07-31 |
| 5B — Offline Run Continuity mechanisms | [#149](https://github.com/tomnguyen103/Maze-v2/pull/149) | 2026-07-31 |

Per-milestone release evidence lives beside this file in `docs/playtests/`.
`main` is at `97fd60f` with no open pull requests.

Batch B took two CodeRabbit rounds. The first found eight defects; seven were
fixed and one deferred with a written reason. The local review of those fixes
then caught two more that the fixes had themselves introduced — a plpgsql
`IF NOT v_live` that skipped the `no-live-receipt` branch in exactly the case it
existed to catch, because a `SELECT` matching no row leaves the flag `NULL`, and
a duplicate-outcome lookup that matched the client-chosen idempotency key without
scoping to the Run. Both are worth remembering: the review round that fixes
defects is itself a place defects enter.

## The one thing this report will not let a reader assume

Milestone 5 batch B shipped **mechanisms, not a running feature**. The receipt
signing and verification, migration 0024, Run Action Log v2 and its server-side
replay, the service worker, offline Practice, the Continue Offline view, and the
sign-out scrub are all implemented and tested — and nothing in the application
reaches any of them. No route is mounted, no service worker is registered, no
public key is bundled, and no Run Action Log v2 is recorded during play.

That is deliberate and was disclosed in the pull request body and in the
Milestone 5 release evidence. The wiring is tracked as
[#150](https://github.com/tomnguyen103/Maze-v2/issues/150), which also carries
the five known gaps the wiring has to close, including the two the CodeRabbit
review surfaced and this branch deliberately did not fix.

## Gate at closeout

Recorded from the last full run on the batch B branch head (`93f1095`):

- lint: 0
- typecheck: 0
- vitest: 1297 passed, 18 skipped
- build: 0
- check:bundle: 0 — game chunk 29.87 KB against a 30 KB budget
- Playwright: 230 passed, 20 skipped

One caveat on that vitest line, and it is the reason
[#151](https://github.com/tomnguyen103/Maze-v2/issues/151) exists: this suite
can lose a worker, drop every test that worker owned, and still exit 0. Two
independent re-runs during Milestone 5 reported 1266 and 1262 passed against the
same total, each printing "Worker exited unexpectedly". The exit code alone is
not a sufficient gate, and the counts above should be read as one observation
rather than a guarantee.

GitHub Actions remain disabled for this repository. `gh pr checks` showing no CI
is the expected state, not a failure; the local gate is the CI. Third-party
statuses (CodeRabbit, Vercel) still appear there.

## Deferred — external actions nobody has taken

None of these is blocked by code. Each needs an action outside the repository,
and until it is taken the corresponding feature does not work in production.

1. **Database migrations 0018 through 0024 have never been applied to a live
   database.** They are written, registered, and covered by text-level
   assertions only; no test executes the plpgsql. Migration 0024 in particular
   was amended after its first commit, so its function signature must be created
   fresh rather than replaced in place.
2. **Stripe is not activated for live payments.** The Class Expedition License
   and the lifetime membership run against test mode only.
3. **No human assistive-technology session has been run.** Milestone 4's
   accessibility work was verified by automated checks and by keyboard-only
   traversal in Playwright. That is not the same as a screen reader user
   completing a Labyrinth, and the milestone should not be described as
   accessibility-verified until one has.
4. **The service worker is not registered by anything.** See #150.
5. **Offline receipt key material has never been generated.** The three
   `OFFLINE_RECEIPT_*` variables are named in `.env.example` and validated on
   load, but no key pair exists and no environment sets them, so the feature is
   simply unavailable rather than broken.
6. **The offline wiring itself** — #150, described above.

## Review debt

[PR #123](https://github.com/tomnguyen103/Maze-v2/pull/123) carries unresolved
CodeRabbit debt from Milestone 3. It is the user's decision whether to spend a
review event on it; nothing in this programme depends on it.

## Issues

Issues #135 through #139 closed with PR #148, and #140 through #147 with PR
#149. Issue #134, the Milestone 5 spec, was closed by hand — the pull request
body closes only the implementation issues beneath it.

Two issues remain open, both raised during this closeout: #150 (the offline
wiring) and #151 (the vitest gate weakness).
