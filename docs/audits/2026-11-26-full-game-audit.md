# Full game audit

Date: 2026-11-26

## Scope

The audit covers the whole Echo Maze game at commit `6079129` on `main`. It has four lanes:

- Front end: the play shell and input, the board renderer, the dialogs, the landing page, the Echo Atlas, the audio, and the Trail Compass.
- Back end: the server validation of game state, the Run Replay verifier, Run Access, and the score routes.
- Game restrictions: each rule that a Labyrinth or a Run must obey, with the code that enforces it.
- Harness: the unit tests, the e2e specs, and the gate scripts that enforce the Game restrictions.

The audit also gives the current status of the 54 findings of `docs/audits/2026-11-25-game-logic-audit.md`.

The audit changes no tracked file. It reports findings and proposes no fix.

## Method

Eight lane readers read the code: shell-input, renderer, dialogs-landing-atlas-audio, compass-parity, server-validation, game-restrictions, harness, and a-series-status.

Each reader answers one question: "Are there bugs or vulnerabilities in this code?" Each reader reports every finding with a confidence and a severity.

One browser lane serves the production build and crops each game element at 375, 1280, and 1920 px. It compares each crop with `design.md`.

One mutation run breaks each enforcing line in a scratch copy. It records which tests go red for each break.

A separate filter pass then reads each cited line on `main`. It gives each row one verdict: Kept, Refuted, or Duplicate. It also corrects severity, confidence, and line numbers.

The Kept table merges rows of two readers that describe one defect. A merged row takes the higher severity and cites both locations.

Test-run condition:

- Node on PATH is v26.13.1. The file `.node-version` states 22.23.1.
- On Node 26 a happy-dom test fails with an undefined `localStorage`. The same test passes with `NODE_OPTIONS=--no-webstorage`.
- The filter pass reproduces 1 of the 21 failures of the first full Vitest run. It does not rerun the other 20.
- No pass runs the e2e suite. Each e2e claim comes from a code read.
- The mutation run and the fuzz run use copies of the code. A "no" in the red column means that the break makes no named test fail.

Table conventions:

- The Lane cell names the lane and, in brackets, the reader row in `.scratch/premium-rebuild/audit/verified/`. A reader ID such as P-01, S-01, GR-01, or H-01 belongs to that reader.
- An R-ID in this document always names a Game restriction.
- The Research property cell names a property of `docs/research/2026-11-26-premium-web-game.md` by question number and short name. This document assigns it by judgment.
- The "New defects" row of the a-series-status reader has no filter verdict. Row B-149 cites it.

## Kept findings

The table holds 151 rows from 155 Kept reader rows. No finding has severity critical.

