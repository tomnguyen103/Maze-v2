# Echo Maze documentation

The root [`README.md`](../README.md) covers gameplay, local development,
deployment, and validation. Root [`CONTEXT.md`](../CONTEXT.md) is the domain
glossary — use its canonical terms in issues, tests, and code. This directory
holds everything else, organised by how authoritative it is.

## Operational guides (living — kept true to the code)

| Document | Single source of truth for |
|---|---|
| [`security-headers.md`](security-headers.md) | Security header set, CSP rationale, per-endpoint rate-limit budgets, `TRUST_PROXY_HEADERS` / `REQUEST_ADDRESS_SALT` |
| [`observability.md`](observability.md) | Structured logs, `/api/health` + `/api/ready`, env-gated tracing (OTel), error tracking (Sentry), PostHog product events |
| [`data-privacy.md`](data-privacy.md) | What the server stores per Explorer, `GET /api/me/export`, deletion, retention |
| [`lifetime-membership-operations.md`](lifetime-membership-operations.md) | Stripe test setup, support triage, receipt recovery, refund/dispute handling, account deletion, billing disable, rollback |
| [`performance-budget.md`](performance-budget.md) | Bundle budgets enforced by `npm run check:bundle` |
| [`testing-database-lane.md`](testing-database-lane.md) | Running the database and object-store test lanes: `npm run test:db`, the roles they need, and why the runtime role must not be a superuser |
| [`secret-scanning.md`](secret-scanning.md) | `npm run security:secrets`, the recorded gitleaks result over full history, and why the two allowlisted matches are not secrets |
| [`migration-safety.md`](migration-safety.md) | The applied boundary, which statements lock a live table, `CONCURRENTLY`, and what a documented quiesce window has to say |

## Decisions — `adr/`

Architecture Decision Records 0001–0037, append-only. Read the relevant ADR
before changing game rules or server contracts; supersede with a new ADR
rather than editing an accepted one. 0001–0012 cover the delivered game and
product foundation; 0013–0024 record enterprise hardening, guest admission,
signed-in settings continuity, audit checkpointing, Classroom tenancy, and
Verified Daily replay; 0025–0037 freeze the Next Expedition feature contracts.

## Plans and evidence — `plans/`

Historical planning and release-evidence records. They are kept as evidence
and are **not** maintained against the current code — each carries its own
status header; trust the code and the operational guides above over any plan
detail.

| Document | Status |
|---|---|
| [`enterprise-hardening-plan.md`](plans/enterprise-hardening-plan.md) | All nine phases delivered through PRs #57–#88 |
| [`enterprise-hardening-log.md`](plans/enterprise-hardening-log.md) | Selected phase execution evidence and delivery deviations |
| [`echo-maze-lifetime-membership-and-echo-atlas-master-plan.md`](plans/echo-maze-lifetime-membership-and-echo-atlas-master-plan.md) | Master plan for the four-plan program; implemented through PRs #49–#56 |
| [`implementation-coverage.md`](plans/implementation-coverage.md) | Requirement-by-requirement evidence ledger for that program (all delivered; C27 deferred on external approval) |
| [`echo-maze-prioritized-feature-roadmap.md`](plans/echo-maze-prioritized-feature-roadmap.md) | Superseded by the master plan; retained as review evidence |
| [`echo-maze-next-expedition-roadmap.md`](plans/echo-maze-next-expedition-roadmap.md) | Frozen five-milestone product contract; implementation starts with issue #95 |
| [`membership-access-implementation-plan.md`](plans/membership-access-implementation-plan.md) | Superseded by the master plan; retained as technical source detail |
| [`entry-experience-implementation-plan.md`](plans/entry-experience-implementation-plan.md) | Implemented through PRs #34, #37, #38, #56 |

[`UNFINISHED-FEATURES.md`](UNFINISHED-FEATURES.md) is the consolidated closure
ledger for the prior backlog. All 17 repository-scoped items are delivered;
live migration, billing, and provider-dashboard work remain explicitly external
where the ledger says so.

[`release-readiness.md`](release-readiness.md) is the frozen release-evidence
index for the four-plan program (evidence date 2026-07-26, test-mode
candidate only). Its evidence is pinned to the program closure commit
`5b378aa`, which predates the enterprise-hardening PRs (#57–#63), so its gate
numbers are a snapshot, not current counts.

## Agent conventions — `agents/`

- [`agents/domain.md`](agents/domain.md) — single-context domain model rules
- [`agents/issue-tracker.md`](agents/issue-tracker.md) — GitHub Issues via `gh`
- [`agents/triage-labels.md`](agents/triage-labels.md) — the five triage labels

## Other

- [`architecture-recon.html`](architecture-recon.html) — dated (2026-07-23)
  architecture recon snapshot from the original refactor; historical.
