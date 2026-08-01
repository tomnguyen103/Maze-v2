# Echo Maze: Current Development Roadmap

Status: proposed roadmap for post-Milestone-5 development

Companion status: [Echo Maze Current Status](./echo-maze-current-status.md)

## North star

Make Echo Maze feel like a journey worth remembering:

1. every promised system works in the real player path;
2. every learning interaction has visible value;
3. every return to the game reveals meaningful progress without pressure;
4. teachers receive useful aggregate signals without seeing private child data;
5. new content deepens the existing game instead of creating a second game.

## Non-negotiable product contracts

All roadmap work follows the existing [expedition roadmap](../plans/echo-maze-next-expedition-roadmap.md) and locked `design.md`.

- Use the deterministic `createRun` / `applyAction` boundary.
- Preserve answer-based Warden combat.
- Use reviewed, child-safe content only.
- Keep Quest-wide Labyrinth and question uniqueness.
- Preserve free Hint and first-Skip rules.
- No paid power, loot boxes, subscriptions, streak loss, or battle-pass pressure.
- No free-form AI questions, stories, explanations, or chat.
- No hidden adaptive grading, diagnosis, or answer transcript.
- No public child profiles, raw action logs, individual classroom ranking, or real-time multiplayer.
- No mid-Run cloud sync.
- No second deterministic game engine.
- Reuse existing Vercel rewrites and function budget.
- Lazy-load new game modules. Protect the current game bundle budget.
- Preserve privacy thresholds, export, deletion, forced RLS, and account isolation.

## Priority roadmap

### P0 — Restore trust in the current release

#### P0.1 Test gate reliability

Finish [issue #151](https://github.com/tomnguyen103/Maze-v2/issues/151).

Acceptance:

- worker loss fails the command;
- expected test count is asserted or otherwise verified;
- repeated runs produce stable counts;
- full local gate passes;
- desktop and mobile browser checks pass.

#### P0.2 Offline Run Continuity vertical slice

Finish [issue #150](https://github.com/tomnguyen103/Maze-v2/issues/150) as one player-facing journey:

```text
authorized Quest
  -> signed receipt
  -> disconnect
  -> Continue Offline
  -> offline actions recorded
  -> reconnect
  -> server replay
  -> accepted outcome
  -> sign-out scrub
  -> no residual data
```

Required work:

- mount receipt and pending-submission routes through existing rewrites;
- register the service worker;
- bundle and verify the public receipt key;
- feed the real game loop into Action Log v2;
- connect the Continue Offline button;
- persist service-worker state in IndexedDB or Cache Storage;
- scope cached data by account;
- fix Practice-key cleanup;
- derive and validate device identity server-side;
- include offline records in export and deletion verification;
- prune expired receipts;
- test restart, account switching, update, quota failure, replay rejection, and sign-out.

Definition of done: a real browser completes the entire journey. Unit coverage alone is insufficient.

#### P0.3 Release proof

Choose Demo or Production profile. For Production:

- apply and verify migrations `0018`–`0024`;
- generate and deploy receipt keys;
- verify `/api/ready` is healthy;
- verify Verified Daily routes;
- complete manual accessibility and gameplay acceptance;
- activate Stripe and access enforcement only after explicit authorization;
- resolve or explicitly document inherited CodeRabbit review debt.

### P1 — Signature feature: Echo Fossil Atlas

Create a personal, privacy-safe memory layer for completed expeditions.

After a Labyrinth or Warden outcome, the player receives a reviewed “fossil” containing:

- region motif;
- coarse journey state;
- Warden outcome;
- one short field note;
- one visual stamp.

No answers. No question history. No raw route. No hidden ability score.

Fossils live in the Atlas and sync only at existing Labyrinth boundaries. They compose the existing Atlas, Journal, Sigil Ceremony, Watch Trail, and Echo Lens surfaces. No new currency or progression system.

This is the flagship recommendation. It answers the emotional gap: “My journey mattered.”

### P1 — Warden Tactics Lab

Add fixed, unscored drills for the game’s encounter grammar:

- Patrol;
- Hunt;
- Intercept;
- Trail Twists.

Use the same game engine. Do not mutate Quest score, Journal history, or learner profile. Purpose: teach rules before pressure, improve first-run comprehension, and support classroom practice.

### P1 — Echo Lens explanation packs

Add reviewed post-answer explainers using visual primitives:

- number lines;
- comparisons;
- word structures;
- simple nature or science chains.

Explanations appear after an answer. They never become pre-answer hints, hidden assessments, or generated content.

### P1 — Quiet Expedition mode

Make nonvisual and low-distraction play a first-class route:

- complete state available as text and semantic labels;
- no information conveyed only by color, motion, or position;
- reduced-motion behavior verified;
- keyboard and screen-reader traversal through map, Warden, Journal, and recovery states;
- optional narration for reviewed question and outcome text.

This extends accessibility beyond compliance: it creates a calmer play mode for classrooms, shared devices, and focused practice.

### P2 — Transparent Trail Compass

Let players choose an explicit practice intention:

- **Review** — revisit known concepts;
- **Explore** — try a new region or deck;
- **Challenge** — opt into harder reviewed content.

The player chooses. The system does not secretly infer ability or change difficulty. Any numeric tuning remains a playtest placeholder until validated.

### P2 — Classroom Expedition Debrief

After a Class Expedition:

- teachers see aggregate completion and objective progress;
- students see private reflection prompts;
- teachers receive reviewed next-step activity cards;
- no names, ranking, answer transcripts, or diagnosis are exposed.

Add a privacy-thresholded Class Constellation view only if it reuses the Daily aggregate model and passes a separate privacy review.

### P2 — Echo Postcards

Add seed-only invitations for safe social discovery:

- Quest Level;
- region;
- deterministic ruleset.

Exclude identity, score, route, raw actions, public child profiles, and ghost replay. Recipient plays a normal run.

### P3 — Quest II: Living Regions

Expand content only after P0 and the first P1 features are stable:

- five new region arcs;
- four new Labyrinths per region;
- new reviewed Warden question sets;
- deliberate difficulty escalation;
- Quest-wide uniqueness checks;
- authored storylets tied to gameplay;
- grey-box pacing before visual polish;
- desktop, mobile, keyboard, and content-coverage acceptance.

No new engine. No free-form AI content. No paid map or inventory layer.

## Dependency order

```text
P0.1 test trust
  -> P0.2 offline vertical slice
  -> P0.3 release proof
  -> Echo Fossil Atlas
       -> Warden Tactics Lab
       -> Echo Lens explanation packs
       -> Quiet Expedition mode
            -> Trail Compass
            -> Classroom Debrief
            -> Echo Postcards
                 -> Quest II
```

## Definition of done for every future feature

- Player problem and intended feeling are written first.
- Success measure is defined before implementation; targets are set after baseline data or playtest.
- Gameplay invariants have tests.
- Reviewed content coverage is complete.
- Privacy, export, deletion, and account isolation are covered.
- Loading, empty, error, recovery, keyboard, mobile, and reduced-motion states exist.
- Bundle and Vercel function budgets remain within limits.
- Local lint, typecheck, test, build, bundle, browser validation, local review, and CodeRabbit review pass.

## What not to build next

Do not add feature volume to conceal unfinished wiring. Specifically defer:

- free-form AI story or question generation;
- public route sharing or Daily ghosts;
- hidden learner profiles;
- answer-history analytics;
- paid power or streak pressure;
- real-time multiplayer;
- a second combat or replay engine;
- broad cloud synchronization during an active Run.

Finish the promised player path first. Then make that path memorable.