| ID | Lane | Kind | Severity | Confidence | Verdict | File:line | Finding | Scenario | Research property |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-01 | Front end (compass P-01; shell row 5) | bug | high | high | Kept | src/main.js:665-671, src/main.js:5436-5441, src/main.js:3846-3850, src/game/trail-compass.js:309-312 | A click on Describe Trail or Listen leaves focus on the button. The keydown handler returns for every key while a button, link or input holds focus. Only `ringBell` returns focus to the canvas. | A keyboard Explorer presses Enter on Describe Trail, then presses the Up arrow. Nothing moves until the Explorer tabs back to the canvas. A click on Pause, Pulse or a direction button has the same effect. | Q1 input latency |
| B-02 | Front end (renderer row 1) | bug | high | high | Kept | `src/game/run-replay.css:51-56`, `src/game/run-replay.css:169-171`, `src/game/canvas-renderer.js:149-150`, `src/game/canvas-renderer.js:162` | The Run Replay canvas box is not square on most desktop viewports. The renderer sizes each tile from the canvas width only. | An Explorer opens Run Replay at 1280x720 on a size 23 Labyrinth. The canvas shows 14 full rows of 23. | Q1 sharp canvas |
| B-03 | Front end (shell row 1) | bug | high | medium | Kept | src/main.js:3112 (also 3857, 3211-3218, 433-445) | `authorizeRunLocator` saves the new locator with `pending: true` before the Run Access check. No path restores the earlier locator after a failure. | An Explorer in an active Run picks a new Quest Level. The check fails or the Explorer declines the last-free-Run prompt. Pause stops working. | none |
| B-04 | Back end (S-01) | vulnerability | high | high | Kept | `server/player-route.js:252-256`; `server/player-validation.js:230-309` | The Global Scoreboard accepts a Score Entry that no Run produced. The server computes the Run Score from client counts only. | A signed-in Explorer posts Maze Master Labyrinth 20 with 6 Wardens, 8 Echoes, 1 move and 0 ms. The entry gets score 1500. | Q3 leaderboard integrity |
| B-05 | Game restrictions (GR-04) | test gap | high | high | Kept | `tests/trail-compass.test.js:37`; `src/game/trail-compass.js:182`, `:198` | The Fog test of the Trail Compass cannot fail for an Echo or a Warden. | A change removes the `revealed` filter. The Trail Compass reads the direction and distance of each hidden Warden and Echo. | Q4 line-of-sight Fog |
| B-06 | Harness (H-01) | bug | high | high | Kept | `package.json:35`, `.node-version:1`, `scripts/run-vitest-gate.mjs`, `tests/player-controller.test.js:120`, `tests/tactics-lab-view.test.js:95`, `tests/admin-controller.test.js:592` | No script enforces the Node version. On Node 26 the test gate fails happy-dom tests on a good build. | PATH has Node v26.13.1 and `.node-version` says 22.23.1. Three happy-dom files report an undefined `localStorage`. The pre-push hook blocks a correct push. | none |
| B-07 | Harness (H-02) | test gap | high | high | Kept | `tests/run-action-log-v2.test.js:223-231`, `tests/helpers/daily-replay-fixture.js:5`, `tests/offline-submission.test.js:97`, `:118`, `:538`, `server/run-replay.js:199` | No test gives a recorded Run under a Trail Twist revision to the replay verifier. The only round trip uses classic rules. | A Trail Twist change makes the engine and `verifyOfflineRunReplay` disagree. Every unit test passes. The server rejects honest offline Runs or accepts a forged Run. | Q3 golden logs |
| B-08 | Harness (H-03) | test gap | high | high | Kept | `package.json:14`, `package.json:32`, `scripts/vitest-test-count.json:4`, `scripts/run-database-lane.mjs:15-17`, `tests/classroom-rls.integration.test.js:29` | The 33 pinned skipped tests are the database and audit-sink integration tests. No mandatory gate runs them. | A migration breaks forced RLS on a Classroom table. `npm run check` and the pre-push hook pass, because all 33 tests skip. | none |
| B-09 | Front end (browser crops row 1) | layout | medium | high | Kept | src/daylight.css:371; src/daylight.css:498; src/daylight.css:362-364 | At 1280x800 the board frame is 448 px and the canvas is 412 px. The play column is 800 px wide. | Open a size 13 Labyrinth at 1280x800. | none |
| B-10 | Front end (browser crops row 3) | legibility | medium | high | Kept | src/game/canvas-renderer.js:162; src/daylight.css:1657-1668; src/daylight.css:498 | At 375 px a size 15 tile is about 22.1 px, under the 24 px floor of rebuild-v3 §6.3. | Open a size 15 or larger Labyrinth on a 375 px phone. | Q1 portrait layout |
| B-11 | Front end (browser crops row 4) | legibility | medium | medium | Kept | src/game/game-session.js:335; src/game/game-session.js:921; src/game/canvas-renderer.js:176-177 | After the eight key presses, Fog covers about 83% of the board. The board shows no Echo, no Gate, and no Warden. | Start the ATLAS-CHECK Run and press the eight keys of the crop script. | Q4 line-of-sight Fog |
| B-12 | Front end (browser crops row 6) | parity | medium | high | Kept | index.html:349-360; src/main.js:4549-4552; src/game/canvas-renderer.js:865-935 | The legend lists one Warden mark. It lists no Warden mode mark and no Pulse tone. | Read the legend on a Run with Hunt or Intercept Wardens. | Q4 Warden telegraph |
| B-13 | Front end (compass P-04) | parity gap | medium | high | Kept | src/game/trail-compass.js:184-186, src/game/trail-compass.js:217-221 | The Compass never says an Echo pair number. The board draws the number on each Echo and on its Echo Bridge. | A sighted Explorer sees Bridge 3 and collects Echo 3 first. A Compass Explorer hears only "An Echo shimmers" and a Bridge count. | Q1 feedback |
| B-14 | Front end (compass P-05) | parity gap | medium | high | Kept | src/game/trail-compass.js:69-89 | The Compass names a Windway only as an exit of the current tile. The board draws each Windway that has a revealed source. | A revealed Windway source is 2 tiles east. A sighted Explorer plans around it. Describe says nothing about it. | Q1 feedback |
| B-15 | Front end (dialogs row 1) | bug | medium | medium | Kept | src/game/storage.js:45, 99, 131, 179, 205; src/game/quest-progress.js:182, 203; src/main.js:414, 557; src/app.js:107-120 | The storage functions read `globalThis.localStorage` as a default parameter, outside their `try` block. A throwing getter stops the `/play` boot. | The browser blocks site data. The getter throws `SecurityError`. `main.js` rejects at top level, and `app.js` shows a load error with a false progress claim. | Q1 session shape |
| B-16 | Front end (dialogs row 2) | bug | medium | high | Kept | src/game/storage.js:6, 351-379; src/main.js:1017-1027 | One list of 5 Run Records serves every Quest, Quest Level, and Labyrinth. Slower Runs of later Labyrinths never enter the list. | The Explorer escapes Labyrinths 1 to 8, each slower than the last. The Echo Atlas has no Watch Trail for Labyrinths 6 to 8. | none |
| B-17 | Front end (dialogs row 3) | bug | medium | high | Kept | src/game/storage.js:386-398; index.html:1095-1098 | The rank puts every escape before every defeat. A defeat enters the Run Records only while fewer than 5 escapes exist. | The list holds 5 escapes. The Explorer loses Labyrinth 9 with 2 of 3 Echoes. The Run Records drop the defeat at once. | none |
| B-18 | Front end (dialogs row 4) | bug | medium | high | Kept | src/game/storage.js:188-192; src/main.js:4634-4654 | `saveRunRecord` catches a `setItem` failure and returns the new list. `finishRun` shows no storage notice. | Storage is full. The Explorer escapes. The dialogs show the new Run Record. After a reload, the Run Record is gone. | none |
| B-19 | Front end (dialogs row 5) | bug | medium | medium | Kept | src/game/quest-progress.js:209-213; src/main.js:4673 | `saveQuestProgress` swallows a `setItem` failure and returns the new Quest Progress. `finishRun` advances the Quest in memory only, with no notice. | Storage is full. A guest escapes Labyrinth 7. The result dialog names Labyrinth 8. After a reload, the Quest is at Labyrinth 7 again. | none |
| B-20 | Front end (dialogs row 6; shell row 3) | bug | medium | high | Kept | src/main.js:3268, 3469, 3485, 4827-4829, 4866, 4901, 4950 (also 816-823, 4523-4528) | The result dialog has no `cancel` listener and no `close` listener, so Escape closes it. No control opens it again. | An Explorer wins and presses Escape. "Continue Quest" is gone. The only visible start control is New Quest. A reload continues the Quest. | none |
| B-21 | Front end (dialogs row 7; shell row 7) | bug | medium | high | Kept | src/main.js:720-730, 3074-3104, 5044-5052 | `openLevelPicker` does not pause an active Quest Run. The `tick` loop adds elapsed time while the Quest Level dialog is open. Records, Atlas and Settings pause. | An Explorer opens New Quest at 01:10, reads for 60 seconds and presses Escape. The Run timer shows 02:10. | Q1 session shape |
| B-22 | Front end (renderer row 2) | bug | medium | high | Kept | `src/player/theme.js:153-182`, `src/player/theme.js:109`, `src/main.js:1154-1165`, `src/game/canvas-renderer.js:160`, `tokens.css:149-150` | No listener watches the operating system colour scheme. The board keeps the old palette when the Theme Choice is `system`. | The Theme Choice is `system`. The operating system changes to dark. The page turns to Night, and the board stays light. | none |
| B-23 | Front end (renderer row 3) | design flaw | medium | high | Kept | `src/game/canvas-renderer.js:398-399`, `src/game/canvas-renderer.js:556`, `src/game/canvas-renderer.js:773-776`, `src/game/canvas-renderer.js:788-792`, `src/game/canvas-renderer.js:845` | The minimum font sizes are in backing-store pixels. On a ratio 2 screen the Trail Twist labels draw at 3.5 CSS pixels. | A phone shows a 288 CSS pixel board at ratio 2 on a size 23 Labyrinth. RING draws at 3.5 CSS pixels. | Q1 sharp canvas |
| B-24 | Front end (renderer row 4) | test gap | medium | high | Kept | `tests/canvas-renderer.test.js:15-147`, `tests/canvas-renderer.test.js:1112`, `tests/e2e/layout-redesign.spec.js:424-455` | No renderer test uses a non-square canvas box, checks line state between marks, or changes the colour scheme after load. | A change repeats B-02 or B-81. The two renderer test files still pass. | Q1 sharp canvas |
| B-25 | Front end (shell row 2) | bug | medium | medium | Kept | src/main.js:794 (also 1599, 2984, 3050; server/run-access-store.js:122-246) | The level-card handler and the "Play This Seed" handler are async with no re-entry guard. Each activation creates a new `runId`. | A free Explorer double-clicks a Quest Level card. Two access requests carry two `runId` values, and the server counts two free Runs. | none |
| B-26 | Front end (shell row 4) | bug | medium | high | Kept | src/main.js:665-707 | The global `keydown` handler does not check `ctrlKey`, `metaKey` or `altKey`. It calls `preventDefault` and then acts. | Ctrl+P toggles pause and blocks Print. Ctrl+S or Alt+ArrowLeft moves the Explorer and blocks the browser command. Each move can let a Warden step. | none |
| B-27 | Front end (shell row 6) | bug | medium | medium | Kept | src/main.js:4313 (also 4267-4270, 4369-4373, 821-823, 4041-4046) | The Question request has no timeout, abort or retry control. The "No fresh question card" branch leaves the Challenge dialog open with no exit. | `/api/question` stalls. The Warden Challenge dialog shows "Preparing your question", blocks Escape, and disables Hint and Skip. Only a reload leaves. | Q4 Warden Challenge |
| B-28 | Back end (S-03) | bug | medium | high | Kept | `server/offline-submission.js:300`, `:325-327` | The handler rejects every submission that arrives after `playExpiresAt`. The 48-hour terminal grace never applies after day seven. | An Explorer finishes a Run offline on day 6 and comes online on day 7, inside the grace. The server answers `expired` with reason `play`. | none |
| B-29 | Back end (S-06) | performance | medium | medium | Kept | `server/offline-submission.js:343-362`, `:410`, `:459-467`; `db/migrations/0025_offline_run_continuity_forward.sql:303-306` | A rejected offline replay is terminal for its idempotency key only. The same Run with a new key runs the full replay again. | An Explorer submits one rejected log with a new key five times per minute. Each request costs one replay and one ledger row. | Q3 replay proof |
| B-30 | Back end (S-11) | vulnerability | medium | high | Kept | `server/offline-receipt-route.js:195-196`; `server/player-api.js:425-451` | The Offline Continuity Receipt route has no rate limit. The route also reads the body before it checks the session. | A signed-in client requests receipts in a loop for Run ids that it registers first. An anonymous client sends 8 KiB bodies. | none |
| B-31 | Back end (S-16) | design flaw | medium | medium | Kept | `server/player-route.js:252-256`; `server/run-access-route.js:413-419` | The casual score path does not check that a Run Grant exists. Run Access blocks only a client that asks first. | An Explorer with zero free Runs skips `/api/access/runs`, plays in a patched client, and posts to `/api/scores`. The server stores the Score Entry. | Q3 leaderboard integrity |
| B-32 | Game restrictions (GR-01) | test gap | medium | high | Kept | `server/run-replay.js:142`, `server/run-replay.js:244` | No test goes red when the server stops the reject of an impossible or no-op action. | A refactor drops the `actionAdvancedRun` check. The Harness stays green. A Run Action Log then holds padded actions. | Q3 replay proof |
| B-33 | Game restrictions (GR-03) | test gap | medium | high | Kept | `src/game/run-replay.js:68`, `:99`, `:113`, `:120`; `src/game/run-replay-contract.js:251` | Five guards of the device-local Run Replay have no red test. | A change removes the terminal-facts compare. A stored Run Replay with a false score then builds a timeline. | Q3 replay proof |
| B-34 | Game restrictions (GR-05) | test gap | medium | high | Kept | `src/game/canvas-renderer.js:234` | No test goes red when the canvas draws a Warden under Fog. | A change replaces the `revealed.has` condition with `true`. Each Warden shows through the Fog. | Q4 line-of-sight Fog |
| B-35 | Game restrictions (GR-06) | test gap | medium | high | Kept | `src/game/game-session.js:921` | No unit test pins the Fog reveal radius of 2. | A change sets the radius to 5. The Explorer sees farther. No unit test fails. | Q4 line-of-sight Fog |
| B-36 | Game restrictions (GR-07) | test gap | medium | high | Kept | `src/game/game-session.js:955` | No engine test asserts that the Gate stays closed after some, but not all, Echoes. | A change opens the Gate on the first Echo. One Replay fixture test fails with an unrelated message. | Q3 model-based tests |
| B-37 | Game restrictions (GR-18) | bug | medium | high | Kept | `src/game/game-session.js:1584-1650` `selectShortcutEdges`; `:293-299`; `src/game/tactics-lab.js:116` | An `echo-bridges-v1` Run with 0 Echoes gets an unbounded number of Echo Bridges. | The Tactics Lab Echo Bridges drill holds 14 sealed Bridges and 0 Echoes. No Bridge can open. | Q4 Twist count |
| B-38 | Game restrictions (GR-19) | test gap | medium | high | Kept | `src/game/game-session.js:579` | No test goes red when a terminal Run accepts a Move. | A change lets a won Run reach `resolveMove`. The Explorer moves after escape. The Harness stays green. | Q3 model-based tests |
| B-39 | Harness (H-04) | bug | medium | medium | Kept | `tests/game-session.test.js:314`, `tests/game-session.test.js:495`, `tests/audit-correctness.test.js:59`, `tests/audit-correctness.test.js:79`, `vite.config.mjs` | Four tests depend on wall-clock speed. They use the default 5 s timeout for 2,000-seed sweeps or cold route imports. | A loaded machine makes one of these tests exceed 5 s. The gate fails on a good build. | none |
| B-40 | Harness (H-05) | bug | medium | high | Kept | `scripts/check-bundle-budget.mjs:113-118` | The bundle gate takes the first file that matches a prefix. It does not detect a second chunk with the same prefix. | The build emits two `journal-continuity-*.js` and two `daily-constellation-view-*.js` chunks. The gate measures one of each and prints PASS. | Q2 bundle budget |
| B-41 | Harness (H-06) | design flaw | medium | high | Kept | `scripts/check-bundle-budget.mjs:8-106`, `vite.config.mjs:43` | The bundle gate has no total budget. It ignores every chunk that has no budget row. | A new 200 KB lazy chunk, or a module copied into four chunks, passes the gate. | Q2 bundle budget |
| B-42 | Harness (H-07) | design flaw | medium | medium | Kept | `.githooks/pre-push:1-23` | The pre-push hook tests the working tree. It does not read the pushed refs from stdin. | The working tree holds an uncommitted fix and the committed code is broken. The hook passes and the broken commit goes to the remote. | none |
| B-43 | Harness (H-08) | design flaw | medium | high | Kept | `.githooks/pre-push:1-23`, `package.json:32-33`, `playwright.config.mjs:3-14` | No automatic gate runs the e2e suite. GitHub Actions are disabled, and `check` stops at the bundle gate. | A change breaks Campfire Resume in the browser. Lint, typecheck, unit tests, build, and the bundle gate pass. The push succeeds. | none |
| B-44 | Harness (H-09) | test gap | medium | high | Kept | `.env.e2e:1`, `src/player/player-controller.js:696-702`, `package.json:17` | No browser test loads the production bundle. No test asserts that the production bundle lacks the e2e seam. | A build setting leaks `VITE_ENABLE_E2E_PLAYER_DEPENDENCIES=true` into production. The page accepts `globalThis.__echoMazePlayerDependencies` as its player dependencies. No gate reports it. | none |
| B-45 | Harness (H-12) | test gap | medium | high | Kept | `tests/e2e/daily.spec.js:282`, `tests/e2e/game.spec.js:7017`, `:7039` | No e2e test plays an offline Run. No spec calls `context.setOffline`. | Offline Run Continuity fails to record a Run when the network is down. The e2e suite covers only a seeded Run Record label. | none |
| B-46 | Front end (browser crops row 2) | layout | low | high | Kept | src/daylight.css:371; src/daylight.css:498; src/daylight.css:621-632 | At 1920x1080 the canvas is 688 px and the Action rail starts at y=989. The rail ends about 8 px above the fold. | Open the same Labyrinth at 1920x1080. | none |
| B-47 | Front end (browser crops row 5) | design drift | low | high | Kept | src/daylight.css:1132-1135; src/daylight.css:1097-1112; tokens.css:49 | The Map marks legend fills the Warden mark with red. The board draws the Warden in ink, as `design.md` requires. | Read the legend under the board. | none |
| B-48 | Front end (browser crops row 7) | legibility | low | medium | Kept | src/game/canvas-renderer.js:195-207; index.html:349-360 | A Pulse adds a blue tone over passages and hatched land with no key. The board then shows four tones. | Use a Pulse at Night. | Q1 feedback |
| B-49 | Front end (browser crops row 8) | layout | low | high | Kept | src/daylight.css:234-246; src/daylight.css:1496-1501 | At 375 px the nav row clips "Settings" to "Sett" with no scroll cue. "Sound off" is off screen. | Open the play screen at 375 px. | Q1 portrait layout |
| B-50 | Front end (browser crops row 9) | layout | low | high | Kept | src/daylight.css:1508-1512; src/daylight.css:1637-1640; src/main.js:4553; src/main.js:3900-3916; index.html:333-366 | At 375 px the document is 1416 px high. The field note and the adventure log repeat the event line under the Action rail. | Scroll the play screen at 375 px. | Q1 portrait layout |
| B-51 | Front end (compass P-02) | parity gap | low | high | Kept | src/game/trail-compass.js:54-62 | An open shortcut exit says "open through a shortcut" and names no destination. A Windway exit names its destination. | The Explorer hears "south open through a shortcut" and moves. The Move lands 2 tiles south, across the wall. | none |
| B-52 | Front end (compass P-13) | design flaw | low | low | Kept | index.html:375, src/main.js:4001, src/main.js:5123-5128 | `#live-region` is outside the Challenge dialog. `showModal()` makes the rest of the page inert, so a browser can drop that speech. | The Explorer answers wrong in a Challenge. The Compass status goes to a region outside the modal dialog. | Q1 feedback |
| B-53 | Front end (compass P-06) | design flaw | low | high | Kept | src/game/trail-compass.js:181-204 | Describe lists Echoes, then the Gate, then Wardens, each in Run order. Listen sorts Wardens first and nearest first. | Six Echoes and the Gate are revealed. The sentence for the nearest Warden comes after all of them. | none |
| B-54 | Front end (compass P-07) | bug | low | high | Kept | src/game/trail-compass.js:174 | The text says "1 Echoes remain." when one Echo is left. | One Echo is left. Describe says "Pulses 0, 1 Echoes remain." | none |
| B-55 | Front end (compass P-08) | parity gap | low | high | Kept | src/game/game-session.js:623-625, src/game/trail-compass.js:254 | When a Move starts a Challenge, the Tide Doors change phase, and the event text does not say it. | The Explorer hears "Tide Doors are now open", then moves into a Warden. The Doors are now sealed, and no status says so. | Q1 feedback |
| B-56 | Front end (compass P-09) | parity gap | low | medium | Kept | src/game/trail-compass.js:165-240 | Describe says no Run status. A paused Run gives the same form of text as an active Run. | The Run is paused. Describe gives the place, the exits and the entities, and it does not say "paused". | none |
| B-57 | Front end (compass P-10) | parity gap | low | high | Kept | src/game/trail-compass.js:172-175 | Describe omits the Run Score. The status repeats each gain and never the total. | The Explorer wants the total in the middle of a Run. The Compass cannot say it. | none |
| B-58 | Front end (compass P-14) | design flaw | low | high | Kept | src/game/trail-compass.js:254-262 | Each status adds the place, the exits and the Warden mode, also in a Challenge and after the Run ends. | A Move starts a Challenge. The status adds "At row 6, column 6. Open: north, east. Warden mode: Hunt active." | Q1 feedback |
| B-59 | Front end (compass P-11) | parity gap | low | high | Kept | src/game/trail-compass.js:169, src/game/trail-compass.js:88, src/game/canvas-renderer.js:355-362, index.html:209 | The Compass says "row 6, column 6". The Grid reference uses a column letter and a row number. | A sighted helper says "the Echo is at F6". The Compass Explorer has no letter to match. | none |
| B-60 | Front end (compass P-12) | parity gap | low | high | Kept | src/game/trail-compass.js:22-23, src/game/canvas-renderer.js:195-207, src/game/game-session.js:803-804, src/game/game-session.js:904-913 | The board tints Pulse-only tiles, and they expire after 2 actions. The Compass gives no mark for an entity on such a tile. | Describe names a Warden after a Pulse. Two Moves later Describe no longer names it, with no notice. | Q1 feedback |
| B-61 | Front end (compass P-15) | bug | low | medium | Kept | src/main.js:4553, src/main.js:3891-3893 | In First Light the event ribbon strips "You earned". The field note writes the raw event message. | A First Light Explorer collects an Echo. The ribbon hides the score text, and the field note shows "You earned 50 score." | Q1 onboarding |
| B-62 | Front end (compass P-16) | test gap | low | high | Kept | tests/trail-compass.test.js:233-249, tests/trail-compass.test.js:60-62, tests/trail-compass.test.js:93-101 | The exit sweep removes each Warden and opens each shortcut. No test checks the Gate Warden Gate text or the status detail. | A-16 and A-35 stay open while 11 of 11 tests in the file pass. | none |
| B-63 | Front end (dialogs row 8) | bug | low | high | Kept | src/main.js:3949, 5055-5077; src/game/game-session.js:818-830 | `transition` calls `playEventSound` after every action, outside the `eventChanged` block. A no-op action plays the cue of the earlier event again. | Sound is on. The Explorer collects an Echo, then presses Ring Bell with no Signal Bell near. The "echo" cue plays again. | Q1 blocked Move cue |
| B-64 | Front end (dialogs row 9) | bug | low | medium | Kept | src/game/audio.js:60-63 | `play` checks only `#enabled` and `#context`. No code resumes a context that the browser suspends later. | Sound is on. The browser suspends the audio context. The button says "Sound on", and no cue plays until the Explorer toggles sound twice. | Q1 audio control |
| B-65 | Front end (dialogs row 10) | design flaw | low | high | Kept | src/main.js:1682-1688; src/game/audio.js:17 | The game does not store the sound choice. Each page load starts with sound off. | The Explorer turns sound on and reloads the page. Sound is off again. | Q1 audio control |
| B-66 | Front end (dialogs row 11) | bug | low | high | Kept | src/game/audio.js:29-44 | Two fast `toggle` calls both pass the `resume()` wait and flip `#enabled` twice. | The Explorer double-clicks the sound button on first use. Sound ends off, and the button says "Sound off". | Q1 audio control |
| B-67 | Front end (dialogs row 12) | design flaw | low | high | Kept | src/game/audio.js:36-42, 127, 135-145 | Sound off stops the ambient tone but never suspends or closes the `AudioContext`. The ambient gain has no ramp. | The Explorer turns sound off. The context stays in the "running" state for the session. An abrupt ambient stop can click. | Q1 audio control |
| B-68 | Front end (dialogs row 13) | bug | low | low | Kept | src/game/audio.js:31; src/main.js:1683-1687 | `new AudioContext()` has no fallback and no error message. The click handler turns a throw into "Sound off". | A browser has no unprefixed constructor, or the constructor throws. The button stays on "Sound off" with no reason. | Q1 audio control |
| B-69 | Front end (dialogs row 14) | bug | low | high | Kept | src/game/quest-atlas-view.js:105-108; src/game/quest-atlas.js:187-189 | The milestone text has no singular form. | Quest Progress is one Labyrinth before a Gate Warden milestone. The Echo Atlas reads "in 1 Labyrinths". | none |
| B-70 | Front end (dialogs row 15) | bug | low | medium | Kept | src/game/quest-atlas.js:185, 251-253; src/game/fossil-runtime.js:97-105 | The Atlas header counts every Echo Fossil in the collection. A landmark shows Fossils only when its Labyrinth is complete. | The collection holds an Echo Fossil for the current, unfinished Labyrinth. The header count is one more than the landmark total. | none |
| B-71 | Front end (dialogs row 17) | bug | low | medium | Kept | src/main.js:1479-1497 | After the Workshop returns to the Echo Atlas, `showQuestAtlas` gets the Workshop button as its trigger. | The Explorer opens the Atlas, opens the Workshop from a landmark, then closes both. Focus goes to the Workshop button, not the Atlas button. | none |
| B-72 | Front end (dialogs row 18; shell row 19) | bug | low | low | Kept | src/main.js:1129-1136, 1223-1228, 4827-4829 (also 4868-4875, 3942-3947; index.html:1225-1232) | The Records dialog and the Quest result dialog set no first focus and no focus return. The Quest result dialog sends no announcement of its own. First Light does both. | In Safari the Explorer opens Run Records by mouse and closes it. Focus goes to `body`, and the canvas takes no keys. A screen-reader Explorer wins a Quest Run. The browser chooses the focus target. The live region holds only the escape event text. | none |
| B-73 | Front end (dialogs row 19) | design flaw | low | medium | Kept | src/game/quest-atlas-view.js:39-43 | A click on the Atlas backdrop closes the Atlas, and the paused Run resumes at once. | The Explorer releases a map drag over the backdrop, or clicks beside the dialog. The Atlas closes and the Run resumes. | Q1 session shape |
| B-74 | Front end (dialogs row 20) | bug | low | high | Kept | src/main.js:1761-1773 | `loadActiveRunRecoveryModule` caches a failed import as `null` for the whole session. | One network error happens while the chunk loads. Campfire Resume stays unavailable for every later Run in this tab. | none |
| B-75 | Front end (dialogs row 21) | design flaw | low | medium | Kept | src/game/active-run-recovery.js:13, 171-176, 376-378 | A Run with more than 2048 recorded actions fails the bounds check. The controller scrubs the stored checkpoint. | The Explorer plays a long Run. At action 2049, Campfire Resume becomes unavailable, and a tab close loses the whole Run. | none |
| B-76 | Front end (dialogs row 22) | design flaw | low | medium | Kept | src/game/storage.js:109-123, 129-139; src/main.js:4646-4654 | A guest Run stores its Run Replay with no `replayOwnerId`. `projectRunRecords` shows an ownerless replay to every account. | A guest finishes a Run on a shared device. Another person signs in. Watch Trail shows the guest Trail. | none |
| B-77 | Front end (dialogs row 23) | bug | low | medium | Kept | src/landing/landing-controller.js:125-129 | The landing call to action says "Continue Quest" for any stored Quest Progress, a complete Quest included. | The Explorer finishes all 20 Labyrinths and opens the landing page. The button says "Continue Quest". | none |
| B-78 | Front end (dialogs row 24) | bug | low | medium | Kept | src/landing/landing-controller.js:146-171; src/player/clerk-browser.js:76-82 | `syncAccount` sets `clerkReady` before Clerk loads. Clerk caches a failed load, so sign-in stays off until a reload. | A visitor clicks "Sign in" on a slow network. The 8 second deadline passes. Both buttons say "Sign-in unavailable", with no retry. | none |
| B-79 | Front end (dialogs row 25) | bug | low | medium | Kept | src/landing/visit-beacon.js:23-34 | The beacon writes the "sent" flag before the request and ignores a failed request. | The first POST fails. The session never counts the visit. | none |
| B-80 | Front end (dialogs row 26) | test gap | low | medium | Kept | tests/storage.test.js:487, 559; tests/active-run-recovery.test.js:1421; tests/e2e/game.spec.js:1022, 6340 | No test covers a throwing `localStorage` getter in `storage.js`, eviction across Labyrinths, Escape on the result dialog, or time during the Quest Level dialog. | Each Kept finding above passes the current suite unchanged. | none |
| B-81 | Front end (renderer row 5) | bug | low | high | Kept | `src/game/canvas-renderer.js:584-585`, `src/game/canvas-renderer.js:855-860`, `src/game/canvas-renderer.js:884`, `src/game/canvas-renderer.js:897` | `drawGate` and `drawWarden` set round line caps and joins and do not restore them. Later Warden danger rings stroke with round caps. | Two Wardens are revealed and the Gate is in Fog. The first danger ring is thin, and the second ring is heavier. | none |
| B-82 | Front end (renderer row 6) | design flaw | low | high | Kept | `src/game/canvas-renderer.js:233-238`, `src/game/canvas-renderer.js:515`, `src/game/canvas-renderer.js:853`, `src/game/game-session.js:1057-1069` | The Explorer draws last on the tile of the Warden in a Warden Challenge. The Explorer disc covers the Warden body. | A Lured Warden reaches the Explorer. The board shows the Explorer mark in a dotted ring, and the Warden Mode is not visible. | Q1 feedback |
| B-83 | Front end (renderer row 7) | parity gap | low | high | Kept | `src/game/canvas-renderer.js:163-172`, `src/game/canvas-renderer.js:228-237` | The Windway pair rule adds the partner tile to the local `revealed` set. That set also gates Echo and Warden marks. | The Explorer reveals a Windway source. A Warden on the destination draws while that tile is still in Fog for the Run. | Q4 line-of-sight Fog |
| B-84 | Front end (renderer row 8) | parity gap | low | medium | Kept | `src/game/run-replay-view.js:125-128`, `src/game/run-replay-view.js:299-301`, `src/player/access-settings.js:82-84`, `src/daylight.css:1707-1714` | Run Replay playback checks only the operating system reduced-motion query. It ignores the Explorer Access Settings value `data-access-effects="reduced"`. | An Explorer turns on reduced effects in Explorer Access Settings only. Run Replay still plays a new board frame every 500 ms. | Q1 reduced motion |
| B-85 | Front end (renderer row 9) | design flaw | low | high | Kept | `src/game/canvas-renderer.js:174`, `src/game/canvas-renderer.js:270-271` | `render` calls `context.save()` and `context.restore()` with no `try`/`finally`. A throw in a draw step leaves one saved state on the stack. | A malformed Run throws after the Fog fill. The board stays half-drawn, and the save stack keeps one extra entry. | none |
| B-86 | Front end (renderer row 10) | design flaw | low | high | Kept | `src/game/canvas-renderer.js:147-150`, `src/daylight.css:371`, `src/daylight.css:493-502`, `src/daylight.css:1520` | The backing store clamps to 320 pixels. A smaller board box scales by a non-integer factor, and a zero box renders at 320 pixels. | A 256 CSS pixel board at ratio 1 has a 320 pixel backing store. The browser scales it by 0.8, so thin lines blur. | Q1 sharp canvas |
| B-87 | Front end (renderer row 11) | design flaw | low | low | Kept | `src/main.js:1737-1740`, `src/game/run-replay-view.js:76-81`, `src/game/canvas-renderer.js:145-155` | The canvas resizes only on a window `resize` event and inside `render`. No observer watches the canvas box or the device ratio. | The window moves to a screen with another device ratio. The backing store keeps the old size until the next render. | Q1 sharp canvas |
| B-88 | Front end (renderer row 12) | performance | low | medium | Kept | `src/main.js:1737-1740`, `src/game/run-replay-view.js:76-81`, `src/game/run-replay-view.js:164-165`, `src/game/canvas-renderer.js:151` | The window `resize` handlers have no throttle. Each event calls `renderer.resize()` and a full `render`, which calls `resize()` again. | An Explorer drags the window edge. Each `resize` event redraws every tile, mark and Neatline label. | Q1 input latency |
| B-89 | Front end (renderer row 13) | performance | low | high | Kept | `src/game/canvas-renderer.js:159-160`, `src/game/canvas-renderer.js:304-305`, `src/game/canvas-renderer.js:1006-1044` | Every render reads the full palette through `getComputedStyle`, with 25 property reads. No cache holds the palette between renders. | Each Explorer move forces a style flush on the action path before the board draws. | Q1 input latency |
| B-90 | Front end (renderer row 14) | performance | low | high | Kept | `src/main.js:5044-5052`, `src/game/game-session.js:384-391` | `tick` runs on every animation frame for the life of the page. Each active frame builds a Run object and writes the time text. | An active Run on a 120 Hz screen makes 120 Run objects and 120 DOM text writes each second. | Q1 motion timing |
| B-91 | Front end (renderer row 15) | design flaw | low | medium | Kept | `index.html:201-210`, `src/main.js:4413-4446`, `src/main.js:697-703` | The game canvas takes focus and has an `aria-label`, with no role and no fallback content. The Signal Bell label names no bell key. | A screen reader user focuses the board on a Signal Bell Run. The label gives no key for Ring Bell or Pulse. | none |
| B-92 | Front end (renderer row 16) | design flaw | low | high | Kept | `src/game/canvas-renderer.js:340` | The Grid reference font is fixed at 10 CSS pixels. It ignores the large marks setting. | An Explorer turns on large marks. Board marks grow by 1.22, and the Neatline letters and numbers stay at 10 pixels. | none |
| B-93 | Front end (renderer row 17) | design flaw | low | medium | Kept | `src/game/canvas-renderer.js:1006-1044`, `tokens.css` | The board has no forced-colors handling. Under a forced colour mode the canvas keeps the theme palette. | A Windows contrast theme is active. The page takes system colours, and the board keeps the theme colours. | none |
| B-94 | Front end (renderer row 18) | design flaw | low | medium | Kept | `src/game/canvas-renderer.js:1006-1044`, `src/game/canvas-renderer.js:1048-1073` | Every palette value and every fallback value is an `oklch()` colour. The fallback gives no help on an engine without `oklch()` support. | An older engine ignores each `oklch()` colour assignment. The board draws every mark in the default black. | none |
| B-95 | Front end (renderer row 19) | performance | low | high | Kept | `src/game/canvas-renderer.js:72`, `src/game/canvas-renderer.js:80-95` | The pattern cache never removes an entry. Each new Fog colour pair and each new hatch colour adds a pattern. | An Explorer changes Theme Choice and palette many times. The entry count grows, and the palette combinations bound it. | none |
| B-96 | Front end (renderer row 20) | bug | low | medium | Kept | `src/main.js:3078-3086`, `src/main.js:719-727`, `src/main.js:3099-3103` | The First Light handoff applies a `pause` action to the Run. The function and its callers make no render call after it. | The Explorer leaves an active First Light Run for the start choice. The level dialog opens over a board with no PAUSED band. | none |
| B-97 | Front end (shell row 8) | bug | low | low | Kept | src/main.js:4613-4654 | `finishRun` reads the globals `run`, `currentLevel` and `questProgress` after it awaits the Class Expedition outcome. The identity guard starts later, at line 4723. | A Class Expedition Run ends and the outcome request is slow. The Explorer starts another Run. The Run Record stores it with 0 moves. | none |
| B-98 | Front end (shell row 9) | bug | low | medium | Kept | src/main.js:4622-4628 | The "removed" verdict returns with no result dialog. The only message is a live-region announcement from the Class Play module. | A Teacher removes a learner during a Class Run. The Run ends. The board shows "Escaped" and no dialog opens. The Pause button does nothing. | none |
| B-99 | Front end (shell row 10) | bug | low | medium | Kept | src/main.js:697 (also 5439; index.html:277-278) | `isNativeControl` does not include `summary`. Space on the trail Echo Lens summary reaches the Pulse branch. | After a correct answer the trail Echo Lens shows. The Explorer tabs to "Why this works" and presses Space. The handler spends a Pulse. | none |
| B-100 | Front end (shell row 11) | bug | low | medium | Kept | src/main.js:4118-4123 (also 874-885, 3961) | Each `syncChallengeDialog` call with a Question rebuilds the choice buttons and moves focus to the Question text. | A keyboard Explorer activates Show Hint. Focus leaves the Hint button and lands on the Question. Hide Hint needs another Tab. | none |
| B-101 | Front end (shell row 12) | bug | low | medium | Kept | src/main.js:5123-5128 (also 3947, 4285, 2058-2071) | `announce` clears the live region and sets the text in the next frame. Two calls in one task leave only the last message. | In a Daily Run the Explorer meets a Warden. `transition` announces the Challenge start, then the Question announcement replaces it in the same task. | Q1 feedback |
| B-102 | Front end (shell row 13) | bug | low | medium | Kept | src/main.js:1713-1735 | The swipe code keeps one `touchStart` and does not check `pointerId`, `isPrimary` or `button`. It has no `pointercancel` handler. | A second finger touches the canvas during a swipe and replaces `touchStart`. The first finger lifts and the Explorer moves in a wrong direction. | Q1 portrait layout |
| B-103 | Front end (shell row 14) | design flaw | low | high | Kept | src/main.js:5045 | `tick` caps each frame at 1000 ms. When frames arrive less than once per second, the Run timer runs slower than real time. | A visible but throttled window gets one frame each 5 seconds. 60 real seconds add 12 seconds to the Run. | Q1 motion timing |
| B-104 | Front end (shell row 15) | bug | low | low | Kept | src/main.js:1172-1204 (also 927-1000) | Settings and Atlas pause the Run and then await a lazy import. No dialog is open during the await, so the pause shortcut still works. | In Safari on a slow network, the Explorer clicks Settings and presses P. The Run resumes, and the modal opens over an active Run. | none |
| B-105 | Front end (shell row 16) | bug | low | medium | Kept | src/main.js:1973-2076 | `startRun` does not call `clearPostAnswerEchoLens`. The trail Echo Lens of the earlier Run stays open. | An Explorer answers correctly, sees the trail Echo Lens, then wins and continues. The next Labyrinth shows the earlier explanation. | none |
| B-106 | Front end (shell row 18) | bug | low | high | Kept | src/main.js:4523-4529 | After a Run ends, the Pause button stays enabled with the label "Pause". The shell and the engine ignore `pause` in status `won` and `lost`. | An Explorer closes the result dialog after a win and presses Pause. Nothing changes and no message says why. | none |
| B-107 | Front end (shell row 20) | test gap | low | high | Kept | tests/e2e/game.spec.js:1228, 3933, 3953 | No test covers modifier keys, Escape on the result dialog, double activation of a level card, a second pointer, or a failed Run Access check. | Each bug above can ship with a green gate. | none |
| B-108 | Back end (S-02) | vulnerability | low | medium | Kept | `server/offline-cloud-outcome.js:87-105`; `server/player-validation.js:21`; `server/player-store.js:281-282` | A client can claim the idempotency key `offline_<runId>` through `/api/scores`. The later Verified Run write then changes nothing. | An Explorer posts a forged Score Entry with key `offline_<runId>`, then submits the real Run. The forged row stays on the board. | Q3 leaderboard integrity |
| B-109 | Back end (S-04) | test gap | low | high | Kept | `tests/offline-submission.test.js:404-418` | The play-expiry test pins only a `terminalAt` after the play window. No test covers a Run that ends inside it. | The B-28 defect passes the test file, because no case submits after day seven with an earlier terminal instant. | none |
| B-110 | Back end (S-05) | design flaw | low | medium | Kept | `server/run-replay.js:302-312`, `:463-473`; `server/player-store.js:176-183` | Elapsed time is a client claim in both replay paths. The server checks only order and the four-hour limit. | An Explorer sets every `elapsedMs` in an offline Run Action Log to 0. The Score Entry wins the elapsed-time tie-break on the Global Scoreboard. | Q3 leaderboard integrity |
| B-111 | Back end (S-07) | performance | low | high | Kept | `server/daily-route.js:212-217`, `:224`; `server/daily-store.js:101-126` | The Daily route replays the Run before the store looks up the idempotency key. A repeated key costs a full replay. | A client retries the same Daily submission ten times per minute. Each retry replays the log. | Q3 replay proof |
| B-112 | Back end (S-08) | vulnerability | low | high | Kept | `server/daily-route.js:119-134` | The Verified Daily Board read has no rate limit. The comment at lines 144-147 claims a shared budget. | An anonymous caller reads `/api/daily/leaderboard` in a loop. Each call runs a ranking query. | none |
| B-113 | Back end (S-09) | bug | low | high | Kept | `server/daily-route.js:116`, `:343-355` | The route builds the Daily contract from the server clock at request time. A Run of the previous date fails with 409. | An Explorer escapes at 23:59:50 UTC. The request reaches the server at 00:00:05 UTC. The server rejects the Verified Run. | Q3 Daily Run Grant |
| B-114 | Back end (S-13) | design flaw | low | low | Kept | `server/offline-receipt-route.js:249` | The receipt binds `initialQuestionOrdinal` from Quest Progress at request time, not at Run start. | Quest Progress moves on a second device before the receipt request for Run A. The signed Question sequence differs from the one played. | none |
| B-115 | Back end (S-14) | bug | low | medium | Kept | `db/migrations/0024_offline_run_continuity.sql:27`; `db/migrations/0025_offline_run_continuity_forward.sql:160`; `server/offline-receipt-route.js:291-299` | Receipts are unique on `run_id` for all players. Run Grants are unique on `(player_id, run_id)`. | Player B registers a Run Grant with a Run id of player A and requests a receipt first. Player A gets 409. | none |
| B-116 | Back end (S-15) | vulnerability | low | high | Kept | `server/run-access-route.js:388-446` | `POST /api/access/runs` has no rate limit. Each enforced call opens a transaction and writes an audit row. | A Lifetime Membership holder posts new Run ids in a loop. Each call adds one `run_access_grants` row and one audit row. | none |
| B-117 | Back end (S-17) | design flaw | low | low | Kept | `server/run-access-store.js:156-172` | A Run Grant never expires. A repeat request for a granted Run returns `allowed: true` after a refund or dispute. | A member registers 1,000 Run ids, then gets a refund. All 1,000 Runs stay admitted. | none |
| B-118 | Back end (S-18) | design flaw | low | low | Kept | `server/run-access-store.js:22-28`, `:203-210` | A refunded or disputed membership blocks every new Run, also when free Runs remain. | An Explorer uses one free Run, buys Lifetime Membership, and gets a refund. The Explorer can start no new Run. | none |
| B-119 | Back end (S-19) | design flaw | low | medium | Kept | `server/player-api.js:764-775`, `:783-792`; `server/run-access-route.js:413-419`; `server/rate-limit-request.js:38-42`; `server/rate-limit.js:69-73`, `:82-86`; `server/request-identity.js:83-85` | Several controls fail open. The rate limiter returns `UNMETERED` without a database or on a store error. | The rate-limit store has an outage. Every budget in this lane stops, and B-04 and B-29 have no limit. | none |
| B-120 | Back end (S-20) | design flaw | low | medium | Kept | `server/player-api.js:154-185`, `:477-495`; `server/offline-content-pack.js:173-178`, `:220-223` | `contentPackFor` reads Question revisions with ids from the unvalidated Run Action Log. The client decides which revisions the lookup holds. | A client names up to 4,096 revision ids in one log. A client omits a published revision and answers the bundled Question. | none |
| B-121 | Back end (S-21) | bug | low | high | Kept | `server/run-replay.js:131-133` | `verifyRunReplay` throws a plain `Error` when no `questionFor` resolver exists. The routes map only `ReplayInputError` to a 4xx. | A new route calls `verifyRunReplay` without `questionFor`. A log reaches a Warden Challenge, and the client gets a 500. | Q3 replay proof |
| B-122 | Back end (S-22) | design flaw | low | high | Kept | `server/player-validation.js:274-275`, `:297`, `:302` | The casual validator accepts values that the engine cannot produce together. It needs no minimum Warden count. | A client stores 1 move with all Echoes, or 100,000 moves and 24 hours with 0 Wardens. No replay can confirm either entry. | Q3 leaderboard integrity |
| B-123 | Game restrictions (GR-02) | test gap | low | high | Kept | `server/run-replay.js:207` | No test asserts the v2 reject of an action after the terminal state. | A change removes the guard. The log still fails, with the wrong message, at the time check or the no-op check. | Q3 replay proof |
| B-124 | Game restrictions (GR-08) | test gap | low | high | Kept | `src/game/game-session.js:236-243`, `:1429-1431` | No guard and no test state the rule that a Warden never spawns beside the Explorer start. | A change sets the minimum distance to 1. Nine fixture tests fail. No test names the rule. | none |
| B-125 | Game restrictions (GR-09) | test gap | low | high | Kept | `src/game/game-session.js:1212` | No test pins the start Vitality clamp of 1 to 9. | A change raises the limit to 99. A caller that passes 999 gets 99 Vitality. | none |
| B-126 | Game restrictions (GR-10) | design flaw | low | high | Kept | `src/game/game-session.js:274-281` | `acceptsShortcuts` never rejects a candidate, so no test can go red for it. | Echo Bridges and Tide Doors only add a passage to a connected Labyrinth. The check cannot fail. | none |
| B-127 | Game restrictions (GR-11) | bug | low | high | Kept | `src/game/game-session.js:1416-1451`, `:226-243` | `pickEntities` can return fewer entities than the config states, and `createRun` accepts the short list. | A size 9 config with 8 Echoes gets 6 Echoes. The start message still says 8. | Q3 model-based tests |
| B-128 | Game restrictions (GR-12) | bug | low | high | Kept | `src/game/game-session.js:244-246` | `gateWarden: true` with `wardenCount: 0` gives a Run with no Gate Warden and no sealed Gate. | A config with the milestone flag and zero Wardens loses its Gate Warden Challenge. No error shows. | Q3 model-based tests |
| B-129 | Game restrictions (GR-13) | bug | low | high | Kept | `src/game/first-light.js:8`; `src/game/game-session.js:1204` | First Light declares size 7, and `normalizeConfig` clamps the size to 9. | The First Light Labyrinth is 9 by 9. The declared value has no effect. | Q1 onboarding |
| B-130 | Game restrictions (GR-14) | bug | low | high | Kept | `src/game/game-session.js:390` | A `tick` with a non-finite `deltaMs` makes `elapsedMs` `NaN` or `Infinity`. | A caller sends `deltaMs: undefined` after a timer error. `elapsedMs` is `NaN` for the rest of the Run. | Q3 determinism |
| B-131 | Game restrictions (GR-15) | bug | low | medium | Kept | `src/game/game-session.js:503` | `answer-question` with no `answerId` is correct when the Question has no `answerId`. | A Question without `answerId` reaches `provide-question`. An empty answer defeats the Warden for 100 points. | Q4 Warden Challenge |
| B-132 | Game restrictions (GR-16) | design flaw | low | medium | Kept | `src/game/run-replay-contract.js:233`, `:240` | `normalizeTerminal` accepts a score up to 100,000 and an `echoTotal` up to 20. | A stored Run Replay claims score 90,000. Only the terminal-facts compare rejects it. | Q3 replay proof |
| B-133 | Game restrictions (GR-17) | bug | low | medium | Kept | `src/game/game-session.js:1490`, `:1548`, `:1566`, `:1584-1650` | Twist counts fall short at the config limits with no error. | A size 9 Run with 7 Echoes gets 2 Echo Bridges. Five Echoes open no Bridge. | Q4 Twist count |
| B-134 | Harness (H-10) | test gap | low | high | Kept | `tests/e2e/game.spec.js:4030`, `:5002`, `:5374` | The mobile project skips the guest terminal Run, the full guest Labyrinth completion, and the terminal Atlas fallback. | The guest demo result breaks only at 390 px. The mobile project stays green, because only the Labyrinth 4 Gate path runs there. | none |
| B-135 | Harness (H-13) | design flaw | low | medium | Kept | `src/game/run-action-log.js:83-118`, `src/main.js:3878-3879`, `server/run-replay.js:327` | Run Action Log v1 has no `ring-bell` entry. It is correct only while the Daily uses classic rules, and no test pins that condition. | A later Daily uses warden-bells-v1. The verifier reports `moves` one lower per rung Bell, or rejects the Run. | Q3 golden logs |
| B-136 | Harness (H-14) | test gap | low | medium | Kept | `tests/run-replay.test.js:102`, `tests/run-action-log-v2.test.js:257`, `:269` | Three verifier rejection tests assert only the error class `ReplayInputError`. | A validator rejects a log for the wrong reason, for example a shape error before the rule under test. The test still passes. | Q3 replay proof |
| B-137 | Harness (H-15) | design flaw | low | high | Kept | `scripts/run-vitest-gate.mjs:195-205`, `scripts/run-database-lane.mjs:103-117` | With an armed integration lane the skip pin becomes a maximum. Any skip count from 0 to 33 passes. | An armed lane has a wrong connection value for one store. That file skips. The gate still passes with 30 skipped. | none |
| B-138 | Harness (H-16) | design flaw | low | high | Kept | `scripts/vitest-gate.mjs:87-161`, `scripts/vitest-test-count.json` | The gate pins counts, not test identity. | A change deletes one soft-lock test and adds one trivial test. The totals stay 213, 2155, 33 and the gate passes. | none |
| B-139 | Harness (H-17) | design flaw | low | medium | Kept | `scripts/vitest-gate.mjs:60-82` | The gate reads the text summary lines of the reporter, not a structured result. | A Vitest release changes the "Test Files" or "Tests" line format. The gate fails closed on a good build, or reads a wrong number. | none |
| B-140 | Harness (H-18) | bug | low | high | Kept | `tests/pre-push-hook.test.js:62-66`, `:76-102` | Four tests use `it.skipIf(!shellAvailable)`. Without `sh` and `bash` on PATH the skip count is 37, not 33. | A Windows shell without Git Bash on PATH runs `npm run test`. The gate fails on the skip pin with no hint about the shell. | none |
| B-141 | Harness (H-19) | design flaw | low | medium | Kept | `playwright.config.mjs`, `tests/e2e/entry.spec.js:134`, `:852` | The e2e suite has no pin on the skipped count. Two Clerk tests skip when the publishable key is absent. | A local e2e run without the key reports green. The sign-in entry flow did not run. | none |
| B-142 | Harness (H-20) | design flaw | low | medium | Kept | `package.json:17`, `package.json:33` | `check:full` builds production, then `test:e2e` overwrites `dist/` with the e2e-mode build. | A person runs `check:full` and then deploys `dist/`. The deployed bundle has the e2e seam enabled. | none |
| B-143 | Harness (H-21) | test gap | low | high | Kept | `tests/e2e/layout-redesign.spec.js:170-205`, `:207-209` | Two tests can pass with almost no assertion. One guards its checks with `if` conditions. One returns early outside the desktop project. | The D-pad is hidden by a regression. The tactile-feedback test passes. | none |
| B-144 | Harness (H-22) | test gap | low | medium | Kept | `tests/e2e/game.spec.js:2947-2948` | The touch-control size test does not wait for `data-game-ready`. | The test measures the controls before the game shell settles. It gives an intermittent failure or a false pass. | none |
| B-145 | Harness (H-23) | test gap | low | high | Kept | `tests/e2e/game.spec.js` (8), `tests/e2e/entry.spec.js` (4), `tests/e2e/layout-redesign.spec.js:187` | Thirteen `waitForTimeout` calls make e2e results depend on machine speed. | A slow preview server makes a fixed 100 ms wait too short. The test fails with no product defect. | none |
| B-146 | Harness (H-24) | test gap | low | high | Kept | `tests/e2e/daily.spec.js:550`, `:602`, `:628`, `:667`, `:713`, `:806`, `:919` | Seven Daily tests skip on mobile, including the signed-in verified result and the rejected replay. | The verified Daily result panel overflows at 390 px. The mobile project stays green. | none |
| B-147 | Harness (H-25) | design flaw | low | high | Kept | `tsconfig.json:14` | `tsc` does not include `scripts/**`. It checks only the six scripts that tests import. `check-bundle-budget.mjs` has no type check. | A wrong property name in `check-bundle-budget.mjs` gives `undefined` at run time. Typecheck passes. | none |
| B-148 | Harness (H-26) | design flaw | low | medium | Kept | `package.json:11`, `eslint.config.mjs` | `eslint .` has no `--max-warnings 0`. A rule at warning level cannot fail the gate. | A later rule at "warn" level reports 50 problems. `npm run lint` exits 0. | none |
| B-149 | Harness (H-27) | performance | low | medium | Kept | `tests/no-soft-lock.test.js:408`, `tests/warden-behavior.test.js:270`, `tests/warden-behavior.test.js:274-309` | Two files take 376 s of the unit run. The gate needs more than 7 minutes on one worker. The A-series status check records that the Quest Runs case exceeds its 120 000 ms limit. | The pre-push hook takes so long that a person uses `--no-verify`. One test takes 114 s against a 120 s limit. | none |
| B-150 | Harness (H-28) | performance | low | high | Kept | `scripts/check-bundle-budget.mjs:14-19` | Game JavaScript is at 41.92 KB of a 42 KB budget. | The next 0.1 KB change to `main`, `game-session`, or `canvas-renderer` fails the gate. The usual answer is a raised ceiling. | Q2 bundle budget |
| B-151 | Harness (H-29) | test gap | low | medium | Kept | `tests/no-soft-lock.test.js:232-252`, `:408-425` | The real-engine soft-lock cross-check uses one seed per configuration and removes the Wardens. The 300-seed sweep uses a state oracle, not `applyAction`. | The oracle and the engine drift apart for a rare layout. The sweep stays green because it does not call the engine. | Q3 solvability proof |

