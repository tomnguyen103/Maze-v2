# Game logic audit

Date: 2026-11-25

## Scope

The audit covers these files and rules:

- `src/game/game-session.js`
- `src/game/trail-compass.js`
- `src/game/run-ruleset.js`
- The Warden, Pulse, Fog, Vitality, Echo and Gate rules, and the Trail Twist code that these rules touch.

Some findings point to callers outside the three files, such as `src/main.js`, `src/questions/quest-levels.js`, `src/game/run-replay.js`, `src/game/daily-labyrinth.js` and `server/offline-receipt-route.js`.

## Method

Five lanes read the code: move-engine, wardens-vitality, pulse-fog-echo, generation-ruleset and trail-compass. Each lane answers two questions:

1. "Are there bugs or vulnerabilities in this code?"
2. "Where does this rule make the game less interesting to play?"

A separate filter pass gives each finding a verdict and a final severity. The filter caps design findings at medium.

- Raw findings: 73. Kept findings: 54. Duplicates: 19. Refuted: 0.
- Kept per lane: move-engine 14, wardens-vitality 11, pulse-fog-echo 9, generation-ruleset 7, trail-compass 13.
- Kept per severity: high 1, medium 21, low 30, info 2.
- Kept per verdict: CONFIRMED 52, PLAUSIBLE 2.

The Severity column shows the filter severity. The Confidence column shows the lane confidence. Counts and percentages come from scratch simulations outside the repo. The table sorts by severity, then by confidence.

## Kept findings

