# Echo Maze: Current Status

Status snapshot: 2026-08-01

## Verdict

Echo Maze is post-milestone-complete, but not launch-complete.

The core product is coherent and substantially implemented. The next work is not another infrastructure-first milestone. It is integration hardening, release proof, and turning the shipped systems into a memorable expedition.

## Repository state

- `main` is clean and synchronized with `origin/main`.
- Current commit: `b9cfd20` (`docs: record the Echo Maze programme closeout`).
- No open pull requests.
- GitHub Actions are disabled. Local validation is the CI gate.
- CodeGraph index is present and current: 339 files, 3,253 nodes, 6,898 edges.

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
- Offline Run Continuity mechanisms;
- health, readiness, telemetry, privacy, and export foundations.

The [programme closeout](../playtests/echo-maze-programme-closeout.md) is the primary historical release record. The [frozen expedition roadmap](../plans/echo-maze-next-expedition-roadmap.md) remains the contract for gameplay, privacy, content, and performance constraints.

## Live deployment snapshot

Checked against `https://maze-v2-zeta.vercel.app` on 2026-08-01:

| Surface | Result | Meaning |
| --- | --- | --- |
| `/` | 200 | Landing surface loads. |
| `/play` | 200 | Game surface loads. |
| `/api/health` | 200 | Deployment responds; version reports `b9cfd20`. |
| `/api/ready` | 503 | Database and Clerk report `ok`; Stripe is `unconfigured`. |
| `/api/access/config` | 200 | Enforcement disabled; guest demo enforcement enabled. |
| Verified Daily endpoints | 500 | Service reports Verified Daily unavailable. |
| `/sw.js` | 200 | Service-worker asset is deployed, but the app does not register the worker yet. |

Current deployment is a working demo/test surface, not proof of production readiness.

## Current blockers

### Offline Run Continuity is not wired

Milestone 5B shipped receipt signing, replay verification, offline action-log code, service-worker logic, Practice support, and cleanup helpers. The running app still does not:

- issue a receipt from the real page;
- register and use the service worker;
- record the live Quest loop in Action Log v2;
- connect the Continue Offline control;
- submit an offline run for server replay;
- scrub all offline state during real sign-out/account deletion.

Track this work in [issue #150](https://github.com/tomnguyen103/Maze-v2/issues/150). Known gaps include service-worker restart persistence, account isolation, export coverage, Practice-key cleanup, and server-side device-hash validation.

### Test runner can report false confidence

The last recorded full gate passed lint, typecheck, build, bundle, Vitest, and Playwright. However, Vitest reruns showed workers exiting unexpectedly while the process still returned success and reported fewer tests. Finish [issue #151](https://github.com/tomnguyen103/Maze-v2/issues/151) before treating a green test command as trustworthy.

### External release setup remains deferred

- Database migrations `0018`–`0024` require authorized application and smoke testing.
- Offline receipt keys need generation and deployment.
- Verified Daily needs live configuration and route verification.
- Stripe is not activated.
- Access enforcement is disabled.
- Manual acceptance testing has not yet been completed.

These are release operations, not tasks to perform implicitly during normal feature implementation.

## Release profiles

The project currently supports two honest release descriptions:

1. **Demo profile:** guest play works; paid access, Verified Daily, and production enforcement remain disabled.
2. **Production profile:** readiness is healthy; migrations, keys, Daily services, privacy flows, Stripe, enforcement, and manual acceptance all pass.

Do not describe the current deployment as production-ready until the second profile is verified.

## Read-only verification note

This snapshot was created from live repository, GitHub, deployment, and source inspection. No tests, builds, browser suites, or source changes were run during the status review itself.