## Game restriction table

Line numbers are for `main`. `gs` means `src/game/game-session.js`. A label such as m1, s1, c1, r1, or u1 names one break of the mutation run. `small.mjs` and `checks.mjs` are scratch scripts of that run in the OS temp directory. The repository does not hold them.

"Incidental" means that the red test asserts a different behaviour. "Read only" means that no break ran for that part.

| ID | Game restriction | Enforcing code | Harness test | Red demonstrated | Finding |
| --- | --- | --- | --- | --- | --- |
| R-01 | Each Echo is reachable from the Explorer start. Source: GLOSSARY "Objective Reachability"; ADR 0053 | `gs:1259` `generateLabyrinth` (connected maze); `gs:1416` `pickEntities` (picks from the distance map); `gs:258` `acceptsWindways` | `tests/game-session.test.js` "keeps every protected objective mutually reachable through Windways"; `tests/no-soft-lock.test.js` "US-01.1/US-01.2: every reachable state of %s reaches the Gate with every Echo" | Windways: yes (m1). Other revisions: read only. Fuzz: 0 counterexamples in 18,900 shipped Runs (legacy `windways-v1` excluded, see R-03) | none |
| R-02 | The Gate is reachable. Source: GLOSSARY "Objective Reachability"; ADR 0053 | `gs:1259`; `gs:1398` `farthestAvailable`; `gs:258` | The two tests of R-01 | Windways: yes (m1). Other revisions: read only. Fuzz: 0 counterexamples | none |
| R-03 | No state soft-locks. Source: ADR 0053; GLOSSARY "Objective Reachability" | `gs:258` `acceptsWindways`; `gs:274` `acceptsShortcuts`; `gs:1718` `everyReachableTileReachesObjectives`; `gs:1688` `explorerCanBeTrapped` | `tests/no-soft-lock.test.js` "US-01.1: applyAction leaves no trapped state in %s" (the `windways-v2` case); "US-01.3: the pinned seed traps under windways-v1 and not under the current ruleset" | `acceptsWindways`: yes (m1). `acceptsShortcuts`: no (m14, B-126) | B-126 |
| R-04 | Determinism: one seed and one action list give one outcome. Source: ADR 0024; ADR 0001 | `gs:215` `createRandom(seed)`; `gs:1246` `normalizeSeed`; `gs:1924` `createRandom` | `tests/deterministic-core.test.js` "reads no entropy outside the one declared seam", "still builds the same Labyrinth twice from one seed"; `tests/game-session.test.js` "creates the same run from the same seed" | yes (m6: 20 tests red) | none |
| R-05 | Fog hides an Echo on the canvas. Source: GLOSSARY "Fog" | `src/game/canvas-renderer.js:229` | `tests/canvas-renderer.test.js` "draws numbered Echo Bridge pairs through Fog" | yes, incidental (c4) | none |
| R-06 | Fog hides a Warden on the canvas. Source: GLOSSARY "Fog" | `src/game/canvas-renderer.js:234` | none | no (c3: 64 tests, 0 red). B-34 | B-34 |
| R-07 | Fog hides the Gate on the canvas. Source: GLOSSARY "Fog" | `src/game/canvas-renderer.js:211` | none direct. 6 paint-order tests go red | yes, incidental (c5) | none |
| R-08 | Trail Compass does not describe a Fog-hidden Echo or Warden. Source: GLOSSARY "Trail Compass"; design.md I3 | `src/game/trail-compass.js:182` (Echo), `:198` (Warden), `:187` (Gate) | `tests/trail-compass.test.js:37` "never describes a Fog-hidden Echo, Warden, or Gate" | Echo: no (c2). Warden: no (c1). Gate: yes (c6). B-05 | B-05 |
| R-09 | Fog reveal radius is 2 tiles; revealed Fog stays revealed. Source: GLOSSARY "Fog" | `gs:919-921` `revealExplorerArea` | `tests/game-session.test.js` "keeps previously revealed Fog visible after normal movement" | Radius: no (m8, m8w: 292 tests, 0 red). B-35. Monotone: read only; fuzz finds 0 violations | B-35 |
| R-10 | Server rejects a v1 log with an action after the terminal state. Source: ADR 0024 | `server/run-replay.js:113` | `tests/run-replay.test.js` "rejects incomplete and post-terminal logs" | yes (s4) | none |
| R-11 | Server rejects a v1 impossible or no-op action. Source: ADR 0024 | `server/run-replay.js:142` | none | no (s1, s1w: 198 tests, 0 red). B-32 | B-32 |
| R-12 | Server rejects a v1 log that does not reach a terminal state. Source: ADR 0024 | `server/run-replay.js:151` | `tests/run-replay.test.js` "rejects incomplete and post-terminal logs" | yes (s3) | none |
| R-13 | Server rejects a v2 (offline) action after the terminal state. Source: ADR 0024; ADR 0035 | `server/run-replay.js:207`; also `:215-218` (time advance on a terminal Run) and `:244` (no-op) | none | no (s7, s7w). The break does not let the action pass; `:215-218` or `:244` still rejects it. B-123 | B-123 |
| R-14 | Server rejects a v2 impossible or no-op action. Source: ADR 0024; ADR 0035 | `server/run-replay.js:244` | none | no (s2, s2w). B-32 | B-32 |
| R-15 | Server rejects a v2 log that does not reach a terminal state. Source: ADR 0035 | `server/run-replay.js:253` | `tests/offline-submission.test.js` "leaves cloud state byte-identical when the replay is rejected" | yes (s6) | none |
| R-16 | Server rejects an unknown log version. Source: ADR 0035 | `server/run-replay.js:271` | `tests/run-action-log-v2.test.js` "refuses any version but its own" | yes (s5) | none |
| R-17 | A Warden never spawns on or beside the Explorer start. Source: Task list; implied by `gs:242` | `gs:236-243` (minimum path distance `max(5, floor(size*0.6))`). No explicit guard. `gs:1429-1431` drops the minimum when candidates run short | none direct | yes, incidental only (m2: fixtures drift). B-124 | B-124 |
| R-18 | Vitality never goes below 0; Vitality 0 ends the Run. Source: GLOSSARY "Vitality" | `gs:504-505`; `gs:462-463` | `tests/game-session.test.js` "ends the Run after a one-vitality Explorer answers incorrectly", "ends the Run with the milestone Gate still sealed after final Vitality" | yes (m5) | none |
| R-19 | Start Vitality is 1 to 9. Source: `gs:1212` | `gs:1212` `clampInteger(…, 1, 9)` | none | no (m12, m12w). B-125 | B-125 |
| R-20 | Run Score = 100 per Warden + 50 per Echo + 500 for escape. Source: GLOSSARY:328 | `gs:562`, `gs:954`, `gs:748`; `server/player-validation.js:308` `computeRunScore` | `tests/game-session.test.js` "keeps the Gate locked until every Echo is recovered", "defeats the encountered Warden after a correct answer"; `tests/run-replay.test.js` "derives one escaped Daily result from the fixed action fixture" | yes (m3, m4, m18). The replay contract bound is loose: B-132 | B-132 |
| R-21 | Each Trail Twist keeps Objective Reachability. Source: ADR 0053 | Windways: `gs:258`. Echo Bridges, Tide Doors: `gs:274`. Signal Bells: none needed (a Bell does not change a passage; read only) | See R-01, R-03 | Windways: yes (m1). Bridges and Tide Doors: no (m14). B-126 | B-126 |
| R-22 | A terminal Run makes a Run Replay that rebuilds to equal terminal facts. Source: ADR 0027 | `src/game/run-replay-contract.js:46` `createTerminalRunReplay`, `:79` `normalizeRunReplay`; `src/game/run-replay.js:23` `buildRunReplayTimeline` | `tests/active-run-recovery.test.js` "returns an outcome-only escape Replay with equal terminal facts" | yes (r3: 5 tests red). Fuzz: 1,176 terminal Runs, 0 mismatches | none |
| R-23 | A local Run Replay with a post-terminal, no-op, non-terminal, or divergent action list is refused. Source: ADR 0027 | `src/game/run-replay.js:68` (redundant with `:73-78` and `:99`), `:99`, `:113-117` (redundant with `:120` and `run-replay-contract.js:252`), `:120`; `src/game/run-replay-contract.js:251` | `tests/active-run-recovery.test.js` "rejects impossible replay divergence instead of installing state" (does not bite) | no (r1w, r2w, r4w, r5w, r6w: 198 tests, 0 red). B-33 | B-33 |
| R-24 | A ruleset revision pins behaviour. Source: ADR 0026; ADR 0037; ADR 0053 | `src/game/run-ruleset.js:6-45`, `:118` `normalizeKnownRunRuleset`; `gs:258-281` | `tests/run-ruleset.test.js` "maps every Atlas Region to its one fixed Trail Twist revision"; `tests/twist-generation-golden.test.js` "keeps the Labyrinth and Twist placement of every known revision and Classic Rules"; replay fixtures in `tests/offline-submission.test.js`, `tests/run-action-log-v2.test.js` | yes (u1 mapping; m9b Warden rule: 12 tests red; m17 Tide phase) | none |
| R-25 | The Gate opens only when every Echo is collected. Source: GLOSSARY "Gate" | `gs:955` `open: allCollected`; `gs:324-325` | none direct | yes, incidental only (m10w: one Replay test). m10: 90 engine tests, 0 red. B-36 | B-36 |
| R-26 | A Gate Warden holds the open Gate until its Challenge is won. Source: GLOSSARY "Gate Warden" | `gs:684-709` | `tests/warden-behavior.test.js` "a Gate Warden holds the open Gate until its Challenge is won"; `tests/game-session.test.js` "starts a paused Gate Warden Challenge when a sealed open Gate is attempted" | yes (m16) | none |
| R-27 | A Warden never enters the Gate tile or an uncollected Echo tile; no two entities share a tile. Source: `gs:973-978` | `gs:1001-1002`; `gs:1448` | `tests/game-session.test.js` "keeps a Patrol Warden off a reserved Echo tile", "keeps a Patrol Warden off the reserved Gate tile"; `tests/warden-behavior.test.js` "%s Runs: live Wardens keep every rule and never stop a correct Explorer" (the Classic case) | yes (m7, m13) | none |
| R-28 | A terminal Run does not change. Source: ADR 0024 | `gs:579` `if (run.status !== "active") return run` | none | no (m19: 133 tests in 7 files, 0 red; m19w: 271 tests in 20 more files, 0 red). B-38. Unbroken code: `small.mjs` gets the same object for 9 action types on a won Run | B-38 |
| R-29 | Tide Doors alternate phase after each Move and Pulse. Source: ADR 0026 | `gs:606-616` | `tests/game-session.test.js` "toggles Tide Doors only after successful Moves and Pulses" | yes (m17) | none |
| R-30 | A Run holds the Echo, Warden, and Twist counts that its config states. Source: `server/player-validation.js:297-305` (read only) | none (`gs:1416-1451` can return fewer; `gs:1584` `selectShortcutEdges` has no stop at count 0) | none | no. Fuzz counterexamples in the clamp pass and one Tactics Lab case. B-127, B-128, B-133, B-37 | B-127, B-128, B-133, B-37 |
| R-31 | Elapsed time stays finite and does not go down. Source: ADR 0024 (4 h limit) | `gs:390` `Math.max(0, action.deltaMs)` (does not stop `NaN`) | none | no. `checks.mjs` counterexample. B-130 | B-130 |
| R-32 | A Warden hunts inside path distance 7. Source: `gs:196` | `gs:196` `HUNT_DISTANCE` | `tests/game-session.test.js` "keeps a Patrol Warden off a reserved Echo tile" (asserts mode `patrol`) | yes (m9, m9b) | none |