| ID | Lane | Kind | Severity | Confidence | Verdict | File:line | Finding | Scenario | Research property |
|---|---|---|---|---|---|---|---|---|---|
| A-01 | trail-compass | bug | high | high | CONFIRMED | src/game/trail-compass.js:74 | `describeExit` passes the adjacent wall tile as the shortcut end. Shortcut endpoints are 2 tiles apart, so `matches()` is never true. Open Echo Bridges and Tide Doors never appear as exits. | An Explorer stands beside an open Tide Door on tide-doors-v1. Trail Compass says only "Exits: west open." A nonvisual Explorer cannot find the Trail Twist of that Region. | none |
| A-02 | move-engine | design | medium | high | CONFIRMED | src/game/game-session.js:1016 | Patrol legal moves include the tile the Warden is on. The Echo tile is reserved, so a Patrol Warden next to its target Echo stays in place. In 200 seeds, 548 of 570 Patrol Wardens do not move in the last 20 turns. | After about 10 moves, each Patrol Warden is a fixed guard post next to an Echo. No Warden roams, so a stall away from the Echoes has no pressure. | anti-stall pressure |
| A-03 | move-engine | design | medium | high | CONFIRMED | src/game/game-session.js:606 | Tile parity fixes the Tide Door phase. Each move flips the parity of the Explorer tile and the door state together, and no wait action exists. 29,396 checks show 0 violations. | A door that is sealed on arrival is sealed again after any detour. Only a Pulse gets the Explorer through. The timing Twist works as a static wall. | mastery curve |
| A-04 | move-engine | bug | medium | high | CONFIRMED | src/game/game-session.js:667 | The Windway lookup matches the source tile only and ignores the travel direction. An entry from the destination carries the Explorer back to the same tile. `moves` rises by 1 and the Wardens take a turn. | The Explorer moves from a Windway exit toward its source. The Explorer does not move, the event says "Windway carried you right.", and the Wardens move. The result is a free wait action. | none |
| A-05 | move-engine | design | medium | high | CONFIRMED | src/game/game-session.js:856 | `revealed` keeps every tile the Explorer has seen. The renderer and the Lure show each Warden on a revealed tile at its live position. | Late in a Run, the Explorer sees every Warden in the explored area. Fog hides only unexplored tiles, so the threats are easy to read. | exploration and fog |
| A-06 | wardens-vitality | bug | medium | high | CONFIRMED | src/game/game-session.js:1024 | Hunt and Intercept candidate moves exclude reserved tiles, but the target distances come from the full Labyrinth. When the only closer neighbor is an Echo or the Gate, the Warden steps away and then steps back. 49 of 60 simulated Wardens oscillate. | A Hunt Warden is at 8,3, an uncollected Echo is at 9,3, and the Explorer is at 10,3 in a corridor. The Warden moves 8,3 to 7,3 to 8,3 and never makes contact. | none |
| A-07 | wardens-vitality | design | medium | high | CONFIRMED | src/game/game-session.js:462 | A paid Question Skip and a wrong answer both cost 1 Vitality and give a fresh Question. A wrong answer also shows the explanation, and a guess can defeat the Warden. | The player has used the free skip and the Question is hard. A guess on 3 choices wins 1 time in 3 for the same cost. The paid skip is a dead option. | risk and reward |
| A-08 | wardens-vitality | design | medium | high | CONFIRMED | src/game/game-session.js:245 | The Gate Warden takes the last generated Warden off the board. Bright Start L4 and L8 have a wardenCount of 1, so no board Warden remains. At a count of 2 the odd-id Warden goes, so no Warden can enter Intercept (Trail Scout L4 and L8, Bright Start L12 and L16). | Bright Start L4 has no chase on the board. The difficulty curve drops at the milestone that must make the game harder. | mastery curve |
| A-09 | pulse-fog-echo | design | medium | high | CONFIRMED | src/game/game-session.js:955 | The Gate opens only when the Explorer has every Echo. The server rejects a Score Entry with fewer Echoes. Run Score is 500 + 50 × echoCount + 100 × wardensDefeated, so the Echo term is the same for every scoreable Run. | No Echo is optional, and no detour for an extra Echo exists. | risk and reward |
| A-10 | pulse-fog-echo | design | medium | high | CONFIRMED | src/game/game-session.js:226 | `pickEntities` shuffles the Echoes onto tiles past a minimum start distance. Placement does not consider the Gate or the branches. A best route on a known map reveals 85% of passages at size 15 and 86% at size 23. | On a Maze Master size-23 Labyrinth with 8 Echoes, the Explorer must clear most of the map. A full clear makes a short session tedious. | short-session pacing |
| A-11 | pulse-fog-echo | vulnerability | medium | high | CONFIRMED | src/game/daily-labyrinth.js:58 | The Daily seed is the public string `DAILY-${compactDate}`. `createRun`, `applyAction` and the Daily Questions are deterministic client code. Server replay checks legality only. | A player runs `createRun('DAILY-20261125', ...)` offline, searches for the best action list, and submits it. The Run passes replay and goes to the top of the Verified Daily board. | fairness |
| A-12 | generation-ruleset | design | medium | high | CONFIRMED | src/questions/quest-levels.js:65 | `getLabyrinthConfig` selects size, echoCount and wardenCount by band only. Bright Start bands 1 and 2 are identical. Vitality and Pulses stay the same for all 20 Labyrinths. | Labyrinths 1-4 of Trail Scout all have the same configuration. At Labyrinth 5, size, Echoes, Wardens and the Twist all change together. | mastery curve |
| A-13 | generation-ruleset | design | medium | high | CONFIRMED | src/game/game-session.js:1307 | `generateLabyrinth` opens only floor(size/4) loop walls after a perfect DFS, for every revision. The chokepoint share of the Gate route rises from 0.59 at size 11 to 0.69 at size 23. | A Hunt Warden stands in a corridor on the Gate route of a 23x23 board. Usually no other route exists, so the Explorer must take the Challenge or wait. | risk and reward |
| A-14 | trail-compass | bug | medium | high | CONFIRMED | src/game/trail-compass.js:308 | Listen adds the Echoes first, then the Gate, then the Wardens, and keeps the first 6. Six revealed Echoes, or five Echoes and the Gate, remove every Warden from the list. | On a Mastery Level, 6 Echoes are revealed and a Hunt Warden is 2 tiles east. Listen reports six Echoes only, and the Explorer walks into the Warden. | none |
| A-15 | trail-compass | bug | medium | high | CONFIRMED | src/game/trail-compass.js:309 | Listen starts up to 6 cues at the same instant, with no panner, no delay and no pitch change. ADR 0026 promises directional tones. | Three Echoes and one Warden give one blended chord. The chord has no count, no order and no direction. | none |
| A-16 | trail-compass | bug | medium | high | CONFIRMED | src/game/trail-compass.js:177 | The Gate text tests `sealed` before `open`. Gate Warden Runs start sealed, so the text says "sealed by the Gate Warden" while Echoes still lock the Gate. | 3 Echoes remain. The Explorer walks to the Gate for a Challenge and gets gate-locked. The text hides the real next step. | none |
| A-17 | trail-compass | design | medium | high | CONFIRMED | src/game/trail-compass.js:206 | The canvas draws every Echo Bridge, Tide Door and Signal Bell with no Fog check. The Compass gives only counts or a phase, and Listen has no kind for these fixtures. | A sighted Explorer plans a route across an open Echo Bridge. A Trail Compass Explorer knows that a Bridge opened, but not where. Daily scores under one ruleset then compare unequal play. | fairness |
| A-18 | trail-compass | design | medium | high | CONFIRMED | src/game/trail-compass.js:165 | Exits cover the 4 neighbors only, and the radius-2 reveal always includes them. Play never reaches the "unexplored" branch at line 76. The Compass gives no Fog frontier and no dead-end data. | At a 3-way junction the Explorer hears "north open; east open; west open". The Explorer cannot tell a dead end from Fog. | exploration and fog |
| A-19 | trail-compass | design | medium | high | CONFIRMED | src/game/trail-compass.js:236 | The Compass describes adjacent exits and revealed entities only. When a Pulse reveals passage tiles, only the Pulse count changes. | A nonvisual Explorer spends a Pulse at a junction and hears nothing about the passages. | risk and reward |
| A-20 | move-engine | design | medium | medium | CONFIRMED | src/game/game-session.js:562 | A correct answer adds +100 and +1 Pulse, and contact costs nothing by itself. Each Daily attempt gets the same Question order. ADR 0024 keeps the best attempt. | A player notes each Question on attempt 1. On attempt 2 the player hunts every Warden and answers from memory at zero risk. The Daily then ranks recall, not route skill. | risk and reward |
| A-21 | move-engine | design | medium | medium | CONFIRMED | src/game/game-session.js:855 | A Bell rings only from an adjacent tile. Lured Wardens step toward the Bell, which also brings them toward the Explorer. Hidden Wardens skip their step. In 74 rings, Lured Wardens come closer 6 times and move away 0 times. | The player rings a Bell to clear a route, and the threat comes closer. The ring also works as a safe pause for every hidden Warden. | risk and reward |
| A-22 | trail-compass | design | medium | medium | CONFIRMED | src/game/trail-compass.js:248 | `describeCompassAction` gives the event, the place, the exits and one global Warden mode. It gives no Warden position or distance. | A Hunt Warden comes from 3 tiles to 1 tile away. The status repeats "Warden mode: Hunt active." with no distance. | readable threats |
| A-23 | move-engine | design | low | high | CONFIRMED | src/game/game-session.js:695 | A bump into the sealed Gate adds 1 Move. Neither the Explorer nor the Wardens move. `resolveTidePhase` then flips every Tide Door. This happens at most once per Run. | On tide-doors-v1 the player uses the Gate bump to shift the Tide phase with no Warden step. | anti-stall pressure |
| A-24 | move-engine | design | low | high | CONFIRMED | src/game/game-session.js:803 | `resolvePulse` sets `pulseVisible` for 2 actions and never adds those tiles to `revealed`. | The player spends a scarce Pulse. Two actions later the area is dark again. The Pulse gives a short look, not scouting. | readable map memory |
| A-25 | move-engine | design | low | high | CONFIRMED | src/game/game-session.js:919 | `revealKeys` makes a radius-2 Manhattan diamond with no wall test and no line-of-sight test. | The Explorer sees passages and Wardens behind solid walls. Dead ends show before the player chooses a branch at a junction. | exploration and fog |
| A-26 | wardens-vitality | design | low | high | CONFIRMED | src/main.js:5237 | `summarizeWardenMode` returns "cleared" when `run.wardens` is empty, and the Gate Warden is not in `run.wardens`. The Trail Compass says "Path clear" in the same state. | On Bright Start L4 the Readout says "Path clear". The Gate Warden Challenge then surprises the player. | readable threats |
| A-27 | pulse-fog-echo | bug | low | high | CONFIRMED | src/game/game-session.js:778 | `collectEcho` sets the echo-collected event. The Warden step and the contact check that follow replace it with challenge-started. In 30 of 143 simulated pickups, the Echo message is lost. | The Explorer steps onto an Echo next to a Hunt Warden. The only event is "A Warden blocks the path." The remaining-Echo count, "Bridge opened", the Gate message and the audio cue are lost. State and score stay correct. | none |
| A-28 | pulse-fog-echo | design | low | high | CONFIRMED | src/questions/quest-levels.js:179 | The Pulse count comes from the Quest Level and is the same for all 20 Labyrinths. The radius is fixed at 4. A Pulse shows about 11-12 new passage tiles at both size 15 and size 23. | On a size-23 Labyrinth, two Pulses show less than 10% of the passages. | mastery curve |
| A-29 | pulse-fog-echo | design | low | high | CONFIRMED | src/main.js:4435 | The Pulse button is disabled only at 0 Pulses or outside active status. A second Pulse replaces `pulseVisible` and adds only one action of duration. Space and Q fire a Pulse with no confirmation. | A new Explorer presses Space twice and loses the last Pulse for almost no new data. | readable threats |
| A-30 | generation-ruleset | design | low | high | CONFIRMED | src/game/game-session.js:287 | `createWindways`, `createTideDoors` and `createSignalBells` each get a fixed count of 2. Only Echo Bridges scale. Placement ignores the Gate, the Echoes and the Warden routes. | Maze Master L17 (23x23) gets the same 2 Signal Bells as Bright Start L17 (15x15). Often the Explorer meets the Twist once or never. | mastery curve |
| A-31 | generation-ruleset | design | low | high | CONFIRMED | src/game/run-replay.js:56 | Client and server replay pass the current `getLabyrinthConfig` to `createRun`. The ruleset revision names only the Twist. No revision covers size, Echo count or Warden count. | A designer changes the Bright Start sizes. Every stored Run Replay, offline receipt and Echo Postcard for those Labyrinths rebuilds a different board. Replay then fails or verifies the wrong outcome. | replay value |
| A-32 | trail-compass | bug | low | high | CONFIRMED | src/game/trail-compass.js:223 | When no unspent Bell is adjacent, the text says "Signal Bells wait elsewhere". The text is the same when every Bell is spent. | The player has rung both Bells. The Explorer then searches for a lure that does not exist. | none |
| A-33 | trail-compass | bug | low | high | CONFIRMED | src/main.js:3881 | With the Compass on, `transition` always calls `onTransition`. When no Bell is adjacent, `resolveRingBell` returns the same Run, so the old `event.message` repeats. | The Explorer collects an Echo, then presses B away from any Bell. The live region repeats "Echo recovered. 2 remain." | none |
| A-34 | trail-compass | bug | low | high | CONFIRMED | src/game/trail-compass.js:241 | In First Light, `main.js` removes "You earned" from the visual event. `describeCompassAction` reads the raw `event.message`. | In First Light, each Echo pickup announces score text that the tutorial hides. | none |
| A-35 | trail-compass | bug | low | high | CONFIRMED | src/game/trail-compass.js:86 | `describeExit` matches a Windway by its source only. From the destination tile it announces a carry to the tile the Explorer is on. Line 240 also shortens the exit to a bare direction word. | The Explorer picks "east" and spends a Move. The Wardens advance, and the Explorer has not moved. | none |
| A-36 | trail-compass | design | low | high | CONFIRMED | src/game/trail-compass.js:13 | The Compass uses north, east, south and west. Engine events use up, right, down and left. Windway exits give an absolute row and column, and entities give relative offsets. | One status reads "Windway carried you left. At row 6, column 6. Open: east, west." | readable threats |
| A-37 | move-engine | bug | low | medium | CONFIRMED | src/game/game-session.js:895 | `moveLuredWardens` sets the mode to "lured". A Challenge entry returns before the Warden step, and Challenge actions do not change modes. ADR 0026 defines Lured as a one-action state. | The player rings a Bell, then steps into a Warden. The other Wardens show the Lured telegraph for the full Challenge. | none |
| A-38 | move-engine | bug | low | medium | CONFIRMED | src/game/game-session.js:716 | A Windway carry sets `lastDirection` to the input direction, not the carry direction. Intercept aims 2 tiles ahead along `lastDirection`. | The Explorer moves up onto a Windway that carries it right. Intercept Wardens aim above the Explorer, not to its right. | none |
| A-39 | move-engine | bug | low | medium | CONFIRMED | src/game/game-session.js:395 | `provide-question` checks only the challenge status. It does not require a null Question, and it resets `hintRevealed`. Server replay and `main.js` guard on null. | A late duplicate response replaces the Question on screen and hides a Hint that the player has opened. Replay and scores stay correct. | none |
| A-40 | move-engine | design | low | medium | CONFIRMED | src/game/game-session.js:366 | Pause stops the timer, but the canvas keeps the board visible under a PAUSED band. `elapsed_ms` is the fourth tie-break in Run Records. | A player pauses at each junction and studies the board for free. The impact is small because the game is turn-based. | short-session pacing |
| A-41 | wardens-vitality | design | low | medium | CONFIRMED | src/game/game-session.js:242 | The spawn minimum is max(5, floor(size × 0.6)), which gives 6 to 9 on sizes 11 to 15. `HUNT_DISTANCE` is 7 and `INTERCEPT_DISTANCE` is 10, so a mode can start on move 1. A hidden seeded random breaks ties. | On Trail Scout L1, the Readout says Intercept after one step, from a Warden in Fog. The first chase feels arbitrary. | readable threats |
| A-42 | wardens-vitality | design | low | medium | CONFIRMED | src/main.js:5239 | `summarizeWardenMode` and `wardenModeNote` rank lured above intercept and hunt. Hidden Wardens keep Hunt or Intercept during a ring. | The Explorer sees "Lured to Bell". Two actions later, a hidden Hunt Warden contacts the Explorer. | readable threats |
| A-43 | wardens-vitality | design | low | medium | CONFIRMED | src/main.js:3961 | The Challenge text states only the outcome of a correct answer. It does not give the Vitality cost of a wrong answer. | A young player with 2 Vitality answers wrong twice. The Labyrinth ends, and no warning comes before the second answer. | readable threats |
| A-44 | wardens-vitality | design | low | medium | CONFIRMED | src/game/game-session.js:504 | No code path raises Vitality. A Challenge ends only with a correct answer or a loss. | On Maze Master L17 with 6 board Wardens, one bad topic early decides the Labyrinth. The player cannot trade a Move, a Pulse or an Echo for a retreat. | risk and reward |
| A-45 | wardens-vitality | bug | low | medium | CONFIRMED | src/game/trail-compass.js:256 | The comment at lines 244-247 says "revealed state only". `wardenModeNote` reads every Warden, including Wardens in Fog. ADR 0001 allows this behavior, but the comment is wrong. | A maintainer trusts the comment and adds the Warden distance to the note. The note then leaks hidden Warden positions. | none |
| A-46 | wardens-vitality | design | low | medium | PLAUSIBLE | src/game/game-session.js:738 | A Windway, an Echo Bridge or a Tide Door can put the Explorer outside the previous view. The Warden step and the contact check run immediately. Scratch runs show 1 to 3 such contacts per 200 Runs. | On Windways L5, a Warden comes out of Fog onto the Explorer at arrival. The Explorer has no chance to read the threat. | readable threats |
| A-47 | pulse-fog-echo | design | low | medium | CONFIRMED | src/game/game-session.js:1416 | The Gate is the farthest passage tile. It is in a dead end in about 80% of seeds. 82% of dead-end tiles are empty. | An experienced player learns that side branches are empty and that the Gate is the deepest dead end. The choice of branch gives no reward. | exploration and fog |
| A-48 | pulse-fog-echo | design | low | medium | CONFIRMED | src/game/game-session.js:1011 | `resolvePulse` does not change `lastDirection`. Intercept aims ahead of an Explorer who uses a Pulse in place. | An Intercept Warden walks to a tile that the Explorer is not moving toward. A new player sees a Warden that seems to ignore the Explorer. | readable threats |
| A-49 | pulse-fog-echo | design | low | medium | CONFIRMED | src/game/game-session.js:974 | `moveWardens` always reserves the Gate tile, and the Explorer can stand on a locked Gate. No contact can occur on that tile. | The Explorer waits and uses a Pulse on the locked Gate while the Wardens gather, then leaves. The tile is a stall spot with no pressure. | fairness |
| A-50 | generation-ruleset | design | low | medium | CONFIRMED | src/game/game-session.js:1551 | `createEchoBridges` sets `echoIndex` from the order of a shuffled shortcut list. 23-34% of Bridges save 3 tiles or fewer. | The Explorer collects Echo 2 in the north-west, and its Bridge opens in an explored south-east pocket. The player often does not see or use the reward. | risk and reward |
| A-51 | move-engine | bug | low | low | CONFIRMED | src/game/game-session.js:667 | The reserved set holds only the Gate and the uncollected Echoes, so a Warden can stand on a Windway source. The contact check reads only the final tile. In 1324 constructed trials, 12 pass the Warden with no contact. | The Explorer steps onto a source that holds a Warden. The wind carries the Explorer past with no Challenge. The natural frequency is not proven. | none |
| A-52 | generation-ruleset | vulnerability | low | low | PLAUSIBLE | server/offline-receipt-route.js:112 | `readRulesetRevision` accepts any revision that `normalizeRunRuleset` accepts, including the legacy windways-v1. The lane did not trace the grant path. | A client asks for a receipt for a new Developing Labyrinth with "windways-v1". The Explorer plays a board that can soft-lock and scores on the v1 partition. | none |
| A-53 | generation-ruleset | bug | info | high | CONFIRMED | src/game/game-session.js:1252 | `normalizeSeed` makes letters uppercase, replaces other characters with "-", and keeps the first 24 characters. A seed of only non-ASCII characters becomes empty, and `createRun` throws. | Two long seeds that differ after character 24 give the same board. A seed of only non-ASCII characters gives an error. | none |
| A-54 | wardens-vitality | design | info | medium | CONFIRMED | src/game/game-session.js:1009 | Mode selection tests Intercept first for an odd id. Its range of 10 includes the Hunt range of 7. After the Explorer moves, an odd-id Warden never shows Hunt. | An odd-id Warden 2 tiles away shows Intercept. The player steps aside, but the Warden acts as a Hunt Warden. | readable threats |

