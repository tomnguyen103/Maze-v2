# Echo Maze: Current Status

Status snapshot: 2026-08-02

## Verdict

Echo Maze is post-milestone-complete, but not launch-complete.

The core product is coherent and substantially implemented. The next work is not another infrastructure-first milestone. It is integration hardening, release proof, and turning the shipped systems into a memorable expedition.

## Repository state

- `origin/main` includes merged Quest II PR #197 at `618aba1` (including PR
  #192 at `2680874`, PR #152 at `a37dffa`, and PR #158 at `69f4cd6`).
- No product PRs remain open. PR #197's local gate, browser matrix, local
  review, and final CodeRabbit review are complete; CodeRabbit reported no
  actionable comments.
- PR #158 is merged. Its >30-minute CodeRabbit rate-limit waiver, green local
  gate, clean local review, and merge are recorded on the PR.
- The deployed demo currently reports `618aba1` after the Quest II deployment.
- GitHub Actions are disabled. Local validation is the CI gate.
- CodeGraph index is present and current: 405 files, 3,999 nodes, 8,749 edges.

## Shipped product surface

Milestones 1–5 shipped through PRs #102, #115, #123, #133, #148, and #149. Current product includes:

- deterministic Quest gameplay;
- 20-Labyrinth Quest structure;
- reviewed, child-safe question content;
- five difficulty bands and five Atlas regions;
- answer-based Gate Warden encounters;
- Hint and Question Skip economy;
- Practice Lantern and unscored Trails;
- Player Profile, Run Records, Journal, Atlas, and Daily surfaces;
- Classroom, Class Play, and aggregate-only teacher visibility;
- Verified Daily mechanisms;
- Daily Trail Constellation mechanisms;
- Cloud Quest Continuity at Labyrinth boundaries;
- Active Run Recovery;
- Offline Run Continuity wiring is merged in `origin/main`; the production key,
  migration, and deployment boundaries remain external;
- Echo Fossil Atlas contract, continuity, and terminal player path;
- unscored Warden Tactics Lab;
- reviewed Echo Lens packs;
- Quiet Expedition presentation and semantic route;
- explicit Trail Compass intention;
- Classroom Expedition Debrief and privacy-thresholded Class Constellation;
- seed-only Echo Postcards;
- Quest II Living Regions with five new authored arcs and reviewed content;
- health, readiness, telemetry, privacy, and export foundations.

The [programme closeout](../playtests/echo-maze-programme-closeout.md) is the primary historical release record. The [frozen expedition roadmap](../plans/echo-maze-next-expedition-roadmap.md) remains the contract for gameplay, privacy, content, and performance constraints.

## Live deployment snapshot

Checked against `https://maze-v2-zeta.vercel.app` on 2026-08-02 after the
`origin/main` Quest II deployment:

| Surface | Result | Meaning |
| --- | --- | --- |
| `/` | 200 | Landing surface loads. |
| `/play` | 200 | Game surface loads. |
| `/api/health` | 200 | Deployment responds and reports version `618aba1`. |
| `/api/ready` | 503 | Database and Clerk report `ok`; Stripe is `unconfigured`, so production readiness is unavailable. |
| `/api/access/config` | 200 | Enforcement disabled; guest demo enforcement enabled. |
| `/api/daily/leaderboard`, `/api/daily/constellation` | 500 | Verified Daily read services remain unavailable; `/api/daily/scores` correctly rejects a GET with 405 because it is a write path. |
| `/sw.js` | 200 | The deployed worker responds from the current demo surface. |

Current deployment is a working demo/test surface, not proof of production readiness.

## Current blockers

### No remaining repo-controlled roadmap item

Quest II Living Regions is delivered in PR #197 (`618aba1`), and the related
issues are closed. No repo-controlled roadmap requirement remains in Todo or
Partial; the remaining work is release-only verification and authorized
operations described below.

### Offline Run Continuity wiring is merged; external release proof remains

PR #158 connects the existing receipt, replay, worker, Practice, export, and
cleanup mechanisms through the player path. Its local implementation, local
review, and desktop/mobile browser evidence are complete and merged as
`69f4cd6`. Production migration application, receipt-key provisioning, live
reconnect/export/prune smoke checks, and deployment remain external release
work tracked from [issue #150](https://github.com/tomnguyen103/Maze-v2/issues/150).

### Test runner false-confidence issue is fixed

PR #152 merged the canonical worker-loss gate and expected test-count manifest.
The local proof records split-output detection, wrapper wiring, and a full
147-file / 1,327-test run. CodeRabbit review was explicitly deferred by the
owner override and recorded on the PR; the local gate is now the trusted repo
check for this change.

### External release setup remains deferred

- Database migrations `0018` through `0029` require authorized application and smoke testing.
- Offline receipt keys need generation and deployment.
- Verified Daily needs live configuration and route verification.
- Stripe is not activated.
- Access enforcement is disabled.
- Manual acceptance testing, including the human assistive-technology session,
  has not yet been completed.

These are release operations, not tasks to perform implicitly during normal feature implementation.

## Release profiles

The project currently supports two honest release descriptions:

1. **Demo profile:** guest play works; paid access, Verified Daily, and production enforcement remain disabled.
2. **Production profile:** readiness is healthy; migrations, keys, Daily services, privacy flows, Stripe, enforcement, and manual acceptance all pass.

Do not describe the current deployment as production-ready until the second profile is verified.

## Read-only verification note

This snapshot was created from live repository, GitHub, deployment, and source
inspection. The release-proof update records the separate local gate and
desktop/mobile browser receipts; no production migration, key, billing, or
enforcement action was performed.