## e2e coverage

The harness reader builds this table from a code read of `tests/e2e/`. No pass runs the specs.

| Flow | Desktop spec | Mobile spec |
| --- | --- | --- |
| Start Run | Yes. `game.spec.js:1228` | Yes. `game.spec.js:1228` |
| Move | Yes. `game.spec.js:1228` (keyboard) | Partial. `game.spec.js:1228` (keyboard), `:3953` (synthetic swipe). No real tap. |
| Collect Echo | Yes. `game.spec.js:1228` | Yes. `game.spec.js:1228` |
| Warden contact and Warden Challenge | Yes. `game.spec.js:4092`, `:4166`, `:4231` | Yes. Same tests; no mobile skip found. |
| Pulse | Yes. `game.spec.js:1228` ("q" key) | Partial. Keyboard only; no tap on `#pulse-action`. |
| Trail Twist: Echo Hush | Yes. `game.spec.js:1228` | Yes. `game.spec.js:1228` |
| Trail Twist: Windway | Yes. `game.spec.js:3158` | Yes. `game.spec.js:3158` |
| Trail Twist: Echo Bridge | Yes. `game.spec.js:3311` | Yes. `game.spec.js:3311` (390 x 844 viewport) |
| Trail Twist: Tide Door | Yes. `game.spec.js:3520` | Yes. `game.spec.js:3520` |
| Trail Twist: Signal Bell | Yes. `game.spec.js:3681` | Yes. `game.spec.js:3681` |
| Gate exit | Yes. `game.spec.js:4999`, `:5243` | Yes. `game.spec.js:5243` (Gate Warden, Labyrinth 4). The guest full passage at `:4999` skips. |
| Run end (won) | Yes. `game.spec.js:4027`, `:4999`, `:5243` | Partial. `game.spec.js:5243` only; `:4027` and `:4999` skip. |
| Run end (lost) | Yes. `game.spec.js:6400` | Yes. `game.spec.js:6400` (no skip found) |
| Daily | Yes. `daily.spec.js:282-919`, `game.spec.js:6824-6928` | Partial. 7 `daily.spec.js` tests and `game.spec.js:1370`, `:6881`, `:6931` skip. |
| Campfire Resume | Yes. `game.spec.js:5569-6521`, `milestone-1.spec.js:301`, `:349` | Partial. `game.spec.js:6304` skips; the others run. |
| Offline Run | No. Only seeded Run Record labels (`game.spec.js:7017`, `:7039`) and an API-free Daily reload (`daily.spec.js:282`). | No. Same. |
| Trail Compass | Yes. `game.spec.js:6570` | Yes. `game.spec.js:6570` |
| Night theme | Yes. `game.spec.js:7060`, `:7088`, `:7115`; `layout-redesign.spec.js:430`, `:444` | Yes. Same tests; no mobile skip found. |
| Mobile touch | Not applicable. | Partial. Size and geometry (`game.spec.js:2947`, `layout-redesign.spec.js:179`, `:463`, `:488`), synthetic swipe (`:3953`). No tap that plays a move or a Pulse. |