## Refuted and duplicate findings

The filter refutes 0 findings and merges 19 findings as duplicates. The list gives the raw index, the lane, the kept finding and the filter note.

- #15 (wardens-vitality): duplicate of A-21. This is the same issue: the Bell pulls Wardens toward the Explorer.
- #17 (wardens-vitality): duplicate of A-20. This is the same zero-risk Warden farm. The timer stop is a minor extra.
- #21 (wardens-vitality): duplicate of A-21. A-21 includes the freeze of hidden Wardens. The freeze matches the ADR 0026 text.
- #25 (wardens-vitality): duplicate of A-39. This is the same missing null guard on `provide-question`.
- #32 (pulse-fog-echo): duplicate of A-24. This is the same short Pulse reveal that `revealed` does not keep. The missing countdown is a small extra.
- #35 (pulse-fog-echo): duplicate of A-20. This is the same score that rewards only Warden defeats. The Pulse tie-break cost is a minor extra.
- #36 (pulse-fog-echo): duplicate of A-25. This is the same reveal diamond with no wall test.
- #37 (pulse-fog-echo): duplicate of A-05. This is the same issue: live Wardens show on remembered tiles.
- #38 (pulse-fog-echo): duplicate of A-02. This is the same Patrol Warden that parks next to an Echo.
- #43 (generation-ruleset): duplicate of A-03. This is the same Tide Door parity rule.
- #44 (generation-ruleset): duplicate of A-03. The doors that are always sealed on arrival are a subset of A-03. `selectShortcutEdges` accepts pillar walls.
- #45 (generation-ruleset): duplicate of A-08. This is the same Gate Warden milestone, here with the correct wardenCounts.
- #49 (generation-ruleset): duplicate of A-04. This is the same Windway back-entry with no movement.
- #50 (generation-ruleset): duplicate of A-51. This is the same Windway carry past a Warden on the source.
- #51 (generation-ruleset): duplicate of A-21. This is the same Bell Lure toward the Explorer.
- #53 (generation-ruleset): duplicate of A-10. The root cause is the same: `pickEntities` ignores the Gate route.
- #55 (generation-ruleset): duplicate of A-23. This is the same Move and Tide toggle at the Gate bump.
- #66 (trail-compass): duplicate of A-04. This is the same free wait at a Windway back-entry.
- #71 (trail-compass): duplicate of A-45. This is the same wrong comment about Fog-hidden Wardens in `wardenModeNote`.

