# Adventure game logic plan

Date: 2026-11-25
Status: Now tier in progress. Later items are GitHub issues.

## Inputs

- Audit: [docs/audits/2026-11-25-game-logic-audit.md](../audits/2026-11-25-game-logic-audit.md). The audit keeps 54 findings, A-01 to A-54.
- Research: [docs/research/2026-11-25-adventure-game-properties.md](../research/2026-11-25-adventure-game-properties.md). Each citation number below is the source number in that note.
- Constraint: [docs/plans/rebuild-v3.md](rebuild-v3.md) waits for approval. No item in this plan changes an area that §5.2 removes.

## Rules for this plan

1. A Now item changes no output of `createRun` or `applyAction` for any ruleset revision. Run Replay, Run Records, and offline receipts therefore stay valid with no revision bump.
2. `windways-v1` became `windways-v2` in this run (ADR 0053). A revision bumps at most once per run, so a Windways rule change waits for a later run.
3. `classic-v1` does not change. A fix that changes Warden steps or generation for every ruleset needs its own ADR and a later run.
4. A finding inside a §5.2 area waits for the rebuild-v3 verdict (tier Held).
5. Now holds at most 3 items. Each Now item is one PR.

Proof for rule 1: `src/game/trail-compass.js` is not imported by `server/`, `shared/`, or `src/game/run-replay*.js`.

## Now

### N1: Trail Compass exits tell the truth

- Property: telegraphed threats and readable failure. A clear cause lets the player improve [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-), and the team cut what it could not show clearly [11](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-).
- Findings:
  - A-01 (high): `describeExit` passes the adjacent wall tile as the shortcut end. An open Echo Bridge or Tide Door never shows as an exit.
  - A-35: `describeExit` matches a Windway by its source only. From the destination tile it announces a carry "to row R, column C", and that tile is the tile the Explorer is on.
- Change: `src/game/trail-compass.js` only. The exit test uses the same shortcut check as `resolveMove`, so the Compass and the engine agree. The engine carries the Explorer from the source in every direction (A-04, item L1). The Compass keeps that exit and says that the Windway carries the Explorer back to this tile.
- Revision impact: none (rule 1). ADR: none. ADR 0026 already promises a nonvisual equal of the board.
- §5 overlap: none. The Trail Compass is not in §5.2.
- Tier: Now.

### N2: Listen and Bell status tell the truth

- Property: telegraphed threats and readable failure [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-); danger in plain words makes a risky move an informed bet [12](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Monsters.c).
- Findings:
  - A-14: Listen keeps the first 6 targets, and Echoes come first. Six Echoes, or five Echoes and the Gate, remove every Warden from the list.
  - A-32: "Signal Bells wait elsewhere" shows when every Bell is spent.
  - A-33: Ring Bell with no Bell beside the Explorer repeats the last event in the live region.
  - A-45: the comment on `describeCompassAction` says "revealed state only", but `wardenModeNote` reads every Warden.
- Change: `src/game/trail-compass.js` and the Compass branch of the `transition` call in `src/main.js`. Listen orders Wardens first by distance, then the Gate, then Echoes, before the cap. The Bell sentence reports spent Bells. A no-op Ring Bell announces "No Signal Bell is beside you." The comment states the real scope.
- Revision impact: none (rule 1). ADR: none.
- §5 overlap: none.
- Tier: Now.

## Later

Each Later item is one GitHub issue. "All revisions" means a bump of every ruleset revision, `classic-v1` included, so the item needs an ADR that replaces rule 3.

