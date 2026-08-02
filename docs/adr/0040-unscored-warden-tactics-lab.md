# 0040: Keep Warden Tactics Lab unscored and engine-backed

- Status: Accepted
- Date: 2026-08-02

The Warden Tactics Lab is an optional Workshop surface for learning the
existing encounter grammar before a live Quest is at risk. It uses the same
`createRun` and `applyAction` boundary as Personal Play and the same reviewed
Question path when a fixed scenario reaches a Challenge. It must not introduce
a second deterministic engine or a practice-only Warden behavior.

The Lab is deliberately ephemeral. It does not write Quest Progress, Quest
Continuity, Echo Fossils, Journal outcomes, Player Profile data, Run Records,
Run Replay details, scores, access grants, Daily state, Classroom state,
offline state, local storage, IndexedDB, cookies, or service-worker account
state. It makes no network request. A browser refresh or close discards the
drill session.

The catalog contains four fixed authored cards: Patrol, Hunt, Intercept, and
Trail Twists. Trail Twists is a fixed sequence covering Echo Hush, Windways,
Echo Bridges, Tide Doors, and Warden Bells. These cards may describe the
canonical result visible to the player, but they may not reveal Fog-hidden
state, answer keys, routes, or inferred ability. All copy and Question fixtures
are reviewed and allowlisted.

This boundary keeps practice useful without creating a hidden learner profile,
an unreviewed content path, or a parallel combat implementation. Any future
scored or persistent training must be a separate product decision and ADR.
