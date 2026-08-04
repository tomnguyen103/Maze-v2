# A+ audit remediation — status

Run 1 of the audit (`docs/aplus-audit-report.md`, 2026-08-03, commit `5e55e3a`)
was approved with zero fixes implemented. This records what has been closed
since, and what has not.

**Do not re-run the audit until batches 7 through 10 are done.** A run-2 report
written now would grade a half-remediated tree and its `Δ vs last` column would
be misleading on Performance and Front-End.

## Merged

| Batch | Theme | PR | Findings closed |
|---|---|---|---|
| 1 | Group B quick wins | [#200](https://github.com/tomnguyen103/Maze-v2/pull/200) | TOKENS, T-03, T-04, DB-04, HM-02, six Group B bullets |
| 2 | Testing + DX/CI | [#201](https://github.com/tomnguyen103/Maze-v2/pull/201) | T-01, T-02, T-05, Q-14, Q-02, Q-03, Q-16 (partial) |
| 3 | Correctness | [#202](https://github.com/tomnguyen103/Maze-v2/pull/202) | Q-04, Q-34, Q-26, Q-27, Q-28, Q-46, SM-01, BE-F-01, FE-F-01, FE-F-05 |
| 4a | Secret scanning | [#203](https://github.com/tomnguyen103/Maze-v2/pull/203) | GATE-1 |
| 4b | Security | [#204](https://github.com/tomnguyen103/Maze-v2/pull/204) | SG-01, SG-02 (partial), SG-06, SG-07, SG-13, SG-17, TM-01v, TM-11, TM-12, TM-13 |
| 5 | Back-end data layer | [#205](https://github.com/tomnguyen103/Maze-v2/pull/205) | DB-01, DB-02, DB-03 |
| 6 | Maintainability | [#206](https://github.com/tomnguyen103/Maze-v2/pull/206) | Q-64 |
| 7 | Performance | [#207](https://github.com/tomnguyen103/Maze-v2/pull/207) | WP-01, P-01, P-10, P-04, `vercel.json` functions block |
| 8 | Front-end a11y | [#208](https://github.com/tomnguyen103/Maze-v2/pull/208) | A11Y-06/07/08, A11Y-F, A11Y-02, FE-UI-1 |
| 10 (part) | dataviz ramp | [#209](https://github.com/tomnguyen103/Maze-v2/pull/209) | DASH-20/22/35 |
| 9 (part) | Dark theme | [#210](https://github.com/tomnguyen103/Maze-v2/pull/210) | SHELL-07 |

Gate on `main`: `npm run check` green — lint, typecheck (two projects), 184 test
files / 1,598 tests, build, 15/15 bundle budgets. `npm run security:secrets`
green over 246 commits.

Every Group A finding on Correctness, Security, Testing, Maintainability and
Back-End is closed. Both blockers on the Security grade — `SG-13` and the
gitleaks asterisk — are gone.

## Open, and why

Everything still open is visual work that cannot be finished honestly from a
source diff. Each needs the design stack, desktop and mobile screenshots, and
the Hallmark slop gate; two of them need a decision from the operator first.

### `design.md` was amended, once, deliberately

**`SHELL-07` is closed** ([#210](https://github.com/tomnguyen103/Maze-v2/pull/210)).
It could not be a conformance fix — `design.md` named one surface and
`tokens.css` hard-locked `color-scheme: light` — so it went back to the
operator as the stop-and-ask it was, and the amendment was authorised.

The Theme section of `design.md` now describes one identity on two surfaces.
That is the only amendment made to the locked system in this programme;
everything else conformed to it as written. The three by-construction gate
failures in audit §5 (38, 25, 23) are untouched and remain decision-pending.

**The three-state control's UI is not built.** The choice module, its
persistence and the System default are in and tested; the control belongs in
Settings > Appearance, which is part of `SHELL-04/15` below.

### Needs the design stack and browser verification

| ID | Eff | Why it is not a source-diff change |
|---|---|---|
| `SHELL-11` | L | Extract one layout owner; the shell is re-implemented four times. Collapses 7 of the 18 app-shell violations, so it has to be verified as a shell, not as a diff |
| `SHELL-04/15` | L | Convert admin panels to routes and move `/class` selection into the URL — six panels and five datasets currently mount on every load |
| `DASH-01` | L | Bring "Operations pulse" under `dashboard-creation`: signed brief, data contract, metrics dictionary, layout matrix, gates G1–G10. **G2 and G10 need a live database** |
| `TYPE` | M | A real type scale with a body-copy floor, against 187 `font-size` declarations across 57 values and 133 sub-16px dialog text nodes |
| `HM-01` | M | Split `level-dialog` into one decision per view — three decisions plus a fourth action in one modal |
| `A11Y-01` | S | Make Trail Compass discoverable; it is the documented keyboard and screen-reader path and it is off by default |
| `FE-UI-2` | S | Scope `.primary-button` geometry to the class; the admin auth gate renders a 141×21 px control and its copy says "sign in" with nothing to click |
| `WP-02` | — | Server-render or inline the LCP text. `/` and `/play` share one `index.html`, so this needs a separate HTML entry or landing copy flashes on the game route |

**Before the first Stitch call, create the `design.md` Stitch pairing
frontmatter** — audit §5 records the current pairing state as `neither`.

`TOKENS` and `HM-02` were in batch 8's original list and landed in batch 1.

### A note on how these were handled

Batches 8 and 10 deliberately shipped only the findings whose correctness is
*computable* — contrast ratios derived from the tokens through oklch, focus
rules, key-repeat handling, a monotonic ramp. Every one of those has a test
that recomputes it. The findings above were left rather than claimed on a
source diff, because a UI change nobody looked at is not a UI change that
works.

## Closed differently from the audit's wording

Three findings were implemented against their intent rather than their letter,
each because following the letter would have made something worse. All three
are documented in the merged PR that carries them.

- **`Q-34`** asks for `ReplayInputError` on `assertTrustedQuestion`. That class
  is the terminal-rejection signal, and the assertion guards *our own*
  resolver's output, so a content-publishing mistake would have permanently
  destroyed a legitimate player's offline Run. Trusted-content failures get
  `TrustedReplayContentError`, which stays retryable.
- **`SG-06`** asks to throw at startup. `createPlayerApi` is constructed at
  module load in every serverless entry point, so throwing there
  cold-start-crashes the Scoreboard and the Stripe webhook needed to fix the
  billing state. The refusal is a returned decision: `server.js` refuses to
  boot, serverless logs and degrades.
- **`TM-11`** asks for an `information_schema` drift guard. That needs a live
  database — but the migration files are the schema of record and are in the
  repo, so `tests/deletion-drift.test.js` derives the identifier-bearing tables
  from them instead. It catches all three tables the finding names.

## Partly closed

- **`Q-16`** — the determinism and module-boundary rules are enforced by
  `tests/deterministic-core.test.js`, not by `eslint.config.mjs`. A
  `config-protection` PreToolUse hook refuses every edit to that file. The gate
  force is equivalent; the location is not, and **`public/sw.js` is under
  typecheck but not under lint**, because that also needs `"public/**"` removed
  from the blocked config's ignores.
- **`SG-02`** — the ledger short-circuit is in, so a repeated idempotency key
  costs one indexed read instead of a 4,594 ms replay. "Consume the receipt on
  rejection" is not done: a fresh key against the same `runId` still re-enters
  the replay, because `record_offline_submission` never marks the receipt
  spent. That needs a forward migration to the receipt state machine.

## Known gaps to carry into run 2

- Migration 0030 does not backfill `org_domains.auto_join_enabled = TRUE` rows
  written before it. Migrations 0018–0030 are unapplied, so there may be none —
  it is an operator check, not an assumption.
- `offlineReplayConfigFor` throws `ReplayInputError` when a receipt's ruleset
  revision does not normalize against the *current* ruleset table, which keeps
  no history. Receipts stay submittable for nine days, so a balance deploy
  inside that window would terminally reject honest outstanding receipts.

## Externally blocked — do not simulate

- **`T-02` execution.** The lane is runnable and documented
  (`npm run test:db`, `docs/testing-database-lane.md`) and refuses to pass when
  it executed nothing. Running it needs a live `DATABASE_URL`. No RLS result is
  claimed.
- **Dashboard gates G2 and G10** need a live database.
- **On-platform replay timing** against Vercel's `maxDuration`. Adding a
  `functions` block to `vercel.json` is in scope for batch 7; measuring on
  Vercel is not.
- **Applying any migration** (0018–0030), activating Stripe, flipping
  `RUN_ACCESS_ENFORCEMENT_ENABLED`, generating or deploying production receipt
  keys.
- **The human assistive-technology acceptance session.**

## Operating notes for whoever continues this

- Migrations `0001`–`0017` are applied to the live database. Never edit at or
  below that boundary; fix forward. `docs/migration-safety.md` is the reference,
  and `tests/migration-locking.test.js` fails any unapplied migration that would
  scan a live table under `ACCESS EXCLUSIVE`.
- gitleaks is local tooling: `winget install --id gitleaks.gitleaks`, then
  `npm run security:secrets`.
- Do not chain `git push` after a heredoc-fed `git commit` — the pre-push hook's
  nested `npm run check` inherits a closed stdin and fails spuriously.
- Run the gate to a file or through PowerShell. Piping `npm run check` into
  `grep` truncates the child's stdout and the gate misreports the cause.