| Item | Findings | Property and citation | Revision impact and ADR | §5 overlap | Label |
| --- | --- | --- | --- | --- | --- |
| [L1](https://github.com/tomnguyen103/Maze-v2/issues/284) Windway move rule | A-04, A-38, A-51, A-46 | Self-attributed failure [20](https://jesperjuul.net/text/fearoffailing/) | `windways-v3`; new ADR amends ADR 0053 | none | needs-triage |
| [L2](https://github.com/tomnguyen103/Maze-v2/issues/285) Warden pursuit | A-06, A-02, A-54, A-48, A-49 | Telegraphed threats [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-); anti-stall pressure [6](https://gamedeveloper.com/business/-i-spelunky-i-it-s-all-right-to-be-mean) | All revisions; new ADR | §5.2 changes Warden contact | needs-triage |
| [L3](https://github.com/tomnguyen103/Maze-v2/issues/286) Tide Door phase | A-03, A-23 | Four-step mechanic arc [15](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design) | `tide-doors-v2`; new ADR | none | needs-triage |
| [L4](https://github.com/tomnguyen103/Maze-v2/issues/287) Fog and map memory | A-05, A-24, A-25 | Walls block sight, and the map fills in [2](https://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees) | All revisions (the Bell Lure reads `revealed`); new ADR | none | needs-triage |
| [L5](https://github.com/tomnguyen103/Maze-v2/issues/288) Echo placement and route reward | A-09, A-10, A-47, A-50 | Route choice adds risk and reward [7](https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-); full coverage has diminishing returns [5](https://arxiv.org/html/1711.03087) | All revisions; new ADR | §5.5 Atlas table | needs-triage |
| [L6](https://github.com/tomnguyen103/Maze-v2/issues/289) Loop density | A-13 | Route choice [7](https://www.gamedeveloper.com/disciplines/road-to-the-igf-mega-crit-games-i-slay-the-spire-i-) | All revisions; amends design.md I3 | §5.1 keeps `floor(size/4)` loops | needs-triage |
| [L7](https://github.com/tomnguyen103/Maze-v2/issues/290) Twist count scales with size | A-30 | Skill atoms and burnout [14](https://www.gamedeveloper.com/design/the-chemistry-of-game-design) | Each Twist revision; new ADR | §5.5 Atlas table | needs-triage |
| [L8](https://github.com/tomnguyen103/Maze-v2/issues/291) Bell Lure direction | A-21, A-42 | Telegraphed threats [10](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-) | `warden-bells-v2` for A-21; none for A-42 | none | needs-triage |
| [L9](https://github.com/tomnguyen103/Maze-v2/issues/292) Trail Compass parity | A-15, A-17, A-18, A-19, A-22, A-36 | Clarity over novelty [11](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-); curiosity from visible gaps [1](https://dl.digra.org/index.php/dl/article/view/793) | None; amends ADR 0026 | none | needs-triage |
| [L10](https://github.com/tomnguyen103/Maze-v2/issues/293) Labyrinth config in the revision | A-31 | Pinned build for deterministic replay [28](https://gafferongames.com/post/floating_point_determinism/) | New config revision field; new ADR | §5.5 Atlas table | needs-triage |
| [L11](https://github.com/tomnguyen103/Maze-v2/issues/294) Receipt revision from the Run grant | A-52 | Pinned build [28](https://gafferongames.com/post/floating_point_determinism/) | None; grant schema change; amends ADR 0053 | none | needs-triage |
| [L12](https://github.com/tomnguyen103/Maze-v2/issues/295) Warden spawn beyond the Intercept radius | A-41 | Self-attributed failure [20](https://jesperjuul.net/text/fearoffailing/) | All revisions; new ADR | §5.7 item 2 | needs-triage |
| [L13](https://github.com/tomnguyen103/Maze-v2/issues/296) Pulse input guard and Pause board | A-29, A-40 | Removed choices with an obvious answer [17](https://gamedeveloper.com/game-platforms/road-to-the-igf-the-quick-burst-roguelike-fun-of-i-desktop-dungeons-i-) | None | none | ready-for-agent |
| [L14](https://github.com/tomnguyen103/Maze-v2/issues/297) Seed normalization | A-53 | Same seed rebuilds the same content [21](http://pcgbook.com/chapter01.pdf) | All revisions for affected seeds; new ADR | §5.3 seed format | needs-triage |

## Held by rebuild-v3 §5.2

These findings sit in an area that §5.2 removes. Issue [#298](https://github.com/tomnguyen103/Maze-v2/issues/298) tracks them until the rebuild-v3 verdict. If rebuild-v3 is rejected, each finding becomes a Later item.

| Finding | §5.2 area |
| --- | --- |
| A-07 paid skip dominated by a guess | Warden Challenge |
| A-08 Gate Warden milestones remove board Wardens | Warden Challenge, Quest structure |
| A-11 public Daily seed | Verified Daily replay |
| A-12 difficulty step function | Quest structure |
| A-16 Gate text says "sealed" while Echoes lock it | Warden Challenge (Gate Warden) |
| A-20 Daily Question memory | Warden Challenge |
| A-26 "Path clear" with a Gate Warden ahead | Warden Challenge (Gate Warden) |
| A-27 Echo event lost to the Challenge event | Warden Challenge |
| A-28 Pulse count from the Quest Level | Quest structure |
| A-34 First Light score text | First Light |
| A-37 stale Lured mode during a Challenge | Warden Challenge |
| A-39 duplicate `provide-question` | Warden Challenge |
| A-43 Challenge text omits the Vitality cost | Warden Challenge |
| A-44 no Vitality recovery | Warden Challenge |