## Checked without findings

### move-engine

- A wall bump spends no Move and changes no state.
- The contact check runs before the Gate win check.
- The Explorer and a Warden cannot swap tiles.
- Two Wardens cannot share a tile.
- The paused and challenge states block move, pulse and ring-bell.
- `tick` has no effect outside the active state, and it sets a negative `deltaMs` to 0.
- Vitality 0 ends the Run as lost.
- The first Question Skip is free once per Run.
- Shortcuts and Windways are never on protected tiles, and no route bypasses the Gate.
- Echo Hush skips the Warden step in the correct order after the Echo pickup.
- A Pulse with 0 Pulses does nothing, and replay rejects it.
- ring-bell does nothing outside warden-bells-v1.
- The Daily ranking does not use the client elapsed time.
- The Warden tie-break uses the seeded random source, so replay is exact.
- A Gate Warden defeat unseals the Gate, and the next move wins (+500).

### wardens-vitality

- Warden contact: the same-tile check and the move order in `resolveMove` agree.
- The Gate Warden Challenge counts the Move, keeps the Wardens and the Explorer in place, and unseals the Gate on a correct answer.
- Signal Bell adjacency never crosses a wall, because Bells sit on passage tiles at distance 1.
- The Bell Lure tie-break is deterministic.
- Server replay and Active Run Recovery send `provide-question` only when the Question is null.
- The skip warning shows at the last point of Vitality, before a paid skip ends the Labyrinth.
- The free Question Skip resets for each Labyrinth.
- A Hunt Warden follows the Explorer through a Windway and makes contact.
- A Warden defeat removes only the Warden with the Challenge `wardenId`.
- The Run timer stops during a Warden Challenge.

