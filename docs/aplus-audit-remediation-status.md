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

Gate on `main`: `npm run check` green — lint, typecheck (two projects), 184 test
files / 1,598 tests, build, 15/15 bundle budgets. `npm run security:secrets`
green over 246 commits.

Every Group A finding on Correctness, Security, Testing, Maintainability and
Back-End is closed. Both blockers on the Security grade — `SG-13` and the
gitleaks asterisk — are gone.

## Not started

| Batch | Theme | Findings |
|---|---|---|
| 7 | Performance | `WP-01`/`WP-02`, `P-01`, `P-10`, `P-04` |
| 8 | Front-end correctness and a11y | `FE-UI-1`, `FE-UI-2`, `A11Y-F`, `A11Y-06/07/08`, `A11Y-01/02`, `TYPE`, `HM-01` |
| 9 | Front-end architecture | `SHELL-11`, `SHELL-04/15`, `SHELL-07` |
| 10 | Dashboard governance | `DASH-01`, `DASH-20/22/35` |

`TOKENS` and `HM-02` were in batch 8's original list and landed in batch 1, so
batch 8 is smaller than the work order describes.

Batches 8 through 10 are UI work and run the design stack. **Before the first
Stitch call, create the `design.md` Stitch pairing frontmatter** — audit §5
records the current pairing state as `neither`. `design.md` itself stays
LOCKED, decision KEEP.

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