## Status of A-01 to A-54

The a-series-status reader checks each finding of the 2026-11-25 audit at commit `bac960e`. Commit `6079129` adds only the research document, so each status holds.

"ran" means that a node script ran the real engine. "read only" means that the claim comes from the code and the diff.

Totals: 5 Fixed, 2 Partly fixed, 47 Open.

| ID | Severity | Status | File:line | Proof |
| --- | --- | --- | --- | --- |
| A-01 | high | Fixed | src/game/trail-compass.js:54-62 | Commit 3d7b502 (#300). Test `tests/trail-compass.test.js` › "Trail Compass exits match the engine" › "names an open shortcut as an exit" and "every named exit agrees with the engine"; both pass. ran: 80 of 80 open Echo Bridge endpoints give "open through a shortcut". |
| A-02 | medium | Open | src/game/game-session.js:1015-1016 | ran: Explorer stalls at the start for 40 moves on size 23; 341 of 354 Patrol Wardens do not move in the last 20 turns. |
| A-03 | medium | Open | src/game/game-session.js:606 | ran: 9000 moves on tide-doors-v1, 0 violations of the parity and door-phase invariant; 148 of 148 visits to a Tide Door endpoint find the door sealed. |
| A-04 | medium | Open | src/game/game-session.js:666-667 | ran: 120 of 120 entries from the Windway destination leave the Explorer in place, add 1 Move, and give the event windway-travel. |
| A-05 | medium | Open | src/game/game-session.js:856; src/game/canvas-renderer.js:233-237 | read only. `revealed` only grows; the renderer and the Lure read the live Warden position on a revealed tile. |
| A-06 | medium | Open | src/game/game-session.js:1024 | ran: Hunt Warden, uncollected Echo and Explorer in a corridor. On windways-v2, 551 of 552 cases have no contact in 12 moves and the Warden visits 2 tiles or fewer. On echo-bridges-v1 the count is 569 of 570. |
| A-07 | medium | Open | src/game/game-session.js:462, 504 | ran: at Vitality 3, a paid Question Skip gives 2 and a wrong answer gives 2; both clear the Question. |
| A-08 | medium | Open | src/game/game-session.js:244-249 | ran: Bright Start L4 and L8 have 0 board Wardens. Trail Scout L4 and L8 and Bright Start L12 keep only Warden id 0. |
| A-09 | medium | Open | src/game/game-session.js:955 | read only. The Gate opens only with every Echo, so the Echo term of the Run Score is constant. |
| A-10 | medium | Open | src/game/game-session.js:226, 1416 | read only. `pickEntities` is unchanged since ec5a429. The 85% route share is not measured again. |
| A-11 | medium | Open | src/game/daily-labyrinth.js:58 | read only. The Daily seed is still `DAILY-${compactDate}`. No file under `server/` changed. |
| A-12 | medium | Open | src/questions/quest-levels.js:171-186 | ran: Trail Scout L1 and L3 configs are equal; Bright Start L1 and L5 configs are equal; Maze Master Vitality and Pulses are 3 and 2 at L1 and at L17. |
| A-13 | medium | Open | src/game/game-session.js:1307 | read only for the code; ran the formula: 2 loop walls at size 11 and 5 at size 23. The chokepoint share is not measured again. |
| A-14 | medium | Fixed | src/game/trail-compass.js:117-157 | Commit 4dae3aa (#301). Test `tests/trail-compass.test.js` › "Trail Compass Listen and Bell status" › "Listen names revealed Wardens first, inside the cap"; passes. ran: 8 Echoes, the Gate and 6 Wardens revealed; the first 6 Listen targets are all Wardens. |
| A-15 | medium | Partly fixed | src/game/trail-compass.js:285, 333-337; src/game/audio.js:78-80 | Commit 4dae3aa adds a 160 ms gap between cues, so count and order exist. Test "a new Listen, a Run change, or hide cancels queued tones" passes. read only: no panner and no pitch by direction, so the directional tones of ADR 0026 are absent. |
| A-16 | medium | Open | src/game/trail-compass.js:188-192 | ran: Trail Scout L4 with 3 Echoes left gives "The Gate is 1 east, sealed by the Gate Warden."; the step onto the Gate gives gate-locked "3 Echoes remain. Gate locked." |
| A-17 | medium | Open | src/game/canvas-renderer.js:219-227; src/game/trail-compass.js:206-238 | read only. The canvas draws each Twist fixture with no Fog check. #300 names an adjacent open shortcut only. Listen has no kind for a fixture, and Describe gives counts for a fixture that is not adjacent. |
| A-18 | medium | Open | src/game/trail-compass.js:63-65 | read only. Exits cover the 4 neighbors. No Fog frontier or dead-end data exists. |
| A-19 | medium | Open | src/game/trail-compass.js:247-263 | read only. A Pulse changes only the Pulse count in the Compass text. |
| A-20 | medium | Open | src/game/game-session.js:545-563 | read only. A correct answer gives +100 and +1 Pulse; contact has no cost by itself. |
| A-21 | medium | Open | src/game/game-session.js:825-826, 855-895 | ran: a ring with every Warden in Fog gives the event signal-bell-rung, Moves 0 to 1 and 1 spent Bell; each Warden stays in place and in Hunt mode. The "closer 6, away 0" count is not measured again. |
| A-22 | medium | Open | src/game/trail-compass.js:247-263, 268-283 | read only. The action status gives one global Warden mode with no distance. |
| A-23 | low | Open | src/game/game-session.js:684-709 | ran: Trail Scout L16 (tide-doors-v1) Gate bump gives status challenge, Moves 0 to 1, no Explorer or Warden step, and both Tide Doors go from open to sealed. |
| A-24 | low | Open | src/game/game-session.js:803 | ran: a Pulse shows 13 tiles outside `revealed` and expires at Moves + 2; after 2 moves `pulseVisible` is empty. |
| A-25 | low | Open | src/game/game-session.js:919, 1871 | ran: 49 of 50 seeds reveal at the start a passage tile that is not reachable in 2 steps. |
| A-26 | low | Open | src/main.js:5293-5294; src/game/trail-compass.js:269-270 | ran: Bright Start L4 with a live Gate Warden gives "Warden mode: Path clear." The `main.js` part is read only. |
| A-27 | low | Open | src/game/game-session.js:736-742, 778 | ran: on windways-v2 and on echo-bridges-v1, 259 of 550 pickups with a Hunt Warden near the Echo end with the event challenge-started. On echo-hush-v1 the count is 0 of 418. |
| A-28 | low | Open | src/questions/quest-levels.js:178-179 | ran with A-12: the Pulse count is the same at L1 and L17. The Pulse radius is read only. |
| A-29 | low | Open | src/main.js:4492, 697 | read only. The Pulse button rule and the Space and Q keys have no confirmation. |
| A-30 | low | Open | src/game/game-session.js:287, 303, 306 | ran: Bright Start and Maze Master both get 2 Windways at L5, 2 Tide Doors at L13 and 2 Signal Bells at L17. Echo Bridges scale from 3 to 6. |
| A-31 | low | Open | src/game/run-replay.js:55-58; server/run-replay.js:71; server/daily-route.js:214; server/player-validation.js:296 | read only. Replay passes the current `getLabyrinthConfig`. ran: the ruleset object holds only atlasRegionId, revision and label. |
| A-32 | low | Fixed | src/game/trail-compass.js:231-237 | Commit 4dae3aa (#301). Test `tests/trail-compass.test.js` › "Trail Compass Listen and Bell status" › "says every Signal Bell has rung"; passes. ran: all Bells spent gives "Every Signal Bell has rung." |
| A-33 | low | Fixed | src/game/trail-compass.js:351-364; src/main.js:3941 | Commit 4dae3aa (#301). Test `tests/trail-compass.test.js` › "Trail Compass Listen and Bell status" › "a Ring Bell with no Bell says so"; passes. The controller path is read only outside that test. |
| A-34 | low | Open | src/game/trail-compass.js:254; src/main.js:3891-3893 | ran: `describeCompassAction` after an Echo pickup holds "You earned" in 230 of 230 cases. The First Light strip in `main.js` is read only. |
| A-35 | low | Partly fixed | src/game/trail-compass.js:69-72, 80-85, 253 | Commit 3d7b502 (#300) makes Describe say "carries you back here" (ran: 120 of 120). The action status still lists the bare direction under "Open:" (ran: 120 of 120). The engine carry of A-04 remains. |
| A-36 | low | Open | src/game/trail-compass.js:14-19 | ran: one status reads "Windway carried you up. At row 10, column 6. Open: north, south. Warden mode: Path clear." |
| A-37 | low | Open | src/game/game-session.js:895 | ran: ring a Bell, then step into a Warden; all 6 Wardens stay in mode lured for the Challenge. |
| A-38 | low | Open | src/game/game-session.js:716 | ran: in 45 of 129 carries the carry direction differs from the input, and `lastDirection` holds the input. |
| A-39 | low | Open | src/game/game-session.js:394-414 | ran: a second `provide-question` changes the Question from q1 to q2 and sets `hintRevealed` from true to false. |
| A-40 | low | Open | src/game/game-session.js:366; src/game/canvas-renderer.js:240-245 | read only. The PAUSED band is over a visible board. |
| A-41 | low | Open | src/game/game-session.js:196-197, 242 | ran the formula: the spawn minimum is 6, 7 and 9 at sizes 11, 13 and 15; Hunt range is 7 and Intercept range is 10. |
| A-42 | low | Open | src/main.js:5296; src/game/trail-compass.js:273 | ran: one lured Warden and five Hunt Wardens give "Warden mode: Lured to Bell." The `main.js` part is read only. |
| A-43 | low | Open | src/main.js:4018-4020 | read only. The Challenge text gives no cost of a wrong answer. |
| A-44 | low | Open | src/game/game-session.js:504 | read only. No code path raises Vitality. |
| A-45 | low | Fixed | src/game/trail-compass.js:257-261 | Commit 4dae3aa (#301) corrects the comment. read only: no test can prove a comment. The comment now says that the note reads every Warden, Fog-hidden ones included. |
| A-46 | low | Open | src/game/game-session.js:736-742 | read only. The move order is unchanged since ec5a429. |
| A-47 | low | Open | src/game/game-session.js:1398, 1416 | ran: the Gate is in a dead end in 147 of 200 seeds (74%). |
| A-48 | low | Open | src/game/game-session.js:786-803, 1009-1014 | ran: `lastDirection` is "right" before and after a Pulse. |
| A-49 | low | Open | src/game/game-session.js:974 | ran: a Hunt Warden is 1 tile from the Explorer. Two Pulses on the locked Gate give 0 of 94 contacts. One Pulse on a plain tile at the same distance gives 94 of 94 contacts. |
| A-50 | low | Open | src/game/game-session.js:1551 | read only. `createEchoBridges` is unchanged since ec5a429. |
| A-51 | low | Open | src/game/game-session.js:666-667, 736-742 | ran: 13 of 2600 constructed carries pass a Warden on the Windway source with no Challenge. |
| A-52 | low | Open | server/offline-receipt-route.js:108-118 | ran: `normalizeRunRuleset` accepts windways-v1 for Labyrinth 5, and the current revision is windways-v2. read only: the Run Grant match checks runId, seed, levelId and labyrinthNumber, not the revision. Commit 4578a33 (#302) changes the client only. |
| A-53 | info | Open | src/game/game-session.js:1246-1253, 209-213 | ran: two seeds that differ after character 24 normalize to one seed; a non-ASCII seed normalizes to "" and `createRun` throws. |
| A-54 | info | Open | src/game/game-session.js:1009-1014 | ran: a Warden is 2 tiles away and the Explorer steps aside. Warden id 1 shows intercept in 10 of 10 cases; Warden id 0 shows hunt in 10 of 10 cases. |

## Refuted and duplicate findings

| Lane | Finding | Verdict | Reason |
| --- | --- | --- | --- |
| Front end (compass P-03) | The action status cuts each exit to one direction word. It drops the shortcut note and the Windway destination. | Duplicate of A-35 | A-35 names the same line, `src/game/trail-compass.js:253`. The status table holds A-35 as Partly fixed for this half. |
| Front end (dialogs row 16) | `finishRun` calls `projectQuestAtlas` inside a `try/finally` with no `catch`. The row says a throw skips the result dialog. | Refuted | The absent `catch` is real, but the stated throw is not reachable. Each Quest Progress write goes through a normalizer that rejects an unpublished Learning Deck. |
| Harness (H-11) | No e2e test moves the Explorer or fires a Pulse with a real tap on the touch controls. | Refuted | `tests/e2e/entry.spec.js:468-499` clicks the Move down button five times, and `tests/e2e/game.spec.js:3639` clicks the Pulse button. Each click has a hit test. No test uses `.tap()`, so the touch event type has no cover. |
| Back end (S-10) | The Daily seed is public and derives from the date. The store sets no limit on attempts per day. | Duplicate of A-11 | A-11 holds the same defect at `src/game/daily-labyrinth.js:58`. The status of A-11 is Open. |
| Back end (S-12) | The receipt route takes the ruleset revision from the client. The Run Grant stores no revision that can correct it. | Duplicate of A-52 | A-52 holds the same defect at the same lines. The status of A-52 is Open. |
| Back end (S-23) | The ruleset revision does not cover Labyrinth size, Echo count, or Warden count. A config change alters every open receipt replay. | Duplicate of A-31 | A-31 holds the same defect. The status of A-31 is Open. |
| Front end (shell row 17) | `visibilitychange` pauses an active Run and does not resume it on return. The pause state is shown and announced. | Refuted | The code contradicts the row. The shell announces "Run paused.", the board draws PAUSED, and P or Escape resumes the Run. |

## Checked without findings

Each item is a claim of a lane reader. The filter pass does not check these items again.

### Front end: shell and input

- Held keys: `event.repeat` returns before any action, so one press gives one action.
- Keys in a dialog: the key handler returns while a dialog is open. The Warden Challenge dialog blocks Escape.
- Engine guards: a script shows that `move` in status `paused` changes nothing. `tick` adds no time unless the Run is active.
- Timer in a Warden Challenge: `tick` runs only in status `active`, so the text "Your timer is paused" is true.
- Canvas gesture: `#maze-canvas` has `touch-action: none`. A drag shorter than 24 px does not move the Explorer.
- Stale Question responses: `loadChallengeQuestion` checks `questionRequestKey` after each await. It drops a late response for an earlier Run.
- Retry and Continue: a second activation uses the same `runId`, and the server returns `duplicate: true`.
- Atlas and Settings: the `atlasOpening` and `accessSettingsOpening` flags guard a second activation.
- Event ribbon: `showEvent` clears the earlier timeout before it sets a new one.
- Listeners: each listener in `src/main.js` attaches once at module load.
- Readout and Action rail: `updateInterface` runs after every transition. Pulse and Bell are disabled outside status `active`.
- Quest Level dialog: the `cancel` listener blocks Escape when the Explorer must choose a Quest Level.

### Front end: renderer

- Redraw: the board draws once per action through `updateInterface`. `tick` does not call `render`.
- Tiles: land tiles and water tiles round to whole pixels, so adjacent tiles leave no seam. The Coastline uses the same rule.
- Fog: the stipple pattern has a cache per Fog colour pair and device pixel unit. High contrast paints the Fog flat.
- Fog edge: the Coastline draws only between two revealed tiles. A node script shows that the board does not tell a wall from a passage in Fog.
- Pulse: the Pulse layer covers only tiles in `pulseVisible` and not in `revealed`, in one path.
- Gate: the colour test checks `open` before `sealed`, so a sealed open Gate draws the X and the Signal light.
- Trail Twists: each ruleset revision has one Trail Twist kind, so no Labyrinth draws two kinds.
- Grid reference: the largest Labyrinth has size 23, so the letters stay inside A to W.
- Mark scale: `readPalette` keeps a floor of 0.25, so `arc` never receives a negative radius.
- Region theme: `region-theme.css` changes no token that the renderer reads.
- Reduced motion: the renderer has no animation. The `is-hurt` recoil is CSS, and both reduced-motion rules cover it.
- Hidden state: `src/main.js` writes no Run state to `window`, `globalThis`, or a `data-` attribute, apart from the run mode and the region theme id.
- Tests: `tests/canvas-renderer.test.js` and `tests/run-replay-view.test.js` pass (67 tests).

### Front end: dialogs, landing page, Echo Atlas, and audio

- Active Run Recovery: a fuzz script loads the checkpoint 340 times in 24 Runs. Every load returns "recovered".
- Recovery validation: `load` rejects an oversize payload, an identity mismatch, unknown keys, a backward clock, and a terminal Run.
- Campfire Resume: `src/main.js` creates the view once, so the ids stay unique. Both buttons close the dialog.
- Fog and audio: `playEventSound` maps only events of the Explorer's own action. No cue exists for a Warden move in Fog.
- Audio opt-in: no `AudioContext` exists before the first click on the sound button.
- Echo Atlas and Quest Progress: the Atlas projection reads only the normalized record.
- Echo Atlas dialog: it pauses an active Run, resumes on close, and returns focus to its trigger.
- Run Replay dialog: Escape goes through `close()`. Focus returns to the opener. The dialog announces a corrupt Trail.
- Daily, First Light, Warden Challenge, and Quest Level dialogs: each one handles `cancel`.
- Corrupt storage: bad JSON in the Run Records key or the Quest Progress key gives an empty list or `null`.
- Landing page: `app.js` sets `inert` for the load and focuses the canvas only when no dialog is open.
- Daily Shared Labyrinth: a Daily Run neither writes nor scrubs the stored Quest checkpoint or the Active Run Locator.
- Dialog stylesheets: every dialog class has a `::backdrop` rule, a height cap of `100dvh`, and reduced-motion rules.

### Front end: Trail Compass

- Named exits: the exits match the engine in 62,840 states, with 0 mismatches.
- Fog: no Echo, Gate, or Warden in Fog reaches Describe Trail or Listen. The reveal set equals the renderer set.
- Warden Mode: each mode reaches Describe Trail under its canonical name (patrol, hunt, intercept, lured).
- Tide Doors: all Tide Doors change together, so `tideDoors[0]` gives the true phase.
- Signal Bells: each real Run on `warden-bells-v1` has 2 Signal Bells.
- Status text: pause, resume, an empty Pulse, and a wall bump each build a new event. The status does not repeat an old message.
- Time: `tick` does not pass through `transition`, so time does not trigger a status.
- Length: the longest status has 222 characters, and the longest Describe Trail text has 413 characters.
- Run actions: Describe Trail and Listen dispatch no Run action.

### Front end: browser crops

- Horizontal overflow is 0 at 375, 1280, and 1920 px.
- No control is smaller than 44 by 44 CSS px.
- The canvas backing store matches the device pixel ratio (662 px for 331 CSS px at ratio 2).
- The board is fully in view at each width.
- The one console error is the absent API under `vite preview` (HTTP 500). It is an environment limit.

### Back end: server validation

- SQL: every query in the lane uses parameters. The caller validates the one value that enters SQL text, `mode`, to `test` or `live`.
- Receipt forgery: `verifyReceipt` checks the ECDSA P-256 signature, and the server row is the authority.
- Receipt replay: one accepted row exists per Run. A second accepted submission returns the recorded result.
- Verified paths: the Daily route and the offline route take score, Moves, Echoes, and Wardens from the replay result.
- Warden count: `wardensDefeated` cannot exceed `config.wardenCount` in the casual validator.
- Body size: every POST route in the lane has a cap, from 4 KiB (Run Access) to 512 KiB (offline log).
- Terminal state: both replay paths reject an action after a terminal state and an action that does not change the Run.
- Daily seed: the server builds the seed and the config from its own date. A client value has no effect.
- Quest Progress: an offline Run advances the Quest only when the Quest, the Quest Level, and the Labyrinth Number match the current step.

### Game restrictions

- Objective Reachability: each Echo and the Gate are reachable in all shipped configs of the 6 current revisions (16,200 Runs).
- Determinism: two calls of `createRun` and two passes of a random action list give equal Runs.
- Vitality stays between 0 and `maxVitality`, and the Run Score equals the formula at each fuzz step.
- A Warden never stands on the Gate, on an uncollected Echo, or on another Warden at any fuzz step.
- A won Run returns the same object for each action type.
- The Run Replay round trip holds for 1,176 terminal Runs.
- `windways-v2` has 0 trapped seeds. The legacy trap of `windways-v1` matches ADR 0053.
- The ruleset mapping in `run-ruleset.js` has a red test for a changed revision.
- The server checks of terminal state and version in `server/run-replay.js` have red tests.
- Tactics Lab uses `echoCount: 0` with `persisted: false`. The open Gate at the start is by design.

### Harness

- Random values: no file in `tests/*.test.js` calls `Math.random`.
- Network: no unit test fetches a real host.
- Sleeps: only two real sleeps exist in unit tests, and both are in skipped integration files.
- Order: `fileParallelism` is false and one worker runs. No shuffled run exists, so order independence has no proof.
- Engine and replay verifier v2: a script finds no difference in 249 terminal Runs across 6 revisions.
- Vitest gate: it fails on worker loss, on a failed count above 0, and on a changed file, test, or skip count.
- Native crash retry: the wrapper retries the crash exit code 3 times at most and does not hide a test failure.
- Database lane: it refuses to start without its environment values and fails when a lane runs zero tests.
- Playwright config: `forbidOnly` is true and retries are 0.
- Pre-push hook: it runs the five steps in order and returns the status of the failed step.

### A-series status

- `tests/trail-compass.test.js`, `tests/legacy-windway-recovery.test.js`, and `tests/warden-behavior.test.js` give 18 passes of 19. The one failure is the Quest Runs case.
- `git log -S` confirms the commit of each change that has no test.
- A wall bump with the Trail Compass on gives the event "Wall. Choose another direction." and repeats no old message.
- A `ring-bell` action with no Signal Bell beside the Explorer returns the Run with no added Move.
- `git status --porcelain` is empty after every run of that reader.

## Totals

Kept findings by severity:

| Severity | Count |
| --- | --- |
| critical | 0 |
| high | 8 |
| medium | 37 |
| low | 106 |
| Total | 151 |

Kept findings by lane:

| Lane | Count |
| --- | --- |
| Front end | 84 |
| Back end | 20 |
| Game restrictions | 19 |
| Harness | 28 |
| Total | 151 |

- Reader rows: 162. Kept: 155. Refuted: 3. Duplicate: 4.
- Merged rows: 4. Each merge joins two Kept reader rows, so 155 Kept rows give 151 table rows.
- Game restrictions: 32. No red test: 9 (R-06, R-11, R-13, R-14, R-19, R-23, R-28, R-30, R-31).
- Game restrictions with a red test for only a part: 4 (R-03, R-08, R-09, R-21).
- Game restrictions with only an incidental red test: 4 (R-05, R-07, R-17, R-25).
- e2e flows: 19. The Offline Run flow has no spec on desktop and no spec on mobile.
- A-series: 5 Fixed, 2 Partly fixed, 47 Open.