### pulse-fog-echo

- A Pulse with 0 charges returns pulse-empty and spends no Move, and `actionAdvancedRun` treats it as no action.
- A blocked Move does not advance `moves` and does not end Pulse vision.
- The `pulseExpiresAt` expiry is the same for move, ring-bell and the Gate Warden Challenge.
- `collectEcho` cannot count an Echo twice: the collected flag guards it, and the +50 score applies once.
- The Gate opens only on the last Echo. An echoCount of 0 starts with the Gate open, and a Gate Warden keeps it sealed.
- Windways, Echo Bridges and Tide Doors never use an Echo tile or the Gate tile, because `pickEntities` reserves those tiles first.
- Wardens cannot stand on an uncollected Echo or the Gate (ADR 0001).
- The server `computeRunScore` uses the same values as the engine (100, 50 and 500), and `echoesCollected` must equal the config echoCount.
- Trail Compass Listen reads the same `revealed` and `pulseVisible` set as the renderer, so no entity in Fog leaks.
- Active Run Recovery keeps the Pulse fields in a checkpoint that replay rebuilds. The server does not trust the raw checkpoint.

### generation-ruleset

- Determinism: two `createRun` calls give equal results for 50 seeds on all 7 revisions. Generation uses no clock, no `Math.random` and no locale collation.
- Seed variety: 2000 seeds give 2000 different 11x11 Labyrinths.
- Entity counts: in 300 seeds, no board for any Quest Level or Labyrinth 1-20 has fewer Echoes or Wardens than configured.
- Initial Warden pressure: at most 9% of spawns are inside the Hunt range of 7. For odd ids, 10% of spawns are inside the Intercept range of 10 at size 13, and 2% at size 15 or more.
- Gate placement: the farthest-tile rule puts the Gate in all four quadrants, and the route length grows with size.
- Objective Reachability: `tests/no-soft-lock.test.js` and `tests/twist-generation-golden.test.js` pass on the working tree (19 tests). Windway v2 placement calls `everyReachableTileReachesObjectives`.
- `run-ruleset.js`: the Region-to-revision map, the `normalizeRunRuleset` check of the Region against the Labyrinth Number, and the frozen ruleset objects are correct.
- `quest-levels.js`: the `getDifficultyBand` range check, the Gate Warden milestones at 4, 8, 12, 16 and 20, and the `normalizeConfig` limits are correct.
- The Echo Bridge count follows `echoes.length`, and `collectEcho` opens the Bridge with the matching `echoIndex`.

### trail-compass

- Describe and Listen show only revealed or pulse-visible Echoes, Gate and Wardens, like the renderer.
- The Windway pair reveal matches `canvas-renderer.js` line 164.
- The Compass keeps the choice of route: it gives no pathfinding, no direction to hidden targets, and straight-line offsets only.
- The controller sends no Run action and does not change the Run, and a test covers this.
- Neighbors out of bounds return null.
- The Signal Bell "beside you" check uses the same Manhattan-1 rule as `resolveRingBell`.
- The Tide Door phase sentence matches the shared phase in `resolveTidePhase`.
- The count of open Echo Bridges matches the Bridge opening in `collectEcho`.
- `syncTrailCompass` in `main.js` loads the Compass lazily and handles a toggle-off during the import.
- The Echo Hush sentence shows only on the echo-hush-v1 revision.
