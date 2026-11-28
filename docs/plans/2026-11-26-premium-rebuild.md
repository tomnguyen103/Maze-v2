# Premium rebuild plan

Date: 2026-11-26. Slug: `premium-rebuild`. Owner mandate: "Rebuild Echo Maze as a premium web game".

This plan grounds each grill of the build run. It extends, and does not repeat, these inputs:

- `docs/audits/2026-11-26-full-game-audit.md` (B-01 to B-151, the status of A-01 to A-54, R-01 to R-32)
- `docs/audits/2026-11-25-game-logic-audit.md` (A-01 to A-54)
- `docs/research/2026-11-26-premium-web-game.md` and `docs/research/2026-11-25-adventure-game-properties.md`
- `docs/design/mockups/2026-11-26/scorecard.md` (the adopted direction is pilot-chart)
- `docs/plans/rebuild-v3.md` §5 and §6, `docs/plans/2026-11-25-adventure-game-logic-plan.md`, `docs/plans/premium-ui-rebuild.md`

The three older gates (`rebuild-v3.md`, the Held table of the 11-25 plan, issue #298) are inputs. They hold no work.

## 1. Verdict

Echo Maze stays one game: a deterministic route-plan maze game with a seeded Labyrinth, Fog, Wardens, and one Gate.

| Part | Verdict | Evidence |
| --- | --- | --- |
| Seeded generation, Run Action Log, server replay | Stays | R-04, R-10, R-12, R-22 go red on a break. ADR 0024 and ADR 0027 hold. |
| Quest ladder, Atlas Regions, one Trail Twist per Region | Stays | Research Q4: one new rule per Region keeps the load low. |
| Learning Questions in Quest and Class Play | Stays, with a new contact rule | A-07, A-20, A-43. Class Expedition depends on Questions. |
| Learning Questions in the Daily and in Classic Rules | Goes | A Question adds chance to a ranked board. Research Q4 rule 9. |
| Rules of the six current revisions | Rebuilt as generation 2 | 49 open A findings. Issues #282, #284 to #297. |
| Engine file `src/game/game-session.js` (1,937 lines) | Frozen as generation 1; generation 2 is a new module | A break of a stored Run Replay is the largest data risk. |
| Shell file `src/main.js` (5,455 lines) | Rebuilt as modules | B-150. The game chunk has no bundle headroom. |
| Renderer `src/game/canvas-renderer.js` | Rebuilt as layers | B-22 to B-24, B-81 to B-89, B-91 to B-95. Each Move repaints the full board. |
| Pilot Chart direction of `design.md` | Stays and is finished | Scorecard: 69 points, the lowest build cost. Issues #252 to #273. |
| Server validation by replay | Stays, with fixes | B-04, B-28 to B-32, B-108 to B-122. |
| Verified Daily best-entry rank | Goes; the first entry is final | A second try on a public seed is a plan with full knowledge. A-11. |
| Harness | Rebuilt first | 13 of 32 Game restrictions have no test that goes red (section 4 lists each). B-39 to B-45. |
| Payment and entitlement | Stays unchanged | Authority table. Section 2.6 pins it. |
| Platform (hosts, Stripe, Clerk, production data) | Outside this plan | Authority table. Section 8. |

Decision record: ADR 0055 (product identity).

## 2. Target architecture

### 2.1 Engine generations

- **Generation 1** is the engine of today. Slice E0a moves it, unchanged, to `src/game/engine-gen1/`. It serves the six current revisions and `windways-v1`.
- Before E0a, a slice edits generation 1 only where each golden log of H2 stays green (B-130, B-131 in H5; the helper move of E0p). From E0a, no slice edits it.
- Slice E0p moves four helpers that the shell and the server import (`actionAdvancedRun`, `normalizeSeed`, `openShortcutAcrossWall`, `explorerCanBeTrapped`) from `game-session.js` to one pure module of generation 1. The module freezes with generation 1 at E0a.
- E0d1 gives generation 2 its own copy of that module. The shell and the server reach each helper through the engine handle of the Run. A static test fails when a generation 2 file imports a generation 1 file.
- **Generation 2** is a new engine in `src/game/engine-gen2/`. It serves six successor revisions: `classic-v2`, `echo-hush-v2`, `windways-v3`, `echo-bridges-v2`, `tide-doors-v2`, `warden-bells-v2`.
- Slice E0d1 makes generation 2 as a byte-equal copy of generation 1. Its proof is a diff that shows changed import paths only. `game-session.js` holds 1,937 lines, so the copy is exempt from the split rule.
- Slice E0d2 turns each revision branch of the copy into a config value (`game-session.js:282`, `:288`, `:293`, `:302`, `:305`, `:608`, `:653`, `:656`, `:666`, `:767`, `:819`). The list holds examples; a static test of E0d2 finds no branch on a revision id in generation 2. It follows the 400-line split rule. A test-only parity revision gives generation 2 the config of a current revision. With it, generation 2 replays each golden log of H2 to the equal state hash.
- The parity revision test ends at E0e, the first slice that changes a result of generation 2.
- From E0e, generation 2 has its own golden logs. Each rule slice makes the logs again in its PR, and the gate test of the generated fixture compares them.
- E0e commits one manifest: each log id with its final state hash. Each rule PR commits one allowlist of the log ids that its rule can change. A gate script compares the manifest with `main` and fails on a changed id outside the allowlist. Each entry holds a log id and its slice id. The script honours only an entry that the PR adds or changes against `main`; an entry that `main` holds permits nothing. Z1 sets a frozen flag in the manifest. The script of E0e reads the flag from `main`; with the flag set, it fails on each changed id, whatever the allowlist holds.
- E0d2 also runs a differential sweep script: 10,000 seeds per revision give the equal final state hash on the two engines. The script is not a gate step; the receipt of E0d2 quotes its result.
- One table, `src/game/run-ruleset.js`, maps each revision to its generation. A stored Run names its revision, so the revision selects the engine.
- Each successor Labyrinth config row lives in `src/game/engine-gen2/`, outside the shared `quest-rules` chunk (`vite.config.mjs:46-47`). A static test fails when `run-ruleset.js` holds a successor Labyrinth config.
- Three client readers use the Labyrinth config with no engine: the two Question demand sums (`learning-decks.js:121`, `offline-deck-selection.js:165`) and the Daily Constellation size (`main.js:2311`). They keep the generation 1 table, and no slice changes a value that they read. E0e keeps the `size` and the `wardenCount` of each successor Quest row and Daily row equal to its generation 1 row, and a parity test of E0e compares each key. The Gate Warden of rule 10 is extra to `wardenCount`, so the demand sums do not count it. E6 owns that gap with one test: a generation 2 Quest Run raises each Challenge of its row and the Gate Warden, on each shipped Learning Deck, and each Challenge gets a Question. The server reader (`server/player-validation.js:296`) reads the row of the revision of the Run.
- Slice E0b adds the engine handle: one async function that returns the engine of a revision. Today `src/main.js:34-38` and each other importer of the repository import `game-session.js` directly; E0b changes each import to the handle or to a pure helper module. Boot creates its first Run at module evaluation today (`main.js:482`). After E0b, boot awaits the engine of the boot revision before it creates that Run, and the `data-game-ready` barrier covers the wait.
- The client loads one engine per Run. A failed engine load shows the retry notice of the play shell and starts no Run. The server loads the two engines.
- The offline cache holds each engine chunk. Continue Offline loads the engine of the stored Run through the handle.
- E0b changes `scripts/check-bundle-budget.mjs` and the chunk names of `vite.config.mjs`. Section 2.4 holds the budget rows.
- The preload filter names the generation 1 chunk. The switch of the preload to generation 2 is a parked step with the activation.
- Generation 2 has no branch on a revision id inside a rule. A revision differs by its config row only.

Decision record: ADR 0054.

### 2.2 Activation of generation 2

Each merge to `main` deploys production through the Vercel Git integration of the owner. Merged code must be safe on the production database of today.

- One server variable, `RULESET_GENERATION_2_FROM`, holds a UTC date. An unset variable means "off". Production stays unset during this run.
- The server has two states. **Accept** is on when the variable is set, the date is reached, and the start check gives "present". **Offer** is on when Accept is on and `RULESET_GENERATION_2_OFFER` is not `off`.
- A date in the past means "from now". The server does not rewrite a stored Run.
- Start check: the server reads the database and looks for the three changes of migration `0038`. The check has three results: "present", "absent", and "unknown".
- The read uses `pg_get_constraintdef` and `convalidated`, never a constraint name alone, as `db/inspect/migration-ledger.sql:109-114` does for `0037`. "Present" means: the score CHECK lists the six successors, and no CHECK of a Daily table limits `daily_version` to 1.
- The server caches "present" for the life of the instance and "absent" for at most 60 seconds. A unit test with a query double gets "absent", then "present" after the limit, with no restart.
- "Absent" leaves Accept off, which is the state of today. "Unknown" is a read error: a request that names a successor then gets a retryable 503, the server stores nothing, and the next request reads again. The offline queue keeps a submission after a 503. The online score route makes one attempt (`player-controller.js:273-295`), so an "unknown" read costs that one successor Score Entry; the Run Record stays on the device. ADR 0054 records the cost.
- ADR 0054 fixes the contract of the read: the exact catalog query and the definition text that it expects. E0c has a query-double case in which a database at `0037` gives "absent". The database lane runs the read against the applied `0038`.
- No in-memory store exists (`server/player-api.js:232` returns the unavailable API with no `DATABASE_URL`). Each unit test of a route or a store uses a query double, and the double answers the start check. The e2e suite mocks the routes, as today.
- The client names the revision of a Run, as today: a Score Entry, a receipt request, and an offline submission each carry `rulesetRevision`. The Run Grant stores no revision, and no migration changes `run_access_grants`.
- A choice between the two revisions of a Region gives no rank gain. Each Global Scoreboard partitions by Region and revision (`server/player-store.js:189`), and the server replays the Run on the engine of the named revision.
- One shared function, `acceptsRevision`, validates the revision of a request. It accepts a successor of the Region only while Accept is on. Each route gets the revision by its own rule:
  - Score route: the request names the revision. With the two revision fields absent, the revision is `classic-v1` of the Region, as today (`player-validation.js:312-345`; `normalizeKnownRunRuleset` at `:334`). With one field absent, the route answers 400, as today.
  - Receipt route: the request names a Quest revision. A missing revision and each Classic revision get a 400, as today (`offline-receipt-route.js:108-118`). E0c tests the two refusals.
  - Offline submission route: the request holds no revision field. The route reads the revision that the stored receipt binds (`offline-submission.js:285`).
  - Daily route: the request holds no revision field. The contract version gives the revision (N-20).
  - Global Scoreboard read: outside `acceptsRevision`. The read answers each partition that the code knows. A successor partition holds no entry until Accept is on, so the answer is an empty list. E0c tests it.
- Accepted generation 1 set, per route. The score route and the offline submission route keep the set of today. The receipt route accepts only a current revision of the Region and refuses a retired revision such as `windways-v1` for each Run (A-52, #294). An offline Run on a retired revision keeps its Run Record on the device and gets no receipt. ADR 0056 records this cost and the kept set of the score route.
- A revision that a stored offline receipt binds is not checked again at submission. A change of Accept between the receipt and the submission rejects no Run.
- E0d2 keeps the successors in a separate table that no normalizer reads. A static test proves that no normalizer imports the table.
- Invariant: no merge leaves a successor known to a normalizer with no guard. E0c lands each guard first, against the table that is not joined yet, each with unit tests. Those tests pass the table to the guard as an argument and start no successor Run. The first successor Run exists in the last PR. The last PR of E0c holds the join only, with the red proof of N-07.
- The field `rulesetGeneration` of `/api/access/config` holds the Offer state. While Offer is on, each new Run of the client starts on the successor of its Region. While Offer is off, each entry point of a new Run refuses a successor: the Run start, a guest start, an offline start, Play This Seed, and an Echo Postcard. One function gives the revision of a new Run, and each entry point calls it. A Retry or a Restart keeps the revision of its Run. A Play This Seed link and an Echo Postcard start on the revision that the link names, or on `classic-v1` with no revision (section 3). An Active Run locator keeps the behaviour of `12b7622` (`main.js:2649-2702`), with Offer on and with Offer off. With no checkpoint, a Run on the current generation 1 revision of its Region keeps its Run id and its revision. A Run on an older revision restarts one time on the current revision (ADR 0053). A successor is never "current" in that rule. E0c tests each case.
- Offer gates a new Run only. Active Run Recovery, the Active Run locator, and Continue Offline load each revision that the code knows, so a stored successor Run resumes while Offer is off.
- First Light and each Tactics Lab drill call `createRun` with no engine handle today (`first-light.js:38`, `tactics-lab.js:164`). E0b moves the two entry points to the handle. They stay on the generation 1 row of today, with Offer on also, until E7 lands rule 13. From E7 they follow Offer: with Offer off the generation 1 row, and with Offer on the successor row of rule 13. Findings B-129 and B-37 stay open on generation 1; ADR 0054 records them.
- An offline start uses the Offer state that the device stored last. A device with no stored state starts generation 1.
- The score body gains the field `runId` in V1; today it holds no Run id (`src/player/player-controller.js:274-290`). With enforcement on, the score route needs a Run Grant for that Run id, with the equal seed and Labyrinth, except under the Classroom rule of section 2.5. With enforcement off, no Run Grant exists and `acceptsRevision` is the only revision rule.
- A Run that starts with enforcement off has no Run Grant. When enforcement is on at its submit, the route refuses it with the code `run-grant-missing`, and the Run Record stays on the device. V1 tests this case.
- A Run that starts signed out has a guest admission and no Run Grant (`main.js:3182-3200`). When the Explorer signs in before the escape, the score route refuses that Run with `run-grant-missing` under enforcement, and the Run Record stays on the device. ADR 0056 records the rule, and V1 tests it.
- A Run in flight at activation finishes on its revision. `mustRestartOnCurrentRuleset` does not restart a generation 1 Run at activation.
- Rollback: the code that knows the successors stays deployed. The owner sets `RULESET_GENERATION_2_OFFER=off`. New Runs start on generation 1. Accept stays on, so a successor Run in flight still finishes and submits.
- Slice E0c ships the variables, `acceptsRevision`, the start check, and the config field. The e2e suite runs the Offer state on and off.

The Daily:

- A second variable, `RULESET_GENERATION_2_DAILY_FROM`, holds a UTC date. It has no default: with no value, each date is version 1. The owner sets a date after the current UTC date. The code cannot know when the owner set the value, so a value of today or of a past date changes the version of the current date. The guard of parked slice V3b keeps one version per date, and V3b holds that test. E0c tests the version function and the answers of the next lines. The parked order sets this variable last.
- The Daily names no revision today (`daily-labyrinth.js`, `daily-route.js`). E0c adds the map of the Daily contract: version 1 replays on `classic-v1`, version 2 on `classic-v2`. No other pair is legal (N-20).
- The Daily version of a UTC date is a function of that date and `RULESET_GENERATION_2_DAILY_FROM` only. It is 2 on or after that date, and 1 otherwise. No instance state changes it, so two instances never give two versions for one date.
- When the function gives 2, the Daily submit answers a retryable 503 unless Accept is on. The board read of that date answers an empty board with status 200 in that case. E0c tests the two answers, and it tests two instances with different Accept states: they never store two versions for one date.
- The Daily does not follow Offer. The function above is the one source of the version: the config field and the two server callers use it. A version 2 date with Accept off gets the 503 above, so no version 2 entry exists while Accept is off. That state is a configuration error: the parked order sets the Daily date on or after the Accept date. N-07 does not cover the Daily start, because the Daily has its own variable. `RULESET_GENERATION_2_OFFER=off` does not change the Daily; the Daily rollback below does.
- `/api/access/config` gains the fields `dailyVersion` and `dailyDate` for the current UTC date. `createDailyContract` gains a version argument (`daily-labyrinth.js:56` holds `version: 1` today), and the client builds the contract of that version (`main.js:755`, `:2193`). The server builds the contract at `server/daily-route.js:116` and `server/player-api.js:322`, and E0c gives each call the version of the date. With no field, the client builds version 1.
- The client starts a Daily with a config whose `dailyDate` equals its own UTC date. Otherwise it fetches the config one more time. When the fetch fails, or the dates still differ, the client builds version 1 from the device date, as today. An offline Explorer and an Explorer with a wrong clock therefore still start a Daily. The server refuses a wrong version with the reload message. E0c tests the failed fetch and the date difference.
- `saveDailyResult` accepts the contract version of the date (`daily-labyrinth.js:127-129` compares with version 1 today). The Daily Record keeps its storage format, version 1 of key `echo-maze:daily-records:v1`. E0c tests that a version 2 result saves and loads.
- The insert of the Verified Daily binds `daily_version` as a parameter today, so E0c changes no SQL statement. The CHECK of `0038` permits the value 2.
- A client that sends the wrong version for a date gets a refusal with a reload message, and the server stores nothing.
- A date never holds two revisions. The insert of V3b refuses an entry whose contract version differs from a stored entry of the date. The guard and the insert share one lock on the date; the lock of today is per Explorer and date (`server/daily-store.js:95-100`), so it does not cover two Explorers. V3b tests two concurrent entries with two versions: the store keeps one version. The database lane applies `0038` before this test, because `0018` holds `CHECK (daily_version = 1)`. The receipt shows the test red with the guard removed.
- Daily rollback: the owner sets a later Daily date. The next date returns to `classic-v1`. A date that holds `classic-v2` entries closes for a `classic-v1` entry until the UTC day ends.

Migration `0038` (one file, slice Z1) holds three changes on three tables:

1. The Global Scoreboard CHECK lists the six successors.
2. `verified_daily_submissions` accepts `daily_version IN (1, 2)`.
3. `verified_daily_entries` accepts `daily_version IN (1, 2)`.

The two Daily CHECKs have no stated name (`0018:9-10`, `:33-34`). `0038` finds each by its definition, drops it, and adds a named CHECK. The file follows the pattern of `0037`: `lock_timeout`, `NOT VALID`, then `VALIDATE`, with no transaction. Its header states that it runs after `0037`. Z1 leaves `tests/migration.test.js:17` unchanged. It adds a text test of `0038` and the ledger row that `tests/migration-ledger.test.js:74-76` needs.

Parked steps, in fixed order: write the file `0038`, run the database lane, which applies `0038` on its test database, merge V3b, apply `0038` to production (PARK 2), set `RULESET_GENERATION_2_FROM` in production (PARK 1), then set `RULESET_GENERATION_2_DAILY_FROM` in production (PARK 1).

### 2.3 Renderer

- Canvas 2D stays. The renderer takes one host element and owns three stacked board canvases: the chart layer (Land, hatch, Passage, Coastline), the Fog layer, and the mark layer (Explorer, Wardens, Echoes, Gate, Twists).
- The Neatline keeps its own canvas at frame size, as today (`canvas-renderer.js:297-307`, `index.html:209`). The renderer owns it. The flatten function reads the three board layers only.
- Invariant: the renderer and the Trail Compass draw from Run state only, and a generation 2 field that a Run lacks draws no mark. So each R slice works on a generation 1 Run and on a generation 2 Run.
- The mark layer is the top canvas. It holds the focus, the accessible name, and the pointer input of the board.
- The chart layer paints one time per Labyrinth, per palette change (theme, contrast, mark scale), and per change of the backing-store size. The Fog layer holds the Memory dot; it paints when the known set or the in-sight set changes. The mark layer paints on each action.
- Tile rule at 375 px: a size 15 board is wider than its frame and scrolls inside it. After each Move the frame scrolls the Explorer tile into view. A swipe on the board stays a Move (`src/daylight.css:523` sets `touch-action: none`), so no touch gesture scrolls the board. The Neatline stays at frame size, and the renderer paints its ticks again from the scroll offset. The document never scrolls sideways. R4 owns this rule (B-10).
- The renderer exports one function that flattens the layers to one image. Run Replay (`run-replay-view.js:229`) and the e2e pixel reads (`daily.spec.js:272`, `game.spec.js:7098`) use it. R1 changes those callers and `canvas-renderer.test.js`.
- Motion lives in one lazy chunk with its own budget row. The play screen works without the chunk. Under `prefers-reduced-motion: reduce` the game does not load it. The reduced-effects value of Access Settings also stops the load (B-84).
- The renderer reads each colour from `tokens.css`. A missing token is an error in a test, not a silent fallback (#255).

Decision record: ADR 0057.

### 2.4 Play shell

- `src/main.js` becomes a small entry. It holds 5,455 lines and 96 top-level `let` fields today (the Run at `:482`), with about 1,140 references to those fields.
- Slice S1 moves each field out of module scope, in PRs of at most 400 changed lines: S1a (helpers), S1b (audio and input), S1c (Run state), S1d (each other field).
- The minifier shortens 92 of the 96 names today and does not shorten a property name. A context object can therefore add bytes. S1a starts with a spike: it moves 10 fields to a context object, records the gzip change of the game row, and scales the result to 96 fields.
- Invariant of S1: each S1 PR keeps the game row inside 42 KB with no raised row. Where the spike shows that the object breaks the invariant, S1 keeps each field as a module-scope `let` in a state module with exported accessors. The acceptance tests of S1 hold for the two forms.
- Slices S2 and S3 move each block of `main.js` to a module under `src/game/shell/`. They change structure and no behaviour. S2 holds the Run lifecycle, the Daily, the offline bridge, and the Atlas and Replay openers. The first PR moves the `elements` map, `canvas`, and `renderer` to one shell module. S3 holds the Challenge dialog, the Echo Lens, the HUD, the Lifetime block, the Quest block, and the access block.
- Import direction: a shell module never imports `main.js`, and a static test proves it from the first PR. So a block moves only when each function and each constant that it reads has moved, or moves with it. The ticket stage derives the PR order from the call graph. Blocks that call each other move in one PR. S2 and S3 name the two review batches of that order, not a fixed order of features.
- A top-level statement moves verbatim to its module, with each binding that it reads at construction (`main.js:524-527`). Where two moved statements depend on their order, the module of the later one imports the module of the earlier one. The e2e suite proves the result.
- Invariant of S2 and S3: each top-level statement of `main.js` has one owner slice, S2 or S3. At commit `12b7622` those statements are lines 147 to 5455. After S3 a static test proves the invariant: `main.js` holds imports and the boot call only. It names these blocks also: the `elements` map (`:236-406`), the input listeners, the audio loaders, Settings, First Light, the Lantern Journal and the Workshop, the level picker, and Records.
- Lines 1 to 146 hold the imports (`:1-124`), nine `let` fields (`:126-136`, which S1 moves), and the typedefs. With the `elements` map they hold 317 lines today. So the `elements` map moves to a module, and each import of a moved block leaves with its block.
- After S3, `main.js` holds at most 300 lines. The test identity list of H3, the bundle check, the golden logs, and the e2e suite prove each move.
- Four tests read the text of `src/main.js`: `tests/audit-correctness.test.js:301`, `:319` and `tests/audit-accessibility.test.js:146`, `:168`. S1 moves no file, so the four tests pass unchanged in S1a to S1c.
- The test at `audit-correctness.test.js:301` asserts literals of the Atlas guard (`:310-313`). S1d can change each of those literals that the state form breaks. The title stays, and the PR shows the test red against the removed guard.
- A slice that moves the code changes the file path of its test in the same PR: S2 for the two Atlas tests, and the slice that owns the keydown and the skip-link wiring for the two accessibility tests.
- Unit: the gate divides gzip bytes by 1024 and prints the result as KB (`check-bundle-budget.mjs:133-135`). Each size of this plan uses that unit.
- Measure of 2026-11-26 (`npm run build` and `npm run check:bundle` at commit `12b7622`): the game row holds 42,931 of 43,008 bytes (41.92 of 42 KB), so 77 bytes are free. The main chunk holds 31.31 KB, the engine chunk 5.90 KB, and the renderer chunk 4.71 KB. `src/main.js` gives about 23.65 KB of the main chunk.
- `main.js` calls `createLifetimeView` (`:554`), `resolveDailyRequest` (`:408`), and `createAccessSettingsContinuity` (`:534`) at module evaluation. A lazy import frees only the part that no boot path and no Run-start path calls.
- Slice S0 comes in M0, before a slice adds shell code. It defers the Lifetime view until the view opens. Its ticket starts with a spike measure of the bytes that the deferral frees. Where the spike shows less than 0.5 KB, S0 also defers the next largest view that opens outside a Run. S0 defers no part that a Run in flight needs, so the Challenge dialog stays in the shell. Each chunk of S0 has the tests of S4: a delayed import shows the wait state, and a failed import shows the retry notice.
- Slice S4 makes these parts lazy chunks: the Daily start (`daily-labyrinth.js` and the Daily module of S2), Access Settings Continuity, the demo, First Light, and the Lifetime module of S3. The module sizes of the source map (0.87, 0.60, 0.20, 0.18, and 0.86 KB, in list order) are upper limits; the boot part of each module stays in the shell. S4 is a logic slice with its own e2e tests.
- S0 already defers the Lifetime view, so S4 counts the first four parts only. They and the 77 free bytes give at most 1.92 KB, which is below the floor. A module of S2 or S3 that `main.js` imports statically stays in the main chunk and frees no byte.
- S4 therefore also makes lazy each function that no boot path and no Run path calls. Candidates are the Workshop and Lantern Journal views, the Verified Daily board, the Atlas and Replay openers, and the Records view. The ticket of S4 lists each function with its callers from the call graph. A function with a boot caller or a Run caller stays in the shell: `syncPracticeOffer`, `recordCurrentSkip`, `closeDailyDialog`, `returnToQuest`, and each top-level listener are examples. The plan gives no byte estimate for those blocks; S4 measures them from the source map.
- Run Access stays in the shell, because each Run start needs it. Quest Continuity and the Echo Lens are lazy today.
- S4 starts with a new measure after S3, when the Daily and Lifetime blocks of `main.js` are modules. The plan of S4 records each size.
- Headroom floor after S4: `npm run check:bundle` shows at least 3 KB free in the game row of 42 KB. The floor is that one measure. A part that leaves the game row counts in the Run start shared row or in its own row (rules below). When the measure shows less, S4 makes the next largest block lazy, until the floor holds.
- Where no block is left and the floor does not hold, S4 records the measured floor. M4 starts in each case. A slice that cannot fit first makes its new shell code lazy. A slice that still cannot fit does not merge, because the 42 KB gate fails its push. The final report lists it as parked with its measure.
- S1, S2, and S3 keep the game row inside 42 KB. Where a PR of those slices cannot fit, one part of S4 that needs no module of S2 or S3 lands before it as its own PR, with its e2e tests. S4 then holds the other parts.
- Budget rows. A row lands in the slice that makes its chunk:
  - The game row keeps 42 KB. It sums the main chunk, the renderer chunk, and the larger of the two engine chunks. E0b adds a larger-of-group option to the script, and the two engine chunk names share no prefix. The group holds one engine until E0d1 makes the second chunk.
  - E0b adds the renderer row of 6 KB. E0d1 adds the generation 2 engine row of 7 KB and puts the two engines in the group. R3 adds the motion row with the motion chunk.
  - The generation 1 engine holds 6,043 gzip bytes today, so the 7 KB row leaves about 1.1 KB for new engine code. Exit: a rule slice that exceeds the row moves generator code (the validator, the fallback, the par search, and the config rows) to one chunk, "generation 2 generator". The chunk loads with the engine at the Run start and has its own row, outside the Run start shared row. No later slice raises that row. The row limit is its first measure plus 10%, and an addendum of ADR 0054 records the two numbers. E0e starts with a spike measure of that code.
  - One new row, "Run start shared JavaScript", sums the static import closure of the main chunk outside the game row and the landing row. Today that closure holds 13 chunks and 28.96 KB (`question-bank` 12.48 KB, `quest-rules` 5.63 KB, and 11 more). The limit is the measure of E0b plus 5%.
  - A lazy chunk that one Run kind needs at its start joins that row or has its own row.
  - One e2e test records each JavaScript request up to `data-game-ready` for a Quest Run, a Daily Run, and the demo. It fails when a requested chunk sits in no row other than "Other JavaScript".
- Byte allotment per milestone, counted on the whole game row (shell, renderer, and the larger engine): M0 adds at most 0.3 KB after S0. M1 ends with the free measure F of S4. M2 and M3 add at most 10% of F each; M4 and M5 add at most 40% of F each. The 42 KB row is the gate in each case. A slice that exceeds its allotment first makes one more part lazy.
- The growth of the generation 2 engine and of the layered renderer draws from the allotments of M4 and M5. Each ticket of E1 to E7 and of R1 to R3 states its measured bytes. The renderer chunk holds 4.71 KB today and counts on the game row. E0b adds the renderer row as a second limit. R1 starts with a byte spike of the layer skeleton. The forced-colors palette, the legend, and the flatten step can each be lazy when the row does not hold.
- No slice raises a budget row to pass. One correction exists: H3 makes the script sum each match of a prefix (it takes the first match today, `:113-118`). A row that measured one of two chunks then gets its true measure as the limit, and the receipt of H3 states each such row (B-40).
- The game styles row holds 5.52 KB of its 6 KB today. R6 starts with a measure of that row, and each R ticket that changes CSS states its bytes for the row that it changes.

### 2.5 Server validation

- The score route takes the Run Action Log of the Run, replays it on the engine of its revision, and stores the score of the replay. A client score is never stored (B-04).
- A Run on the score route submits Run Action Log v2. An answer entry holds the Question Revision id and the selected option, and no content (`run-action-log-v2.js:8-14`). The table gives the log of each Run kind. A Run kind with no row submits nothing.

| Run kind | Log today | Log after V1 | Capture site | Durable store | Submit route | Validator |
| --- | --- | --- | --- | --- | --- | --- |
| Quest Run or Classic Rules Run of a signed-in Explorer that escapes online | none | v2 | `transition` (`main.js:3869-3888`); V1 adds the append | Recovery envelope (`active-run-recovery.js:159-163`); V1 adds the key | `/api/scores` (`main.js:4657-4659`, `player-controller.js:269`) | The v2 replay (`server/run-replay.js:199`); V1 adds the call |
| Class Play Run | none | v2 | As the row above | As the row above | `/api/scores` with the Classroom header (`player-client.js:63-65`) | As the row above |
| Daily Run | v1 | v1, unchanged | `main.js:3879-3880` | none: the log lives in memory | The Daily route (`main.js:4958-4980`) | `verifyRunReplay` (`server/daily-route.js:212-216`), which accepts v1 only (`server/run-replay.js:435`) |
| Run that ends offline | v2 | v2, unchanged | `offline-continuity-controller.js:484` | Offline envelope under `OFFLINE_ACTION_LOG_KEY` (`:412-416`) | The offline submission (`player-controller.js:237`) | `verifyOfflineRunReplay` (`server/offline-submission.js:410`) |
| First Light Run, Tactics Lab drill | none | none | none | none | none | none |
| Run of a signed-out Explorer | none | none | none | none | none (`player-controller.js:270-272`) | none |

- The server selects the content pack of the Region, checks that each Question Revision id belongs to it, and resolves the answer with the Question service. A log with a forged `correct` outcome gets no Score Entry.
- V1 adds one capture module for the first two rows. It appends with `tryAppendRunActionV2`, the function that the offline capture calls. V1 changes no line of the Daily capture, of the offline capture, or of the offline envelope. The Daily keeps log v1 in each generation: its route replays log v1 only. The ticket of V1 starts with a byte measure against the allotment of M3; above it, the capture module is a lazy chunk.
- A Run with an offline receipt appends to two stores: the capture log and the offline envelope (`main.js:3875-3888`). The state at the terminal action selects one route (`main.js:4630`, `:4657`). A Run that ends offline submits the offline envelope through the offline submission. A Run that escapes online submits the capture log through the score route. No Run submits to the two routes.
- V1 adds two handler tests with a query double and one client unit test. None is an e2e test. The Daily capture output of a golden Daily Run passes the Daily handler. An offline Run ends, a new controller reads the same storage, and its submission passes the offline handler with the complete log. A Run whose offline envelope write failed on quota ends online, and the body of its score request holds the complete capture log.
- The capture module stores its log in the Recovery envelope, in the write that stores the checkpoint (`active-run-recovery.js:159-163`). A Run that Campfire Resume restores continues that log. V1 adds one optional key to `ENVELOPE_KEYS` (`:62-67`), and the envelope keeps version 1. Each scrub path of Recovery deletes the log with the envelope. ADR 0056 amends ADR 0025 on one term: the selected option of a resolved Challenge now stays in the Recovery envelope until the Run ends. The offline envelope holds each selected option of an offline Run today. A bundle from before V1 refuses the new key and scrubs that Run (`:641`); ADR 0056 records the cost. The log counts inside the Recovery bound of 2048 actions and 256 KiB (`:13-14`), so Recovery can turn off earlier than today; the log in memory still submits. An envelope from before V1 holds no log: that Run resumes and gets no Score Entry, and ADR 0056 records the cost.
- The server binds no Question order for a Quest Run. A changed client can choose which Question of the pack answers a Challenge. ADR 0056 records this limit; backlog item 1 holds the server record of a Run start that closes it.
- A Run with no complete log gets no Score Entry: a Run that Active Run Recovery restored with no log, and a Run above a limit of the replay. The limits of log v1 are 1024 actions and 64 KiB; the limits of log v2 are 4096 actions and 512 KiB; each has 4 hours of elapsed time (`run-action-log.js:2`, `run-action-log-v2.js:47`, `server/run-replay.js:22-27`). A Run that sends log v2 uses the limits of v2.
- Active Run Recovery has its own limit of 2048 actions (`active-run-recovery.js:13`). The Run Record stays on the device. The shell says so at each limit. P2 keeps Campfire Resume at the limits (B-75), so M2 comes before M3.
- Elapsed time stays a client claim inside the 4-hour limit, and each Global Scoreboard keeps its order by elapsed time (`player-store.js:182`). ADR 0056 accepts B-110: a change of the order is a SQL change. V1 lowers the 24-hour limit of `player-validation.js:275` to 4 hours.
- The client of V1 sends the log. A request in the old shape gets a refusal with the code `client-outdated` and a reload message. The server stores nothing. A cached old client loses that one Score Entry; the Run Record stays on the device. ADR 0056 records this cost.
- PR order of V1: the first PR is the server. It accepts the old shape and the new shape, and it raises the body limit of the score route from 16 KiB (`server/player-route.js:19`) to the log limit. The second PR is the client capture and the new body. The last PR holds the `client-outdated` refusal.
- With enforcement on, the score route needs a Run Grant for the Run id of the body (B-31). A request with a Classroom header keeps the rule of `12b7622`: the route reads the Classroom context (`server/player-route.js:255`) and asks for no Run Grant. The client sends that header while the Explorer has a selected Classroom (`src/player/player-client.js:63-65`), so the rule covers each Run of that Explorer. A check of the Classroom Run Grant needs a statement by Run id, and the key of `classroom_run_grants` starts with the Expedition (`0021:111-124`). That statement is new SQL, so the check is the parked slice V1b. Until then a request with a valid Classroom context passes with no grant check. Its Score Entry holds a Classroom id and stays off the personal boards (`server/player-store.js:187`). ADR 0056 records the gap. Section 2.2 holds the revision rule and the Run id field.
- A Run type that needs no Run Grant today (the Daily, First Light, Tactics Lab) keeps its route and its rule.
- A Run Action Log with an impossible action, a no-op action, or an action after the terminal state is rejected in v1 and v2 (R-11, R-13, R-14).
- An offline receipt request names a current revision of its Region, or a successor under `acceptsRevision`. Section 2.2 holds the accepted set.
- The Verified Daily stores the first valid entry of an Explorer for a date. V3c changes one rule in JavaScript: a candidate improves only when the Explorer has no stored entry for the date (`server/daily-store.js:139-145`). The store reads the stored entry under its lock per Explorer and date (`:95-100`), so two concurrent entries of one Explorer store one. V3c changes no SQL statement. The response keeps each field of today, with no new field. A later entry returns status 200, `bestResult: "unchanged"`, `improved: false`, and the stored entry. The rule covers each date from the merge of V3c, in version 1 also. A stored entry stays as it is.
- The server sees a Daily Run only at the submit, and the route stores an escape only (`daily-route.js:218-222`). N-08 therefore makes the first escape final. An Explorer can play the Daily again after a defeat, and a changed client can hold back an escape; backlog item 1 closes those gaps. ADR 0056 records this limit.
- One shared constant holds the UTC day boundary of the Daily. The client copy of V3c says that the first escape is final, before the Run starts. The device Daily Record keeps the best result of the device (`daily-labyrinth.js:147-163`), so the Daily dialog labels it "Best on this device" for a signed-in Explorer. V3c tests the label.
- The Daily board key holds no revision column. A date has one revision.

SQL rule: no local database exists, so no test runs a SQL statement before a merge that deploys production. A slice with a new or changed SQL statement parks with the database lane. One exception exists: the read of the start check, whose failure leaves Accept off. A slice that changes store logic in JavaScript only tests with a query double. A slice can add a call of an unchanged statement (B-111).

Decision record: ADR 0056 (supersedes the best-entry rule of ADR 0024).

### 2.6 Entitlement pin

What a paid Explorer owns today: unlimited new Personal Run starts after 3 free Runs. The Daily, First Light, Tactics Lab, offline continuation, and one guest Run are free. No gameplay part is paid.

- Slice H6 adds one pin test. It asserts each row of that list against `server/run-access-store.js` and the access routes, with enforcement on and off.
- The pin holds the rows of an Explorer with a Lifetime Membership in good standing and of an Explorer with free Runs. No slice changes those rows.
- The pin test is a protected path for each later ticket. A slice that changes its expected values is outside this plan.
- V3a changes one row outside the pin: a refunded or disputed Explorer keeps the free Runs that remain (B-118). ADR 0056 records it, and V3a adds this row to the pin test.
- The receipt key (B-115) goes to the backlog list. ADR 0056 accepts B-117: a refunded Explorer keeps each Run that was registered before the refund, because an expiry rule conflicts with the offline window.
- Generation 2 adds no paid gate. A paid Explorer starts a generation 2 Run under the same Run Grant rule.

### 2.7 Harness

- `engines.node` stays `22.x`, the version of the production host. The gate script holds its own constant for the local range, `>=22.23 <27`, and stops with a message outside it.
- The Vitest runner sets `--no-webstorage` where the Node version needs it (B-06). This machine has Node 26 only; the run on Node 22 is a parked step.
- Golden Run Action Logs: at least three logs per current revision, with a state hash at each tenth action and at the end (B-07). One log per Signal Bells revision holds a `ring-bell` action (B-135).
- A static test bans `Date.now`, `Math.random`, and `new Date()` with no argument inside the two engines (R-04).
- H3 pins test identity: one committed list of each test file and title. A renamed, removed, or added test fails the gate until the list changes in the same PR (B-138).
- H3 also closes two holes of the bundle gate. The script sums each chunk that matches a prefix, and it counts two chunks of equal bytes one time, so a retry copy of a chunk adds nothing (B-40). The compare ignores the `sourceMappingURL` line of each chunk. One new row, "Other JavaScript", sums each chunk that no other row holds; its limit is the measure of H3 plus 5% (B-41).
- A slice that moves a chunk from "Other JavaScript" to another row sets the limit of "Other JavaScript" again: the new measure plus 5%. The receipt quotes the old limit and the new limit. The limit never goes up in that step.
- Each generated fixture has a gate test that makes the output again and compares it with the committed file.
- Each Game restriction of section 4 has enforcement code and one test. The slice named in section 4 shows the test red with the guard removed, and the PR receipt quotes the red output.
- `npm run test:e2e` joins the pre-push gate as the last step of the hook. Since #331, the e2e build writes to `dist-e2e/`, so `dist` keeps the production build (B-142). `npm run check` stays unchanged. The pin test of the hook then expects the steps of `npm run check` and `test:e2e` last; its title changes, so H4 changes the identity list of H3 in the same PR. One e2e pass runs against the production bundle (B-43 to B-45).
- Gate time: H4 records the time of each gate step on this machine. A slice keeps `npm run check` below 15 minutes and `npm run test:e2e` below 20 minutes.
- B-149: two files take 376 s of the unit run. H3 moves the exhaustive cases of `tests/no-soft-lock.test.js` and `tests/warden-behavior.test.js` to a sweep script. H3 sizes the gate sample of each file from a measure: at most 30 seconds per file, stated in Runs. The target for the unit run is 4 minutes on one worker.
- H2 lists one named mutation per rule family (Move, Fog, Pulse, Warden, contact, Twist, score), and each mutation turns a golden test red.
- Each E slice states the gate seconds that it adds, and keeps them below 20. An exhaustive search or a par search above that size runs in the sweep script of the slice.
- A seed test in the gate uses 200 seeds per revision. Each rule slice also has a named sweep script with 10,000 seeds or Runs. The slice runs the sweep one time, and the PR receipt stores the result.
- The database integration lane needs a PostgreSQL database. This machine has none. Section 8 parks the lane and each step that depends on it.

## 3. Rule changes

Each rule change lands in generation 2 only. The six successor revisions carry all fifteen changes. ADR 0054 records the generation; one ADR records each rule slice, and an addendum of ADR 0054 records E7.

| No. | Rule change | Slice | ADR | Findings |
| --- | --- | --- | --- | --- |
| 1 | Fog reveal uses line of sight, radius 2. A wall blocks sight. A seen tile stays on the map as "remembered". | E1 | 0058 | A-05, A-25, #287 |
| 2 | The generator opens loops in proportion to size. A validator checks each Labyrinth; a failed seed retries with a derived seed, at most 16 times. After 16 retries the generator returns the plain fallback Labyrinth of the seed and size: one perfect maze with no Twist. ADR 0059 exempts the fallback from R-30, N-01, N-16, and N-17, and the Run carries a fallback mark. | E0e, E2 | 0054, 0059 | A-13, #289, #297 |
| 3 | Twist counts scale with size. No Echo sits next to the start. Echo placement rewards a longer route. The Gate sits in a dead end in at most the share of the config row. Each Echo Bridge saves more than 3 tiles of route. | E2 | 0059 | A-10, A-30, A-47, A-50, #288, #290 |
| 4 | Each Warden shows its next Move one action before the Move. The Move equals the telegraph, and the shown mode equals the acted mode. An Echo Hush and a Bell ring change the telegraph in their own action, and the Warden acts on the new telegraph from the next action. A Patrol Warden with a free neighbour tile moves. Pursuit distance uses the graph without the reserved tiles. A Warden spawns beyond the Intercept radius. A Warden can enter a locked Gate tile where the Explorer stands. | E3 | 0060 | A-02, A-06, A-41, A-49, A-54, #285, #295 |
| 5 | A Bell Lure moves Wardens away from the Explorer route, and the Lured mode ends with the Lure. | E3 | 0060 | A-21, A-37, #291 |
| 6 | A Windway carries by travel direction. After a carry, the last direction is the carry direction. A Warden does not stand on a Windway source. | E4 | 0061 | A-04, A-38, A-51, #284 |
| 7 | The Tide Door phase comes from the seed, not from tile parity. A bump that makes no Move does not flip the phase. | E4 | 0061 | A-03, A-23, #286 |
| 8 | A Pulse reveals tiles to the map memory, also behind a wall. The Pulse count scales with size. A Pulse with no effect is refused. | E5 | 0062 | A-24, A-28, A-29, #296 |
| 9 | Contact costs exactly 1 Vitality and returns the Warden to its spawn. In Quest and Class Play a correct answer cancels the cost; a wrong answer and a Skip each keep the cost of 1. | E6 | 0063 | A-20, A-43 |
| 10 | The Daily and Classic Rules hold no Question. The Gate Warden exists only in Quest revisions and is extra to the Warden count. | E6 | 0055, 0063 | A-08 |
| 11 | Score: escape gives `1000 + 100 × Vitality − 10 × max(0, Moves − par)`, floor 500. A defeat has no board score, as today. Par is the shortest route that collects each Echo and reaches the Gate. | E6 | 0063 | A-20 |
| 12 | Labyrinth config (size, Echo count, Warden count, Twist counts, Hunt distance, Pulse count, Vitality) is a row. Each later slice adds the fields of its rule: E2 the par band, the loop band, the route share, and the dead-end share; E3 the Intercept radius and the spawn minimum. The row key is the revision, the Quest Level, and the Labyrinth Number, so a band can differ inside itself. Seed normalization is part of the revision: its output matches the stored seed pattern of `0024:32`, and an empty or over-length seed is refused, never cut. A Run holds exactly the counts of its row. | E0d2 (structure), E0e (values) | 0054 | A-12, A-31, A-53, #293, #297 |
| 13 | First Light and each Tactics Lab drill get a config row under the successor key of their Region: `first-light` and one key per drill. They are rows of the six successors, not more revisions. Each row holds its own size, Intercept radius, spawn minimum, and par band. A row with 0 Echoes has 0 Echo Bridges. Each row holds a Question flag: the `first-light` row and each drill that teaches a Challenge set it, and N-05 exempts a row with the flag. A Run of such a row submits no Score Entry. | E7 | 0054 | B-37, B-129 |
| 14 | An action reports each of its events in order; a Challenge event replaces no Echo event. `provide-question` needs a Challenge with no Question, and keeps the Hint state. | E6 | 0063 | A-27, A-39 |
| 15 | A Pulse clears the last direction, so Intercept aims at the Explorer tile. In the action where a Twist carries the Explorer, no Warden makes contact. | E3, E4 | 0060, 0061 | A-46, A-48 |

Rule 11 keeps the Gate rule: the Gate opens only when the Explorer has each Echo (R-25). A-09 is accepted in ADR 0063: each Echo stays required. Rule 11 drops the constant Echo term, so route length ranks an escape. No Vitality recovery is added (A-44, accepted in ADR 0063). A Skip and a wrong answer keep the equal cost of 1 (A-07, accepted in ADR 0063).

Rule 13 and the size of First Light: the generation 1 engine clamps a size to 9..25 (`game-session.js:1204`), so First Light is a 9 by 9 board today. Its Warden spawns at path distance 9, and the Intercept distance of 10 (`game-session.js:197`) exceeds that spawn distance. E7 starts with a spike: it generates the `first-light` row and each drill row on generation 2 and records par, the longest path, and the retries. The spike result fixes the size of each row; 7 by 7 is the target for First Light, not a fact.

The score range of rule 11 is 500 to 1,900. It fits the stored CHECK of 500 to 3,500 on `score_entries` and on the Daily tables, so no range migration is needed.

Order inside M4: E4 comes before E2, because rule 6 and rule 7 change routes and E2 sets par. Each slice that changes the generator or the validator (E2, E3, E5, E6, E7) runs the seed sweep of E2 and the soft-lock sweep of E4 again. Each slice after E3 that changes a Warden Move or the generator (E5, E6, E7) also runs the telegraph sweep of E3 again. Par counts Moves on a route with no Pulse.

### Migration for stored data

| Data | Rule |
| --- | --- |
| Run Replay | No rewrite. A Run Record holds its `rulesetRevision` (`storage.js:300-335`), and its Replay replays on that revision. A Record with no revision replays on Classic Rules (`run-ruleset.js:100-109`). Golden logs prove it (N-06). |
| Run Record | No rewrite of a Record. A Record keeps its revision and its generation 1 score. The read path of P2 accepts the stored list of today and a Replay with no owner. The Records page labels the generation. |
| Global Scoreboard | Partition by revision exists. Migration `0038` adds the six successors to the CHECK. Old rows stay in their partition. |
| Class Play scores | Same table and the same CHECK. A Class Play Run names its revision under `acceptsRevision`. |
| Verified Daily board | Migration `0038` allows contract version 2. A date before activation is a `classic-v1` board. First-entry rank applies to new inserts; stored rows stay. |
| Daily Record (device) | No rewrite. The storage format stays version 1. A Record of a version 2 date saves and loads (section 2.2). |
| Run Grant | No change. A grant holds the Run id, the seed, and the Labyrinth, and no revision. |
| Offline receipt | No format break. A receipt of a generation 1 Run verifies on generation 1. |
| Echo Postcard | No format break. A Postcard names an exact revision and starts the Run of the recipient on that revision (`GLOSSARY.md:444-448`). A generation 1 Postcard starts a generation 1 Run after activation. A successor Postcard shows a notice and starts no Run while Offer is off. |
| Play This Seed | A stored link names its revision and starts a Run on that revision, under the Offer rule of section 2.2. A link with no revision stays `classic-v1`, unchanged from `12b7622` (`main.js:5225-5245`). E0c tests such a link with Offer on and with Offer off. |
| Quest Progress | No change. Progress counts Labyrinths, not revisions. |
| Active Run Recovery | The stored Run keeps its revision and its engine. Recovery loads the engine of the revision through the handle. |
| In-flight Run | A Run finishes on its revision (section 2.2). |

Scores of generation 1 and generation 2 never share a board, because each board partitions by revision or by date.

## 4. Game restrictions

A Game restriction is a rule that the engine or the server enforces and that one test proves.

### Restrictions that survive unchanged

R-01 to R-04, R-10 to R-16, R-18, R-19, R-21 to R-25, R-28, R-31. They apply to the two generations. Slice E0d2 runs each engine test of these restrictions against the two engines.

The audit shows 13 restrictions with no red-going test, and four with an incidental test only (R-05, R-07, R-17, R-25). Each gets a test in the slice below. A guard that the slice adds gets its test in that slice.

| Restriction | Finding | Slice | Guard that the red proof removes |
| --- | --- | --- | --- |
| R-05 (direct) | none | H5 | `canvas-renderer.js:229` |
| R-06 | B-34 | H5 | `canvas-renderer.js:234` |
| R-07 (direct) | none | H5 | `canvas-renderer.js:211` |
| R-08 | B-05 | H5 | `trail-compass.js:182`, `:198` |
| R-09 (radius and monotone reveal, generation 1) | B-35 | H5 | `game-session.js:919-921`; the monotone test removes `new Set(run.revealed)` at `:920` |
| R-11, R-14 | B-32 | H5 | `server/run-replay.js:142`, `:244` |
| R-13 | B-123 | H5 | `server/run-replay.js:207`, `:215-218`, `:244`: one test per guard, with the exact rejection reason (B-136) |
| R-19 | B-125 | H5 | `game-session.js:1212` |
| R-23 | B-33 | H5 | `run-replay.js:99`, `:120`, `run-replay-contract.js:251`. H5 deletes the redundant guards `:68` and `:113-117` |
| R-25 (direct) | B-36 | H5 | `game-session.js:955` |
| R-28 | B-38 | H5 | `game-session.js:579` |
| R-31 | B-130 | H5 | New finite check at `game-session.js:390` |
| R-17 (direct) | B-124 | H5, E3 | H5: the generation 1 spawn minimum (`game-session.js:236-243`), red with the minimum removed. E3: the generation 2 spawn rule |
| R-01, R-02 (revisions with no Windway), R-03, R-21 (Bridges, Tide Doors) | B-126 | E0e | Generation 2 validator |
| R-30 | B-127, B-128, B-133, B-37 | E0e, E2, E6, E7 | Generation 2 validator and count rule |

R1 and R2 replace the renderer code that H5 guards. R1 repeats the red proof of R-05 to R-07 against the layer code on one generation 1 golden Run. R2 repeats it on one generation 2 Run. R5 repeats the red proof of R-08 against the Trail Compass on the two generations. Each receipt quotes the red runs.

R-01 and R-02 (outside Windways), R-03, R-21, and R-30 have no guard in generation 1 that a test can remove (`game-session.js:1259`, `:1416`). Generation 1 is frozen, and its golden logs pin its Labyrinths. The generation 2 validator is the enforcement.

### Restrictions that change in generation 2

| ID | Generation 1 | Generation 2 | Slice |
| --- | --- | --- | --- |
| R-05 to R-08 | Fog hides each Echo, Warden, Gate, and Compass target outside the radius | The same for a tile that is not in sight. A remembered tile shows its Passages only: no Echo, no Gate, no Warden (rule 1) | E1 (filter in the guards of that time), R2, R5 |
| R-09 | Radius 2 diamond with no wall test | Line of sight inside radius 2; seen tiles stay remembered | E1 |
| R-17 | Spawn minimum `max(5, floor(size × 0.6))`, dropped when no candidate exists | Spawn beyond the Intercept radius; the validator rejects the seed otherwise | E3 |
| R-20 | 100 per Warden + 50 per Echo + 500 for escape | Rule 11 | E6 |
| R-26 | A Gate Warden replaces the last Warden | A Gate Warden exists only in Quest revisions and is extra | E6 |
| R-27 | A Warden never enters the Gate tile or an uncollected Echo tile | A Warden never stands on a Windway source (E4). A Warden enters a locked Gate tile only where the Explorer stands (E3, A-49) | E4, E3 |
| R-29 | Tide Doors alternate after each Move and Pulse, phase from tile parity | Phase from the seed; a refused action does not alternate | E4 |
| R-30 | The counts can fall short of the config | A Run holds exactly the counts of its config row; the validator rejects the seed otherwise. Until E6 makes the Gate Warden extra, a row with a Gate Warden and 0 Wardens holds no Gate Warden, and the count rule expects that | E0e, E2, E6 |
| R-32 | Hunt distance is the constant 7 | Hunt distance is a config value of the revision | E0d2, E0e |

### New restrictions

| ID | Restriction | Enforcement | Slice |
| --- | --- | --- | --- |
| N-01 | Each generation 2 Labyrinth has a finite par inside the par band of its config row. ADR 0059 sets the band of each row at the 1st and the 99th percentile of par over the E2 sweep, with the validator off. The seed test of the gate uses seeds outside that sweep. A row of rule 13 gets its band in E7. The ADR can change the band one time, when the sweep shows a retry rate above 5%. | Generator validator | E2, E7 |
| N-02 | A Warden Move equals the telegraph that the board shows after the action before it. No Warden moves in the action of a Bell ring or of an Echo Hush. | Engine: the telegraph is state, and the Move reads it | E3 |
| N-03 | No Echo sits on a tile next to the start. | Generator validator | E2 |
| N-04 | In a revision with no Question, contact costs exactly 1 Vitality and returns the Warden to its spawn. In a Quest revision the net cost is 0 after a correct answer and 1 after a wrong answer or a Skip. | Engine contact rule | E6 |
| N-05 | A Daily Run and a Classic Run hold no Question. A First Light Run or a drill Run holds one only where its row sets the Question flag of rule 13. | Engine and server replay reject a Question action | E6 |
| N-06 | A generation 1 Run replays to its golden state hash. | Golden logs in the gate | H2 |
| N-07 | The server accepts no successor revision while Accept is off, and the client starts no successor Run while Offer is off. | `acceptsRevision` on the score, receipt, and Daily routes. The offline submission route reads the revision of the stored receipt and refuses a submission with no receipt, as today. The Offer check at each client entry point of section 2.2; from E7 also at First Light and the Tactics Lab | E0c |
| N-08 | The first Verified Daily entry of an Explorer for a date is final, and a date holds one contract version. | Store rule under the lock per Explorer and date (V3c); version guard under a lock on the date (V3b) | V3c, V3b |
| N-09 | Paid Explorer admission equals the pin of section 2.6. | Pin test | H6 |
| N-10 | A Move reveals no tile behind a wall. | Engine line-of-sight rule | E1 |
| N-11 | The server score equals rule 11 from the replayed state. | Server recompute | E6 |
| N-12 | A Lured Warden does not move nearer to the Explorer, and the Lured mode ends with the Lure. | Engine Lure rule | E3 |
| N-13 | A Windway carries the Explorer in the travel direction only, and the last direction after a carry is the carry direction (A-38). | Engine Windway rule | E4 |
| N-14 | A Pulse reveals tiles to the map memory only, and a Pulse that reveals no tile is refused at no cost. | Engine Pulse rule | E5 |
| N-15 | The server stores no Score Entry that its own replay did not produce. A Question outcome comes from the Question service, not from the log. | Score route | V1 |
| N-16 | The loop count of a generation 2 Labyrinth sits inside the band of its config row. | Generator validator | E2 |
| N-17 | The route that collects each Echo is longer than the direct route to the Gate by the share of the config row. | Generator validator | E2 |
| N-18 | The seed normalization of a revision is fixed: one seed text gives one Labyrinth per revision. Its output matches the stored seed pattern for 10,000 random texts. An empty or over-length seed is refused. | Revision table; golden logs; property test | E0e |
| N-19 | After 16 retries the generator returns the fallback Labyrinth, and `createRun` and the server replay never throw on a valid seed. At most 1 of 10,000 seeds per revision gives a fallback. | Generator; seed sweep | E0e, E2 |
| N-21 | After eight Moves and one Pulse, at most 70% of the tiles are unknown (median of the sweep; generation 1 shows 83%). | Fog rule; sweep test | E5 |
| N-20 | Daily contract version 1 replays on `classic-v1` only, and version 2 on `classic-v2` only. | Daily contract map | E0c |
| N-22 | An action reports each of its events in order, and a Challenge event replaces no Echo event (rule 14). | Engine event list | E6 |
| N-23 | `provide-question` is refused while the Challenge holds a Question, and it keeps the Hint state (rule 14). | Engine action guard | E6 |
| N-24 | A Pulse sets the last direction to none, so Intercept aims at the Explorer tile (rule 15). | Engine Pulse rule | E3 |
| N-25 | In the action where a Twist carries the Explorer, no Warden makes contact (rule 15). | Engine contact rule | E4 |
| N-26 | A Patrol Warden with a free neighbour tile moves (A-02). | Engine Warden rule; telegraph sweep | E3 |
| N-27 | Pursuit distance uses the graph without the reserved tiles (A-06). | Engine Warden rule; telegraph sweep | E3 |
| N-28 | The shown Warden mode equals the mode of the Move (A-54). | Engine: the mode is part of the telegraph state; telegraph sweep | E3 |
| N-29 | The Gate sits in a dead end in at most the share of the config row (A-47). | Generator validator; seed sweep | E2 |
| N-30 | Each Echo Bridge saves more than 3 tiles of route (A-50). | Generator validator | E2 |
| N-31 | No two bands of a Quest Level hold an equal config row, and a Run holds the Vitality and the Pulse count of its row (A-12). | Config table test | E0e |
| N-32 | Each `first-light` row and each drill row generates with no fallback. Its Warden spawns beyond its Intercept radius, and its goal is reachable (rule 13). | Generator validator; row test | E7 |

A rule slice merges only after its restriction has a test that was red before the rule code.

## 5. Milestones and slices

A slice is one PR, or an ordered set of PRs where section 2 states the order or its rule (V1, E0c, S1, and S4 by a stated order; S2 and S3 by the call graph), or a size split of the ticket stage. The ticket stage keeps that order. One milestone is one pipeline pass. Slice sizes follow `feature-pipeline` and `references/pr-batching.md`: a target of 200 changed lines and a split above 400.

Three slice classes are exempt from the 400-line limit, and each states its proof:

- A mechanical move (S2, S3, E0a). Proof: the test identity list of H3 is unchanged outside the static tests that the slice row names, and the bundle check, the golden logs, and the e2e suite pass. A moved-line check also runs per PR. It compares the lines that are not import or export lines as a multiset: each added line equals one removed line, and each removed line equals one added line. The compare strips a leading `export` from each line. The ticket lists each line that is new by design, such as a boot call, and the check permits only those lines. H3 builds the script. The check reads the files under `src/` only. The receipt quotes its result.
- The copy of E0d1. Proof: the diff shows changed import paths only, and the copy replays each golden log to the equal state hash.
- A generated fixture (the golden logs of H2, of each rule slice from E0e to E7, and of Z1). Proof: a gate test makes the file again and compares it with the committed file.

The `/to-tickets` stage splits a slice into tickets of at most 150 lines. A slice that passes 400 lines of logic splits into PRs with the suffix `a`, `b`.

Each finding that section 6 gives to a slice has one test in that slice, red before its fix, and the ticket names it. The acceptance column lists the lead tests only.

Before the first ticket, the issue reconcile step closes #229 and #298. It closes #253 to #272 as shipped by PRs #274 to #278; the residual B findings keep their R slices. It writes the slice of this plan on each other open issue.

### M0 Harness

| Slice | Content | Acceptance test |
| --- | --- | --- |
| H1 | Local Node range constant in the gate; the runner flag | `npm run test` passes on Node 26 with no `NODE_OPTIONS`; the gate stops with a message on a Node version outside the range |
| H2 | Golden Run Action Logs of the six current revisions and `windways-v1`; engine determinism bans; Twist replay round trip; engine soft-lock check with `applyAction` | Each named mutation, one per rule family, turns a golden test red |
| H3 | Gate integrity: test identity list, skipped tests, worker loss, flaky retries; the two bundle gate fixes (B-40, B-41); the B-149 move of the exhaustive cases to a sweep script; the moved-line check script | A renamed test with an equal test count fails `npm run check`; a second chunk with an equal prefix adds to its row; a new chunk with no row fails the "Other JavaScript" limit; the moved-line check fails on a move that drops one line |
| H4 | e2e as the last step of the pre-push hook; the hook pin test and the identity list; one pass on the production bundle; offline e2e; mobile project cases; one `windways-v2` Run in e2e (#282); gate time record | The hook pin test expects the steps of `npm run check`, then `test:e2e`; the offline e2e fails when the service worker serves no shell; a `windways-v2` Run reaches its escape |
| S0 | Spike measure; the Lifetime view loads when it opens | The game row shows at least 0.5 KB gzip free; the Lifetime e2e passes; a delayed import of each S0 chunk shows the wait state, and a failed import shows the retry notice |
| H5 | Red-going tests of section 4; input validation of Run options; the bounds of `normalizeTerminal` (B-132); B-130 and B-131 fixes with green golden logs | Each new test is red with its guard removed, then green |
| H6 | Entitlement pin test; an order step in `scripts/run-database-lane.mjs` (`npm run test:db` exists), which applies `0018`, `0019`, and `0037` in order and then inserts one `windways-v2` row. Z1 adds `0038` and one successor row to the step | The pin test is red when `FREE_RUN_LIMIT` changes |

The pin test needs no database. The run of the integration lane is a parked step, so B-08 is parked: H6 adds the order step, and no gate runs it.

### M1 Shell split and headroom

| Slice | Content | Acceptance test |
| --- | --- | --- |
| S1a | Spike measure of 10 fields; the state form that the spike selects; pure helpers | The spike record states the gzip change; the game row stays inside 42 KB with no raised row; each moved helper keeps its tests; a state field read before its set throws in a test |
| S1b | Audio and input state out of module scope | The four source-text tests pass unchanged; the game row stays inside 42 KB; e2e green |
| S1c | Run state out of module scope | No top-level `let` of `main.js` holds Run state; the game row stays inside 42 KB; e2e green |
| S1d | Each other state field out of module scope | `main.js` holds no top-level `let`; each literal of `audit-correctness.test.js:310-313` that the state form breaks changes, with a red proof; e2e green |
| S2 | Module move: the `elements` map, `canvas`, and `renderer` (first PR); Run lifecycle, Daily, offline bridge, Atlas and Replay openers, input listeners, audio loaders | The test identity list changes by the one title of the import-direction test; the moved-line check passes; a static test finds no shell module that imports `main.js`; the two Atlas source-text tests pass at their new path; e2e green |
| S3 | Module move: Challenge dialog, Echo Lens, HUD, Lifetime, Quest, access, Settings, First Light, Journal and Workshop, level picker, Records | The test identity list changes by the one title of the static test; the moved-line check passes; a static test finds imports and the boot call only in `main.js`; e2e green; `main.js` holds at most 300 lines |
| S4 | Measure; lazy chunks with budget rows: the Daily start, Access Settings Continuity, the demo, First Light, the Lifetime module, and the blocks that no Run-start path loads | e2e: a delayed chunk import shows the wait state, and a failed import shows the retry notice; the game row has at least 3 KB free, or the plan records the measured floor under the rule of section 2.4; pin test green |

### M2 Play-shell correctness

| Slice | Content | Acceptance test |
| --- | --- | --- |
| P1 | Input, focus, and shell bugs | After Describe Trail, an arrow key moves the Explorer (B-01) |
| P2 | Storage and records | A corrupt stored Run Record does not stop the play screen; a Run Record list in the format of today loads with each Record |
| P3 | Audio, text, Atlas, landing | Sound that the Explorer turned on stays on after a reload (B-65); each other finding follows the test rule of this section |

### M3 Server validation

| Slice | Content | Acceptance test |
| --- | --- | --- |
| V1 | Score route by replay; log capture module on the client for each Run kind of the score route (table of section 2.5); `runId` in the score body; Question resolve on the server; the 4-hour limit; old payload rule; the guest-start rule of section 2.2 | The server stores no Score Entry for counts that no log produces (the B-04 request); a Quest log with a forged `correct` outcome gets no Score Entry; one log above each limit of v2 gets no Score Entry; contract test: the client submit module builds the body from a golden Classic Run with a Challenge and a golden Quest Run, and the real score handler with a query double stores the replay score; a Run that starts with enforcement off and submits with it on gets `run-grant-missing`; an old payload gets `client-outdated`; e2e: a Run reloads, resumes, and escapes, and the body of the score request holds the complete log; an envelope with no log resumes and sends no score request; a route unit test with a query double: a request with a Classroom header and no Run Grant gets 201 with enforcement on; the three tests of section 2.5 for the Daily log, the offline log, and the two stores |
| V2 | Offline receipts and offline submission; the content pack of an offline Run (B-120) | A submission inside the 48-hour grace after day seven is accepted (B-28); a receipt request that names `windways-v1` gets a 400 for each Run (A-52) |
| V3a | Access fixes with no SQL change | A refunded Explorer with free Runs left starts a Run (B-118); a repeated Daily key costs no replay (B-111) |
| V2b | Offline ledger read by Run id (parked) | A rejected Run with a new key costs no second replay (B-29) |
| V1b | Classroom Run Grant check on the score route, by Run id (parked) | A request with a Classroom header and no Classroom Run Grant for its Run id gets a refusal; a Class Play escape with its grant gets 201 |
| V3c | Daily first entry: the store rule in JavaScript, the client copy, the device label, and the Verified Daily term of `GLOSSARY.md` | With a query double, a second Verified Daily entry for one date stores no best entry and returns `bestResult: "unchanged"` with status 200 (N-08); red with the rule of today; the Daily dialog shows the label |
| V3b | Daily version guard: one contract version per date, with its SQL statement (parked) | Two concurrent entries with two versions for one date: the store keeps one version |

Each V test runs with enforcement on and with enforcement off. The pin test is a protected path of V1, V2, V2b, V3b, and V3c. V3a adds the B-118 row to it and changes no other row.

V1b and V2b each need a new SQL statement and park with the database lane. V3b holds the version guard and its statement, and it parks with the database lane under the SQL rule of section 2.5. V3c changes JavaScript only, so it merges. Each other V slice states in its ticket that it changes no SQL statement; a ticket that finds one moves that part to a parked slice.

### M4 Engine generation 2

| Slice | Content | Acceptance test |
| --- | --- | --- |
| E0p | Shared helpers move to one pure module | Golden logs green; each helper keeps its tests |
| E0a | Mechanical move of generation 1 to `src/game/engine-gen1/` | Golden logs green; test identity list unchanged |
| E0b | Engine handle and lazy engine chunk, also for First Light and the Tactics Lab; the renderer row and the Run start shared row of section 2.4, the larger-of-group option, chunk names, preload filter; load-failure path; engine chunks in the offline cache | e2e: a failed engine import shows the retry notice and starts no Run, at boot also; Continue Offline loads the engine chunk with no network; the e2e request record finds each Run-start chunk in a row other than "Other JavaScript"; the bundle check passes with no raised row |
| E0d1 | Generation 2 as a byte-equal copy with its own helper module; the generation 2 engine row and the engine group of the game row | The diff shows changed import paths only; generation 2 replays each golden log of H2 to the equal state hash; a generation 2 import of a generation 1 file fails the static test |
| E0d2 | Branch to config; successor table that no normalizer reads; row structure of rule 12; parity revision; differential sweep; restriction tests on the two engines; one helper in the module of the successor table that gives the Twist family of a revision, used by `trail-compass.js`, `tactics-lab.js`, and `quest-content.js`; the ticket lists each other file under `src/` that holds a revision id literal (`main.js:5411`, `player-controller.js:53`, `:625-627`, `tactics-lab-view.js:15-19`), and E0c part (g) gives each a successor case or a reason | The parity revision replays each golden log of H2 to the equal state hash; a static test finds no normalizer that reads the successor table; `run-ruleset.js` holds no successor Labyrinth config; the helper gives the Twist family of each successor id of the table (unit test, no Run) |
| E0c | Seven parts, each guard before the join: (a) the variables and the Accept and Offer states; (b) the start check with three results and its cache; (c) `acceptsRevision` with the rule of each route; (d) the Daily contract map, the version argument with its two server callers, and the Daily version function; (e) the config fields `rulesetGeneration`, `dailyVersion`, `dailyDate`; (f) the Offer check at each entry point of a new Run; (g) the join of the successor table | Each of parts (a) to (f) has unit tests that pass the table as an argument and start no successor Run. Part (g): with Accept off, the score, receipt, and Daily routes each refuse a successor, and the offline submission route refuses a submission with no stored receipt; with Offer off, each entry point of a new Run refuses a successor (N-07). e2e: Offer off, Accept on, reload, a stored successor Run resumes and shows its Twist sentence in the Trail Compass. An "unknown" check gives a 503 and stores nothing; a database at `0037` gives "absent"; a config with a stale `dailyDate` gives a version 1 Daily from the device date; a version 2 Daily result saves and loads; N-20 |
| E0e | Generator validator with bounded seed retry and the fallback Labyrinth; exact counts; config row values and seed normalization of rule 12; first golden logs of generation 2 with the manifest and the allowlist gate script | A config that closes a needed passage fails the validator (R-01, R-02, R-03, R-21); a Run holds the counts of its row (R-30); a seed that fails 16 times returns the fallback and replays on the server (N-19); N-18; N-31; a changed log id outside the allowlist fails the gate |
| E1 | Rule 1; the in-sight set is state apart from the remembered set; on a generation 2 Run, the renderer guards and the Trail Compass guard read the in-sight set | A Move reveals no tile behind a wall (N-10); a tile that leaves sight stays remembered and is not in sight (A-05); on a generation 2 Run, a Warden on a remembered tile out of sight is not drawn, and the Compass does not name it; an Echo and the Gate on such a tile are not drawn, and the Compass names neither; each red before the filter (R-05 to R-08) |
| E4 | Rules 6 and 7; the Twist part of rule 15 | An exhaustive state search of each small Labyrinth finds no soft-lock (R-03); N-13; N-25; R-27; a refused action does not flip a Tide Door (R-29) |
| E2 | Rules 2 and 3 | A breadth-first search that shares no code with the generator gives the equal par for 200 seeds per revision (N-01); N-03; N-16; N-17; N-29; N-30; the 10,000 seed sweep meets N-19 |
| E3 | Rules 4 and 5; the Pulse part of rule 15 | In the 10,000 Run sweep each Warden Move and mode equals its telegraph (N-02, N-28); N-12; N-24; N-26; N-27; R-17; a Warden reaches an Explorer on a locked Gate tile (A-49); the sweeps of E2 and E4 pass again |
| E5 | Rule 8 | N-14; N-21 (B-11); the seed sweep of E2, the telegraph sweep of E3, and the soft-lock sweep of E4 pass again |
| E6 | Rules 9, 10, 11, 14; the Challenge dialog copy states the cost of a wrong answer and of a Skip (A-43); ADR 0063 defines what `wardensDefeated` counts in generation 2 | The server score equals rule 11 (N-11); a Daily Run rejects a Question action (N-05); N-04; N-22; N-23; on each seed of the sweep, `wardensDefeated` passes the bound of `server/player-validation.js` for its row and the stored CHECK of 0 to 20; a Quest Run holds the Warden count of its row and one Gate Warden more (R-26); each Challenge of such a Run gets a Question from each shipped Learning Deck; the seed sweep of E2, the telegraph sweep of E3, and the soft-lock sweep of E4 pass again |
| E7 | Spike of the row sizes; rule 13 | The spike record states par, the longest path, and the retries of each row; each row generates with 0 retries and no fallback mark; a Warden of First Light spawns beyond its Intercept radius (B-129); each Tactics Lab drill can reach its goal (B-37); N-32; a Run of a row with the Question flag submits no Score Entry; the sweeps of E2, E3, and E4 pass again |

The table shows the build order: E0c comes after E0d2, because part (g) of E0c replays a successor on generation 2. Each E slice adds its restriction test red, then its rule code. The successor revisions stay off in production until the parked steps.

### M5 Renderer and Pilot Chart

| Slice | Content | Acceptance test |
| --- | --- | --- |
| R1 | Layered renderer with a host element: three board layers and the Neatline canvas; flatten function; token read with no silent fallback (supersedes the fallback of #255; ADR 0057 amends ADR 0052); repaint on a theme change (B-22); Stitch design system update | A Move never repaints the chart layer, and a Move with no sight change repaints the mark layer only; at 375 px each Neatline tick aligns with its tile line; the tests run on one generation 1 golden Run, and R2 adds the generation 2 Run; captures at 375, 1280, 1920 |
| R2 | Board marks: Land, hatch, Coastline, Fog, the remembered Passage, the Memory dot, Explorer, Wardens, Gate, Echo with the Echo number rule, Twist marks, the static form of the Pulse range ring, Neatline, telegraph mark; paused board cover; the legend contract (B-12, B-47, B-48) | Each mark meets the contrast row of `design.md`; the legend lists each mark that the board can draw; a generation 1 Run draws no telegraph mark and no Memory dot; detector exit 0 |
| R3 | Motion chunk with its budget row: each motion of the `design.md` Motion table; reduced-motion path; Run Replay playback reads the reduced-effects value | With reduced motion or the reduced-effects setting the chunk does not load, and Play of a Run Replay advances one step and starts no timer (B-84); each motion plays on a generation 1 Run and on a generation 2 Run |
| R4 | Play shell layout: header, board column, Readout, Action rail, Title block | The document has no horizontal scroll at 375; a size 15 board scrolls inside its frame, the frame follows the Explorer after each Move, and each Neatline tick aligns with its tile line after the scroll (B-10); Run Replay canvas is square (B-02) |
| R5 | Trail Compass parity with the board | Each board mark has a Compass text; a Fog-hidden mark has none (R-08); the Compass gives the distance of a Warden in sight (A-22); the tests run on the two generations |
| R6 | Dialogs | Each dialog follows the Dialog anatomy; focus returns to the opener |
| R7 | Pages: landing, Atlas, Records, Journal, Workshop, Class, Admin | Captures at 375, 1280, 1920 match `design.md`; detector exit 0 |

Each R slice carries the capture receipt and the impeccable detector result. R6 and R7 close no finding of section 6: they apply the Dialog anatomy and the page rules of `design.md` to the dialogs and the pages, and each ticket starts with a capture that lists the differences. R1, R4, R6, and R7 need M1 only. R2, R3, and R5 need M4 for the generation 2 marks (telegraph, remembered tiles, Pulse memory); their generation 1 form needs M1 only.

### M6 Release

| Slice | Content | Acceptance test |
| --- | --- | --- |
| Z1 | Migration file `0038` with its header, its text test, and the ledger row (parked); freeze of the generation 2 golden logs by the frozen flag of the manifest | A one-line rule change in generation 2 turns its golden test red; a change of a frozen log with a new allowlist entry fails the gate script; the test gives the script a base manifest with the flag set |
| Z2 | `design.md` from the shipped build, a last check of `GLOSSARY.md` (each rule slice updates the terms of its rule with its ADR), README, ADR index, learn-loop entry | `npm run check` and `npm run test:e2e` pass; skill `verify` passes on desktop and mobile |

The file `0038` is inert until the owner applies it. No local database exists, so no test runs the file. Z1 merges the freeze; the file itself parks with the integration lane.

Issue #282 holds three migration rows that this plan keeps: `player-validation.js:334` accepts `windways-v2` before the database does; a second run of `0019` after `0037` removes `windways-v2`; and `0037` validates outside a transaction. ADR 0054 records the keep decision. Issue #282 also holds one architecture row: the move rule exists in three copies. ADR 0054 keeps it, because generation 1 is frozen and E0d1 needs a byte-equal copy; the golden logs of H2 guard each copy. The lane step of H6 applies `0018`, `0019`, and `0037` in order, so the lane proves the order.

### Order

M0, M1, M2, M3, M4, M5, M6. M2 comes before M3, because V1 needs the log limit rule of P2. R1 and R4 can start after M1.

The Harness milestone comes first, because each later slice needs a gate that can fail.

## 6. Dispositions

### Findings B-01 to B-151

| ID | Severity | Disposition | Slice | Finding |
| --- | --- | --- | --- | --- |
| B-01 | high | Fix | P1 | A click on Describe Trail or Listen leaves focus on the button. |
| B-02 | high | Fix | R4 | The Run Replay canvas box is not square on most desktop viewports. |
| B-03 | high | Fix | P2 | `authorizeRunLocator` saves the new locator with `pending: true` before the Run Access check. |
| B-04 | high | Fix | V1 | The Global Scoreboard accepts a Score Entry that no Run produced. |
| B-05 | high | Fix | H5 | The Fog test of the Trail Compass cannot fail for an Echo or a Warden. |
| B-06 | high | Fix | H1 | No script enforces the Node version. |
| B-07 | high | Fix | H2 | No test gives a recorded Run under a Trail Twist revision to the replay verifier. |
| B-08 | high | Parked | PARK 1: run of the database lane. H6 adds the order step of the lane script | The 33 pinned skipped tests are the database and audit-sink integration tests. |
| B-09 | medium | Fix | R4 | At 1280x800 the board frame is 448 px and the canvas is 412 px. |
| B-10 | medium | Fix | R4 | At 375 px a size 15 tile is about 22.1 px, under the 24 px floor of rebuild-v3 §6.3. |
| B-11 | medium | Fix | E5 | After the eight key presses, Fog covers about 83% of the board. |
| B-12 | medium | Fix | R2 | The legend lists one Warden mark. |
| B-13 | medium | Fix | R5 | The Compass never says an Echo pair number. |
| B-14 | medium | Fix | R5 | The Compass names a Windway only as an exit of the current tile. |
| B-15 | medium | Fix | P2 | The storage functions read `globalThis.localStorage` as a default parameter, outside their `try` block. |
| B-16 | medium | Fix | P2 | One list of 5 Run Records serves every Quest, Quest Level, and Labyrinth. |
| B-17 | medium | Fix | P2 | The rank puts every escape before every defeat. |
| B-18 | medium | Fix | P2 | `saveRunRecord` catches a `setItem` failure and returns the new list. |
| B-19 | medium | Fix | P2 | `saveQuestProgress` swallows a `setItem` failure and returns the new Quest Progress. |
| B-20 | medium | Fix | P1 | The result dialog has no `cancel` listener and no `close` listener, so Escape closes it. |
| B-21 | medium | Fix | P1 | `openLevelPicker` does not pause an active Quest Run. |
| B-22 | medium | Fix | R1 | No listener watches the operating system colour scheme. |
| B-23 | medium | Fix | R1 | The minimum font sizes are in backing-store pixels. |
| B-24 | medium | Fix | R1 | No renderer test uses a non-square canvas box, checks line state between marks, or changes the colour schem... |
| B-25 | medium | Fix | P1 | The level-card handler and the "Play This Seed" handler are async with no re-entry guard. |
| B-26 | medium | Fix | P1 | The global `keydown` handler does not check `ctrlKey`, `metaKey` or `altKey`. |
| B-27 | medium | Fix | P1 | The Question request has no timeout, abort or retry control. |
| B-28 | medium | Fix | V2 | The handler rejects every submission that arrives after `playExpiresAt`. |
| B-29 | medium | Parked | PARK 1: slice V2b needs a new SQL statement and the database lane | A rejected offline replay is terminal for its idempotency key only. |
| B-30 | medium | Fix | V2 | The Offline Continuity Receipt route has no rate limit. |
| B-31 | medium | Fix | V1 | The casual score path does not check that a Run Grant exists. |
| B-32 | medium | Fix | H5 | No test goes red when the server stops the reject of an impossible or no-op action. |
| B-33 | medium | Fix | H5 | Five guards of the device-local Run Replay have no red test. |
| B-34 | medium | Fix | H5 | No test goes red when the canvas draws a Warden under Fog. |
| B-35 | medium | Fix | H5 | No unit test pins the Fog reveal radius of 2. |
| B-36 | medium | Fix | H5 | No engine test asserts that the Gate stays closed after some, but not all, Echoes. |
| B-37 | medium | Fix | E0e (count-0 row) and E7 (drill rows) | An `echo-bridges-v1` Run with 0 Echoes gets an unbounded number of Echo Bridges. |
| B-38 | medium | Fix | H5 | No test goes red when a terminal Run accepts a Move. |
| B-39 | medium | Fix | H3 | Four tests depend on wall-clock speed. |
| B-40 | medium | Fix | H3 | The bundle gate takes the first file that matches a prefix. |
| B-41 | medium | Fix | H3 | The bundle gate has no total budget. |
| B-42 | medium | Fix | H4 | The pre-push hook tests the working tree. |
| B-43 | medium | Fix | H4 | No automatic gate runs the e2e suite. |
| B-44 | medium | Fix | H4 | No browser test loads the production bundle. |
| B-45 | medium | Fix | H4 | No e2e test plays an offline Run. |
| B-46 | low | Fix | R4 | At 1920x1080 the canvas is 688 px and the Action rail starts at y=989. |
| B-47 | low | Fix | R2 | The Map marks legend fills the Warden mark with red. |
| B-48 | low | Fix | R2 | A Pulse adds a blue tone over passages and hatched land with no key. |
| B-49 | low | Fix | R4 | At 375 px the nav row clips "Settings" to "Sett" with no scroll cue. |
| B-50 | low | Fix | R4 | At 375 px the document is 1416 px high. |
| B-51 | low | Fix | R5 | An open shortcut exit says "open through a shortcut" and names no destination. |
| B-52 | low | Fix | R5 | `#live-region` is outside the Challenge dialog. |
| B-53 | low | Fix | R5 | Describe lists Echoes, then the Gate, then Wardens, each in Run order. |
| B-54 | low | Fix | R5 | The text says "1 Echoes remain." when one Echo is left. |
| B-55 | low | Fix | R5 | When a Move starts a Challenge, the Tide Doors change phase, and the event text does not say it. |
| B-56 | low | Fix | R5 | Describe says no Run status. |
| B-57 | low | Fix | R5 | Describe omits the Run Score. |
| B-58 | low | Fix | R5 | Each status adds the place, the exits and the Warden mode, also in a Challenge and after the Run ends. |
| B-59 | low | Fix | R5 | The Compass says "row 6, column 6". |
| B-60 | low | Fix | R5 | The board tints Pulse-only tiles, and they expire after 2 actions. |
| B-61 | low | Fix | P3 | In First Light the event ribbon strips "You earned". |
| B-62 | low | Fix | R5 | The exit sweep removes each Warden and opens each shortcut. |
| B-63 | low | Fix | P3 | `transition` calls `playEventSound` after every action, outside the `eventChanged` block. |
| B-64 | low | Fix | P3 | `play` checks only `#enabled` and `#context`. |
| B-65 | low | Fix | P3 | The game does not store the sound choice. |
| B-66 | low | Fix | P3 | Two fast `toggle` calls both pass the `resume()` wait and flip `#enabled` twice. |
| B-67 | low | Fix | P3 | Sound off stops the ambient tone but never suspends or closes the `AudioContext`. |
| B-68 | low | Fix | P3 | `new AudioContext()` has no fallback and no error message. |
| B-69 | low | Fix | P3 | The milestone text has no singular form. |
| B-70 | low | Fix | P3 | The Atlas header counts every Echo Fossil in the collection. |
| B-71 | low | Fix | P3 | After the Workshop returns to the Echo Atlas, `showQuestAtlas` gets the Workshop button as its trigger. |
| B-72 | low | Fix | P1 | The Records dialog and the Quest result dialog set no first focus and no focus return. |
| B-73 | low | Fix | P3 | A click on the Atlas backdrop closes the Atlas, and the paused Run resumes at once. |
| B-74 | low | Fix | P2 | `loadActiveRunRecoveryModule` caches a failed import as `null` for the whole session. |
| B-75 | low | Fix | P2 | A Run with more than 2048 recorded actions fails the bounds check. |
| B-76 | low | Fix | P2 | A guest Run stores its Run Replay with no `replayOwnerId`. |
| B-77 | low | Fix | P3 | The landing call to action says "Continue Quest" for any stored Quest Progress, a complete Quest included. |
| B-78 | low | Fix | P3 | `syncAccount` sets `clerkReady` before Clerk loads. |
| B-79 | low | Fix | P3 | The beacon writes the "sent" flag before the request and ignores a failed request. |
| B-80 | low | Fix | P2 | No test covers a throwing `localStorage` getter in `storage.js`, eviction across Labyrinths, Escape on the ... |
| B-81 | low | Fix | R1 | `drawGate` and `drawWarden` set round line caps and joins and do not restore them. |
| B-82 | low | Fix | R1 | The Explorer draws last on the tile of the Warden in a Warden Challenge. |
| B-83 | low | Fix | R1 | The Windway pair rule adds the partner tile to the local `revealed` set. |
| B-84 | low | Fix | R3 | Run Replay playback checks only the operating system reduced-motion query. |
| B-85 | low | Fix | R1 | `render` calls `context.save()` and `context.restore()` with no `try`/`finally`. |
| B-86 | low | Fix | R1 | The backing store clamps to 320 pixels. |
| B-87 | low | Fix | R1 | The canvas resizes only on a window `resize` event and inside `render`. |
| B-88 | low | Fix | R1 | The window `resize` handlers have no throttle. |
| B-89 | low | Fix | R1 | Every render reads the full palette through `getComputedStyle`, with 25 property reads. |
| B-90 | low | Fix | P1 | `tick` runs on every animation frame for the life of the page. |
| B-91 | low | Fix | R1 | The game canvas takes focus and has an `aria-label`, with no role and no fallback content. |
| B-92 | low | Fix | R1 | The Grid reference font is fixed at 10 CSS pixels. |
| B-93 | low | Fix | R1 | The board has no forced-colors handling. |
| B-94 | low | Fix | R1 | Every palette value and every fallback value is an `oklch()` colour. |
| B-95 | low | Fix | R1 | The pattern cache never removes an entry. |
| B-96 | low | Fix | P1 | The First Light handoff applies a `pause` action to the Run. |
| B-97 | low | Fix | P1 | `finishRun` reads the globals `run`, `currentLevel` and `questProgress` after it awaits the Class Expeditio... |
| B-98 | low | Fix | P1 | The "removed" verdict returns with no result dialog. |
| B-99 | low | Fix | P1 | `isNativeControl` does not include `summary`. |
| B-100 | low | Fix | P1 | Each `syncChallengeDialog` call with a Question rebuilds the choice buttons and moves focus to the Question... |
| B-101 | low | Fix | P1 | `announce` clears the live region and sets the text in the next frame. |
| B-102 | low | Fix | P1 | The swipe code keeps one `touchStart` and does not check `pointerId`, `isPrimary` or `button`. |
| B-103 | low | Fix | P1 | `tick` caps each frame at 1000 ms. |
| B-104 | low | Fix | P1 | Settings and Atlas pause the Run and then await a lazy import. |
| B-105 | low | Fix | P1 | `startRun` does not call `clearPostAnswerEchoLens`. |
| B-106 | low | Fix | P1 | After a Run ends, the Pause button stays enabled with the label "Pause". |
| B-107 | low | Fix | P1 | No test covers modifier keys, Escape on the result dialog, double activation of a level card, a second poin... |
| B-108 | low | Fix | V2 | A client can claim the idempotency key `offline_<runId>` through `/api/scores`. |
| B-109 | low | Fix | V2 | The play-expiry test pins only a `terminalAt` after the play window. |
| B-110 | low | Accepted | ADR 0056 (V1): elapsed time is a client claim inside the 4-hour limit | Elapsed time is a client claim in both replay paths. |
| B-111 | low | Fix | V3a | The Daily route replays the Run before the store looks up the idempotency key. |
| B-112 | low | Fix | V3a | The Verified Daily Board read has no rate limit. |
| B-113 | low | Fix | V3a | The route builds the Daily contract from the server clock at request time. |
| B-114 | low | Backlog | Backlog 7: Question ordinal bind at the Run start | The receipt binds `initialQuestionOrdinal` from Quest Progress at request time, not at Run start. |
| B-115 | low | Backlog | Backlog 6: receipt key per Explorer | Receipts are unique on `run_id` for all players. |
| B-116 | low | Fix | V3a | `POST /api/access/runs` has no rate limit. |
| B-117 | low | Accepted | ADR 0056 (V1): a refunded Explorer keeps each Run registered before the refund | A Run Grant never expires. |
| B-118 | low | Fix | V3a | A refunded or disputed membership blocks every new Run, also when free Runs remain. |
| B-119 | low | Fix | V3a | Several controls fail open. |
| B-120 | low | Fix | V2 | `contentPackFor` reads Question revisions with ids from the unvalidated Run Action Log. |
| B-121 | low | Fix | V1 | `verifyRunReplay` throws a plain `Error` when no `questionFor` resolver exists. |
| B-122 | low | Fix | V1 | The casual validator accepts values that the engine cannot produce together. |
| B-123 | low | Fix | H5 | No test asserts the v2 reject of an action after the terminal state. |
| B-124 | low | Fix | H5 (generation 1 minimum), E3 (generation 2 rule) | No guard and no test state the rule that a Warden never spawns beside the Explorer start. |
| B-125 | low | Fix | H5 | No test pins the start Vitality clamp of 1 to 9. |
| B-126 | low | Fix | E0e | `acceptsShortcuts` never rejects a candidate, so no test can go red for it. |
| B-127 | low | Fix | E0e | `pickEntities` can return fewer entities than the config states, and `createRun` accepts the short list. |
| B-128 | low | Fix | E0e (count rule), E6 (fix, with the red test) | `gateWarden: true` with `wardenCount: 0` gives a Run with no Gate Warden and no sealed Gate. |
| B-129 | low | Fix | E7 | First Light declares size 7, and `normalizeConfig` clamps the size to 9. |
| B-130 | low | Fix | H5 | A `tick` with a non-finite `deltaMs` makes `elapsedMs` `NaN` or `Infinity`. |
| B-131 | low | Fix | H5 | `answer-question` with no `answerId` is correct when the Question has no `answerId`. |
| B-132 | low | Fix | H5 | `normalizeTerminal` accepts a score up to 100,000 and an `echoTotal` up to 20. |
| B-133 | low | Fix | E0e, E2 | Twist counts fall short at the config limits with no error. |
| B-134 | low | Fix | H4 | The mobile project skips the guest terminal Run, the full guest Labyrinth completion, and the terminal Atla... |
| B-135 | low | Fix | H2 | Run Action Log v1 has no `ring-bell` entry. |
| B-136 | low | Fix | H5 | Three verifier rejection tests assert only the error class `ReplayInputError`. |
| B-137 | low | Fix | H3 | With an armed integration lane the skip pin becomes a maximum. |
| B-138 | low | Fix | H3 | The gate pins counts, not test identity. |
| B-139 | low | Fix | H3 | The gate reads the text summary lines of the reporter, not a structured result. |
| B-140 | low | Fix | H3 | Four tests use `it.skipIf(!shellAvailable)`. |
| B-141 | low | Fix | H3 | The e2e suite has no pin on the skipped count. |
| B-142 | low | Fixed | #331 | `check:full` builds production, then `test:e2e` overwrites `dist/` with the e2e-mode build. #331 builds the e2e bundle into `dist-e2e/`. |
| B-143 | low | Fix | H4 | Two tests can pass with almost no assertion. |
| B-144 | low | Fix | H4 | The touch-control size test does not wait for `data-game-ready`. |
| B-145 | low | Fix | H4 | Thirteen `waitForTimeout` calls make e2e results depend on machine speed. |
| B-146 | low | Fix | H4 | Seven Daily tests skip on mobile, including the signed-in verified result and the rejected replay. |
| B-147 | low | Fix | H3 | `tsc` does not include `scripts/**`. |
| B-148 | low | Fix | H3 | `eslint .` has no `--max-warnings 0`. |
| B-149 | low | Fix | H3 | Two files take 376 s of the unit run. |
| B-150 | low | Fix | S4 | Game JavaScript is at 41.92 KB of a 42 KB budget. |
| B-151 | low | Fix | H2 | The real-engine soft-lock cross-check uses one seed per configuration and removes the Wardens. |

### Findings A-01 to A-54

| ID | Severity | Status at audit | Disposition | Slice | Finding |
| --- | --- | --- | --- | --- | --- |
| A-01 | high | Fixed | Fixed before this plan | none | `describeExit` passes the adjacent wall tile as the shortcut end. |
| A-02 | medium | Open | Fix | E3 | Patrol legal moves include the tile the Warden is on. |
| A-03 | medium | Open | Fix | E4 | Tile parity fixes the Tide Door phase. |
| A-04 | medium | Open | Fix | E4 | The Windway lookup matches the source tile only and ignores the travel direction. |
| A-05 | medium | Open | Fix | E1 (state), R2 and R5 (marks) | `revealed` keeps every tile the Explorer has seen. |
| A-06 | medium | Open | Fix | E3 | Hunt and Intercept candidate moves exclude reserved tiles, but the target distances come from the full Laby... |
| A-07 | medium | Open | Accepted | ADR 0063 (E6): a Skip and a wrong answer keep the equal cost | A paid Question Skip and a wrong answer both cost 1 Vitality and give a fresh Question. |
| A-08 | medium | Open | Fix | E6 | The Gate Warden takes the last generated Warden off the board. |
| A-09 | medium | Open | Accepted | ADR 0063 (E6): each Echo stays required; rule 11 drops the constant Echo term | The Gate opens only when the Explorer has every Echo. |
| A-10 | medium | Open | Fix | E2 | `pickEntities` shuffles the Echoes onto tiles past a minimum start distance. |
| A-11 | medium | Open | Backlog | Backlog 1: secret Daily seed | The Daily seed is the public string `DAILY-${compactDate}`. |
| A-12 | medium | Open | Fix | E0d2 (structure), E0e (values) | `getLabyrinthConfig` selects size, echoCount and wardenCount by band only. |
| A-13 | medium | Open | Fix | E2 | `generateLabyrinth` opens only floor(size/4) loop walls after a perfect DFS, for every revision. |
| A-14 | medium | Fixed | Fixed before this plan | none | Listen adds the Echoes first, then the Gate, then the Wardens, and keeps the first 6. |
| A-15 | medium | Partly fixed | Fix | R5 | Listen starts up to 6 cues at the same instant, with no panner, no delay and no pitch change. |
| A-16 | medium | Open | Fix | R5 | The Gate text tests `sealed` before `open`. |
| A-17 | medium | Open | Fix | R5 | The canvas draws every Echo Bridge, Tide Door and Signal Bell with no Fog check. |
| A-18 | medium | Open | Fix | R5 | Exits cover the 4 neighbors only, and the radius-2 reveal always includes them. |
| A-19 | medium | Open | Fix | R5 | The Compass describes adjacent exits and revealed entities only. |
| A-20 | medium | Open | Fix | E6 | A correct answer adds +100 and +1 Pulse, and contact costs nothing by itself. |
| A-21 | medium | Open | Fix | E3 | A Bell rings only from an adjacent tile. |
| A-22 | medium | Open | Fix | R5 | `describeCompassAction` gives the event, the place, the exits and one global Warden mode. |
| A-23 | low | Open | Fix | E4 | A bump into the sealed Gate adds 1 Move. |
| A-24 | low | Open | Fix | E5 | `resolvePulse` sets `pulseVisible` for 2 actions and never adds those tiles to `revealed`. |
| A-25 | low | Open | Fix | E1 | `revealKeys` makes a radius-2 Manhattan diamond with no wall test and no line-of-sight test. |
| A-26 | low | Open | Fix | R5 | `summarizeWardenMode` returns "cleared" when `run.wardens` is empty, and the Gate Warden is not in `run.war... |
| A-27 | low | Open | Fix | E6 | `collectEcho` sets the echo-collected event. |
| A-28 | low | Open | Fix | E5 | The Pulse count comes from the Quest Level and is the same for all 20 Labyrinths. |
| A-29 | low | Open | Fix | E5 | The Pulse button is disabled only at 0 Pulses or outside active status. |
| A-30 | low | Open | Fix | E2 | `createWindways`, `createTideDoors` and `createSignalBells` each get a fixed count of 2. |
| A-31 | low | Open | Fix | E0d2 (structure), E0e (values) | Client and server replay pass the current `getLabyrinthConfig` to `createRun`. |
| A-32 | low | Fixed | Fixed before this plan | none | When no unspent Bell is adjacent, the text says "Signal Bells wait elsewhere". |
| A-33 | low | Fixed | Fixed before this plan | none | With the Compass on, `transition` always calls `onTransition`. |
| A-34 | low | Open | Fix | P3 | In First Light, `main.js` removes "You earned" from the visual event. |
| A-35 | low | Partly fixed | Fix | R5 | `describeExit` matches a Windway by its source only. |
| A-36 | low | Open | Fix | R5 | The Compass uses north, east, south and west. |
| A-37 | low | Open | Fix | E3 | `moveLuredWardens` sets the mode to "lured". |
| A-38 | low | Open | Fix | E4 | A Windway carry sets `lastDirection` to the input direction, not the carry direction. |
| A-39 | low | Open | Fix | E6 | `provide-question` checks only the challenge status. |
| A-40 | low | Open | Fix | R2 | Pause stops the timer, but the canvas keeps the board visible under a PAUSED band. |
| A-41 | low | Open | Fix | E3 | The spawn minimum is max(5, floor(size × 0.6)), which gives 6 to 9 on sizes 11 to 15. |
| A-42 | low | Open | Fix | R5 | `summarizeWardenMode` and `wardenModeNote` rank lured above intercept and hunt. |
| A-43 | low | Open | Fix | E6 | The Challenge text states only the outcome of a correct answer. |
| A-44 | low | Open | Accepted | ADR 0063 (E6): no Vitality recovery | No code path raises Vitality. |
| A-45 | low | Fixed | Fixed before this plan | none | The comment at lines 244-247 says "revealed state only". |
| A-46 | low | Open | Fix | E4 | A Windway, an Echo Bridge or a Tide Door can put the Explorer outside the previous view. |
| A-47 | low | Open | Fix | E2 | The Gate is the farthest passage tile. |
| A-48 | low | Open | Fix | E3 | `resolvePulse` does not change `lastDirection`. |
| A-49 | low | Open | Fix | E3 | `moveWardens` always reserves the Gate tile, and the Explorer can stand on a locked Gate. |
| A-50 | low | Open | Fix | E2 | `createEchoBridges` sets `echoIndex` from the order of a shuffled shortcut list. |
| A-51 | low | Open | Fix | E4 | The reserved set holds only the Gate and the uncollected Echoes, so a Warden can stand on a Windway source. |
| A-52 | low | Open | Fix | V2 | `readRulesetRevision` accepts any revision that `normalizeRunRuleset` accepts, including the legacy windway... |
| A-53 | info | Open | Fix | E0d2 (structure), E0e (values) | `normalizeSeed` makes letters uppercase, replaces other characters with "-", and keeps the first 24 charact... |
| A-54 | info | Open | Fix | E3 | Mode selection tests Intercept first for an odd id. |

### Open issues

| Issue | Disposition | Slice | Title |
| --- | --- | --- | --- |
| #229 | Close at the issue reconcile step | Superseded by ADR 0051 and this plan | Spec: Echo Maze Journey visual rebuild |
| #252 | Close in Z2 | Parent spec of #253 to #273 | Spec: Pilot Chart premium UI rebuild |
| #253 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 01 — Pilot Chart palette rows and Night paper |
| #254 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices. ADR 0057 in R1 amends ADR 0052 | 02 — design.md chart contract and ADR |
| #255 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices. R1 supersedes the token fallback | 03 — Renderer palette rename and Pilot Chart fallback |
| #256 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 04 — Fog screen tile and water passages |
| #257 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 05 — Hatched land and one coastline |
| #258 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 06 — Position-fix Explorer |
| #259 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 07 — Ink Wardens, danger line, and the Gate Warden light |
| #260 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 08 — Neatline, Grid reference, and paper overlays |
| #261 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 09 — Shell header as one ruled tab row |
| #262 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 10 — Board owns the column; panel boxes leave |
| #263 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 11 — Readout as one instrument line |
| #264 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 12 — Action rail and the event ribbon overlay |
| #265 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 13 — Title block and Chart notes |
| #266 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 14 — Landing shows the live chart |
| #267 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 15 — Dialog anatomy base |
| #268 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 16 — Warden challenge, Daily, and Settings dialogs |
| #269 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 17 — First Light and the level wizard |
| #270 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 18 — Atlas map that never clips |
| #271 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 19 — Records ledger and Journal and Workshop pages |
| #272 | Close at the issue reconcile step | Shipped by PRs #274 to #278. Residual B findings keep their R slices | 20 — Class and Admin floor; dead tokens leave |
| #273 | Fix | Z2 | 21 — DESIGN.md from the shipped build and the learn-loop entry |
| #282 | Fix | V2 (receipt and runtime rows), E0e (count-0 row), Z1 and the H6 lane script with the parked lane (migration rows), V1 (score replay row), H4 (e2e rows), Z2 (doc rows), ADR 0054 (architecture row, kept) | Follow-ups from the Windway soft-lock audit loop (ADR 0053) |
| #284 | Fix | E4 | Game logic L1: Windway move rule |
| #285 | Fix | E3 | Game logic L2: Warden pursuit |
| #286 | Fix | E4 | Game logic L3: Tide Door phase |
| #287 | Fix | E1 (state), R2 and R5 (marks) | Game logic L4: Fog and map memory |
| #288 | Fix | E2 | Game logic L5: Echo placement and route reward |
| #289 | Fix | E2 | Game logic L6: Loop density |
| #290 | Fix | E2 | Game logic L7: Twist count scales with size |
| #291 | Fix | E3 | Game logic L8: Bell Lure direction |
| #292 | Fix | R5 | Game logic L9: Trail Compass parity |
| #293 | Fix | E0d2, E0e | Game logic L10: Labyrinth config in the revision |
| #294 | Fix | V2 | Game logic L11: Receipt revision from the Run grant |
| #295 | Fix | E3 | Game logic L12: Warden spawn beyond the Intercept radius |
| #296 | Fix | E5 (A-29), R2 (A-40) | Game logic L13: Pulse input guard and Pause board |
| #297 | Fix | E0d2, E0e | Game logic L14: Seed normalization |
| #298 | Close at the issue reconcile step | The mandate releases the hold. A-11 is on the backlog list, ADR 0063 accepts A-07 and A-44, and each other held finding has a slice | Game logic findings held by rebuild-v3 §5.2 |

### Counts

- B findings: 151: 145 with a fix slice, 2 accepted by ADR, 2 on the backlog list, 2 parked.
- A findings: 5 fixed before this plan, 45 with a fix slice, 1 on the backlog list, 3 accepted by ADR.
- Open issues: 39, each with one disposition.

## 7. `design.md` amendment

The amendment lands with this plan. It closes the open rows of the mockup scorecard.

- Frontmatter gains `stitch-design-system`.
- Board marks gain the Warden telegraph, the Pulse range ring, and the remembered Passage.
- The Fog section defines three states: unknown, remembered, and in sight. A Memory dot, not a tint, separates remembered from in sight. A remembered tile shows no Echo, no Gate, no Warden, no telegraph, and no Danger line.
- The Lured Warden is a square outline, so it shares no shape with the Explorer ring.
- The Echo number has a minimum size. Below it the board draws a plain Echo mark and the Readout carries the number.
- The narrow frame keeps each tick and a 12px gutter. Below 420px the Grid reference labels each second tile.
- The Motion section gains a table: each motion, its duration (120 to 300ms), its property, and its reduced-motion form. Each motion uses `ease-out`. Reduced motion and the reduced-effects setting each stop the load of the motion chunk (B-84).
- The paused board has a full cover: no tile shows under the PAUSED band (A-40).
- The legend contract: the Map marks legend lists each mark that the board can draw, in the colour and shape of the board (B-12, B-47).
- Under `forced-colors: active` each mark keeps its shape and takes a system colour.
- The tile rule at 375px: a size 15 board scrolls inside its frame, so a tile is never below 24px (B-10). The frame follows the Explorer, and a swipe stays a Move.
- Invariant I3 changes: generation 1 revisions never change; generation 2 revisions freeze at slice Z1.

Slice Z2 rewrites `design.md` from the shipped build (#273).

## 8. Backlog list and parked steps

Backlog list (not built in this run):

| No. | Item | Risk note |
| --- | --- | --- |
| 1 | Server record of a Run start: secret Daily seed with a commitment, a grant bind, a Daily defeat record, and a Quest Question order (A-11) | Needs a new table and a new secret. Until then an Explorer can study the Daily offline; first-entry rank limits the gain. |
| 2 | `rebuild-v3.md` §3 hosts and deploy | Platform row. A merge still deploys production with no stage step. |
| 3 | `rebuild-v3.md` §4 payment products and webhooks | Platform row. No change to what a paid Explorer owns. |
| 4 | `rebuild-v3.md` §7 accounts and identity | Platform row. Clerk stays as it is. |
| 5 | `rebuild-v3.md` §8 production data and migration apply | Platform row. Migrations 0018 and later have no live check. |
| 6 | Receipt key per Explorer (B-115) | Needs a key migration on a production table. Until then one Explorer can block a receipt of a second Explorer with a known Run id. |
| 7 | Question ordinal bind at the Run start (B-114) | Needs a column on `run_access_grants`. Until then a receipt can sign a Question sequence that differs from the played one after a second device moves Quest Progress. |

Parked steps:

| Step | Park | Release |
| --- | --- | --- |
| Run of the database integration lane (B-08) | PARK 1: no local PostgreSQL and no test database URL | The owner gives a test database URL, or starts Docker Desktop and permits a PostgreSQL image |
| V3b: the Daily version guard | Depends on the lane | The lane passes with V3b |
| V2b: the offline ledger read by Run id (B-29) | Depends on the lane | The lane passes with V2b |
| Preload of the generation 2 engine chunk | Depends on the activation | The owner sets the variable; one PR changes the preload filter |
| Migration file `0038` in `db/migrations/` | Depends on the lane | The lane applies `0038` on a test database |
| Apply `0038` to production | PARK 2: production data | The owner applies the file with `DATABASE_ADMIN_URL` |
| Set `RULESET_GENERATION_2_FROM` in production | PARK 1: production configuration | The owner sets a future date after V3b and `0038` |
| Set `RULESET_GENERATION_2_DAILY_FROM` in production | PARK 1: production configuration | The owner sets a future UTC date, on or after the date of `RULESET_GENERATION_2_FROM`, after V3b, `0038`, and `RULESET_GENERATION_2_FROM` |
| V1b: the Classroom Run Grant check on the score route | PARK 1: a new SQL statement needs the database lane | The owner releases the database lane; one slice then adds the statement and its test |
| Gate run on Node 22 | PARK 1: a Node 22 install needs a download that the owner permits | The owner permits the install, or runs `npm run check` on Node 22 |

Until V3b merges, no store guard keeps one contract version per date. The parked order sets `RULESET_GENERATION_2_DAILY_FROM` after V3b, so each date holds version 1 until then.

## 9. Critic rounds

Four critics with fresh context read the plan in each round. The lenses: sequence, data and entitlement, feasibility against the budgets, mandate coverage. A separate pass filters the findings. The plan changes until a round returns no finding of Medium severity or above.

| Round | Raw findings | Kept after the filter | High | Medium | Low | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 60 | 32 | 4 | 20 | 8 | Plan revised |
| 2 | 63 | 33 | 4 | 13 | 16 | Plan revised |
| 3 | 60 | 27 | 0 | 14 | 13 | Plan revised |
| 4 | 60 | 37 | 1 | 18 | 18 | Plan revised; instrument changed |

Round 1 changes:

- Run Grant revision column, Daily contract version 2, and the scoreboard CHECK join one migration `0038`. The score floor of rule 11 is 500, so the stored score CHECK holds.
- E0 splits into E0a to E0e. E0b owns the engine handle and the budget rows. E0d makes generation 2 by a copy with a parity proof. E7 moves First Light and the Tactics Lab.
- The activation variable, `resolveRunRevision`, and `acceptsRevision` move from Z1 to E0c. Accept and Grant are separate states. A rollback rule exists.
- Section 4 lists each of the 13 restrictions with no red-going test, its finding, its slice, and its guard. R-27 and R-30 move to the changed table. N-12 to N-15 are new.
- S4 is a logic slice with e2e tests. The headroom floor is 3 KB after a measure. `engines.node` stays `22.x`.
- H3 and V1 have acceptance tests that fail today. E4 comes before E2. E2 has an independent par oracle and a retry bound.
- The score route has a rule for the old payload and for enforcement off. B-115 and B-117 go to the backlog list. V3 adds the B-118 row to the pin.
- The database lane, V3b, the file `0038`, and the Node 22 run are parked steps with one release each.
- The migration table gains Run Grant, Play This Seed, Quest Progress, and Active Run Recovery, and corrects the Echo Postcard row.

Round 2 changes:

- The Run Grant stores no revision. The client names the revision; `acceptsRevision` validates it on each route. Boards partition by revision, so the choice gives no rank gain. Migration `0038` holds two changes.
- Accept and Offer replace Accept and Grant. Each client entry point refuses a successor while Offer is off. The Daily has its own date variable and a one-version-per-date guard.
- SQL rule: a slice with a new or changed SQL statement parks with the database lane. V3 splits into V3a (merges) and V3b (parks as one slice).
- V1 resolves each Question on the server and gives no Score Entry to a Run with no complete log. M2 comes before M3.
- E0p moves the shared helpers. E0d comes before E0c. Generation 2 golden logs start at E0e, and each rule slice makes them again in its PR.
- S0 frees bundle room in M0. S4 names its lazy parts with measured sizes; Run Access stays in the shell. One Run-start budget row keeps 42 KB.
- H3 states the B-149 method and a 4-minute unit target. Each E slice states its added gate seconds.
- N-01 has a fixed band before the sweep. N-16 to N-20 are new. N-04 has a Quest form. The generator has a fallback Labyrinth after 16 retries.
- #253 to #272 close as shipped. B-08 is parked. B-11 moves to E5 with a measure. A-49 changes R-27 in E3. R-05 and R-07 have direct tests in H5.

Round 3 changes:

- No in-memory store exists; tests use query doubles. The start check has three results, and "unknown" gives a retryable 503.
- E0d keeps the successors in a table that no normalizer reads; E0c joins the table and the guard in one PR. Offer gates a new Run only, so a stored successor Run resumes.
- E0c owns the Daily contract map and the `dailyVersion` config field. N-20 moves to E0c.
- The receipt route refuses a retired revision for each Run. A stored receipt binds its revision.
- A Quest Run submits Run Action Log v2. The server binds no Question order; ADR 0056 records the limit.
- The fallback Labyrinth has named exemptions and a rate limit of 1 in 10,000. Each generator slice runs the two sweeps again.
- S1 moves each of the 96 state fields (S1a to S1d). S2 and S3 list each block; `main.js` ends at 300 lines or less.
- R1 and R2 repeat the red proofs of R-05 to R-08. N-21 gives B-11 a limit.
- S0 starts with a spike measure. The free room is 77 bytes. Each milestone has a byte allotment. Four shared chunks get budget rows.
- Rules 13 to 15 are new. V2b parks B-29; B-114 goes to the backlog list. The preload switch parks with the activation.

Round 4 note on the instrument:

- Each round returns 60 or 63 raw findings. The critic prompt holds the phrase "Return at most 15 findings", and each critic fills that number.
- From round 5 the prompt holds no count. It states that an empty list is a valid result.
- Several round-4 findings name an error in text that the round-3 revision added with no check against the source. From round 4, a fact-check workflow reads the source before each revision.

Round 4 changes (each fact comes from the fact-check workflow, which read the source):

- Bundle: the game row sums the main chunk, the renderer, and the larger engine. One Run-start row replaces the four 5% rows. A lazy chunk counts toward the floor only when no Run-start path loads it. Sizes use the unit of the gate.
- S1 starts with a spike, and its invariant is the 42 KB row, not the context object. S2 and S3 cover each line of `main.js`. E0d splits into E0d1 (copy) and E0d2 (config).
- The start check reads constraint definitions. Migration `0038` holds three changes. "Absent" expires after 60 seconds.
- The Daily version is a function of the date and one variable. The config carries `dailyDate`. `createDailyContract` takes a version.
- Each route has its own revision rule. The score body carries `runId`. The log limits are those of v1 and v2. V1 has a client-to-server contract test.
- A later Daily entry returns `bestResult: "unchanged"`.
- Rules 3, 4, 12, 14, and 15 have restrictions N-22 to N-31. A-07 and B-110 are accepted by ADR. The First Light size is a spike outcome.
- The renderer keeps the Neatline on its own canvas, and each R slice runs on the two generations.
- E0c lands each guard before the join. The golden logs have a manifest and an allowlist gate. The hook runs `test:e2e` last.
- B-120, B-90, B-22, B-12, B-47, and B-48 move to the slice that can fix each. Section 7 and `design.md` now agree.

Verify pass after round 4 (four checkers read the source and checked 271 claims of the plan):

- The pass found 10 Medium and about 40 Low defects. Revision 5 answers each one.
- Bundle: the floor is one measure of the game row. A budget row lands in the slice that makes its chunk. H3 fixes the two holes of the bundle gate (B-40, B-41). M5 starts with 1 KB free.
- Server: each Run that can hold a Challenge sends log v2, which holds a Question Revision id and no content. The offline submission route trusts the stored receipt. The Daily follows Accept.
- Rules: First Light and each drill stay on generation 1 until E7. Rule 13 has the Question flag and restriction N-32. Each rule slice names the sweeps that it runs again.
- Renderer: R1 tests generation 1, and R2 adds generation 2. The tile rule at 375 px states the scroll of the frame. The motion row lands in R3.
- Dispositions: B-72 moves to P1, B-84 to R3, and B-133 to E0e and E2.

Round 5 (four lenses and one filter pass): 39 raw findings, 24 kept (5 Medium, 19 Low), 15 dropped.

Round 5 changes:

- Bundle: the "Other JavaScript" limit is set again when a chunk leaves the row, and equal chunks count one time. The generation 2 engine has an exit chunk. S4 lists functions from the call graph, not line ranges. S4a can land before S1.
- S0 defers no part of a Run in flight, and it holds the load tests of S4.
- The Daily: a failed config fetch gives version 1 from the device date. The Daily variable has no default. The board read answers an empty board, not a 503.
- Rules: an Echo Hush and a Bell ring change the telegraph, and the Warden acts from the next action. One helper gives the Twist family of a revision.
- Server: a guest-started Run gets `run-grant-missing` under enforcement. ADR 0056 accepts B-117.
- Proofs: S2 and S3 have a moved-line check. S3 has a static test in place of a line range.
- Coverage: A-05 names E1, R2, and R5. R2 and R3 name each mark and the Run Replay playback. Rows #282 and #298 are complete.

Round 6 (four lenses and one filter pass): 37 raw findings, 26 kept (6 Medium, 20 Low), 11 dropped.

- Source of each kept finding: 11 cite text that revision 6 added (Medium 3, 8, 15; Low 2, 4, 5, 7, 16, 18, 23, 26). 15 cite older text (Medium 1, 6, 9; Low 10 to 14, 17, 19 to 22, 24, 25).
- The count of older Mediums is the signal of the loop: 3 in round 6.

Round 6 changes (revision 7 removes text first, and it adds no new mechanism):

- Removed: slice S4a, the budget park, the fixed byte allotments, the revision literal ban, and the claim of a renderer row of today.
- Corrected to the code of `12b7622`: an Active Run locator with no checkpoint keeps its Run id and revision. A Play This Seed link with no revision stays `classic-v1`.
- Order: the first PR of S2 moves the `elements` map, `canvas`, and `renderer`, and no shell module imports `main.js`. V1 lands the client first and the refusal last. The first successor Run exists in the last PR of E0c.
- The Daily: one function gives the version, and Accept gates the store. The one-version guard and its test belong to parked slice V3b. The parked order sets `RULESET_GENERATION_2_DAILY_FROM` last.
- Bundle: the generator exit chunk has its own row. The milestone allotments are shares of the S4 measure.
- Coverage: E1 holds the in-sight filter with its red test. H5 holds the generation 1 spawn minimum test. B-128, B-42, B-142, #282, and #287 name the slices that hold their tests.

Diff check after revision 7 (one checker read the diff, the 26 findings, and the cited source): 20 findings closed, 6 partly closed, and 22 defects in the changed lines (1 High, 7 Medium, 14 Low). Revision 7b answers each one.

- V1 lands the server first, because the score route caps a body at 16 KiB today.
- The Active Run locator rule quotes the code: a Run on an older revision restarts one time (ADR 0053).
- The call graph gives the PR order of S2 and S3. The Daily date is on or after the Accept date. B-124 names H5 and E3.

### Round 7

Four critics gave 30 raw findings. The filter kept 15: 4 Medium and 11 Low. It dropped 16. No kept finding cites a sentence of revision 7 or 7b; each names a code fact that the plan did not cover. Revision 8 answers each one, and a code sweep covers the class of each Medium.

- The capture log lives in the Recovery envelope, so a Run that Campfire Resume restores keeps its Score Entry.
- The moved-line check compares the two directions as a multiset, and H3 builds its script.
- A Class Play submit keeps the rule of today. The Classroom Run Grant check parks, because it needs new SQL.
- Three readers use the config with no engine. E0e keeps `size` and `wardenCount` equal, and E6 owns the two demand sums.
- A-09 is accepted in ADR 0063. #331 fixes B-142. B-37 has its record next to B-129.

Diff check after revision 8 (one checker read the diff, the 15 findings, and the cited source): 7 findings closed, 8 partly closed, and 19 defects in the changed lines (7 Medium, 12 Low). Revision 8b answers each one except the Z1 freeze, which revision 9 answers with a frozen flag.

- ADR 0056 amends ADR 0025: the log, with each selected option, stays on the device until the Run ends. V1 adds the key to `ENVELOPE_KEYS`.
- The Classroom rule follows the header, not the Run kind. The grant check is the parked slice V1b.
- The demand sums stay. E6 proves that each Challenge of a generation 2 Quest Run gets a Question.
- The par band is the 1st to the 99th percentile of the E2 sweep.

### Round 8

Four critics gave 25 raw findings. The filter kept 16: 3 Medium and 13 Low. Revision 9 answers the 3 Medium findings and 7 Low findings. Six Low findings stay open for the ticket stage: the contract version of the device Daily Record, the M2 allotment, the generator chunk row, the par band sample per row, the Pulse term of par, and the pan rule of a board at 375 px.

- Section 2.5 holds one table with a row per Run kind: log version, capture site, durable store, submit route, and validator. The Daily keeps log v1, and V1 does not change the offline capture.
- A Run with an offline receipt has two stores. The state at the terminal action selects one route.
- V3c holds the first-entry rule in JavaScript and merges. V3b keeps the version guard and stays parked.
- Z1 freezes the golden logs with a frozen flag that the gate reads from `main`.

Diff check after revision 9 (one checker read the diff, the 16 findings, and the cited source): the 3 Medium findings are closed, each changed citation matches the code, and 14 Low defects remain. Revision 9b answers 10. Four stay for the ticket stage: the `createRun` exception of the verbatim move, the ADR line for the date lock, the owner of the generation 2 Daily replay, and the two action limits of the capture log.

### Round 9

Four critics gave 21 raw findings. The filter kept 13: 3 Medium and 10 Low. The owner stopped the critic loop after this round, so no revision answers round 9. The last round is not clean. Each finding below stays open, and the ticket stage answers it before its slice starts.

Open Medium findings:

1. Rule 7 keeps the Tide Door parity lock, so A-03 stays unmet. Each door flips on each Move, and a Move also flips tile parity (`src/game/game-session.js:610-621`, `:1566-1574`). The door state on arrival at a tile is fixed. Fix: give rule 7 a phase that tile parity cannot fix, and add one E4 test with no Pulse.
2. The database lane park rests on a false fact. PostgreSQL 16 and 17 run on this machine, and `initdb` and `pg_ctl` are present. The plan says that this machine has no local database (sections 2.5, 2.7, 5 M6, and 8). Not tested: the start of a scratch cluster on a second port. Fix: one M0 slice starts a throwaway cluster for `npm run test:db`; the lane parks only when that start fails. V1b, V2b, V3b, B-08, and file `0038` depend on this.
3. Section 2.4 still holds a budget park, against revision 7. The PARK LIST of `feature-pipeline` holds no byte-budget item. Fix: remove the sentence; the slice makes more shell code lazy, and the milestone closes only when the slice merges.

Open Low findings:

4. The S4 headroom acceptance cannot fail, and the named candidate views are lazy today.
5. The E0b offline acceptance needs an asset package that no script makes, and no parked step updates `OFFLINE_ASSET_PACKAGE`.
6. The moved-line check and the allowlist gate script have no stated place in the pre-push gate.
7. The start check "present" uses a negative Daily condition that no real catalog proves.
8. The cached "present" survives a later run of migration `0019` or `0037`.
9. The V3a fixes of B-116 and B-119 have no stated bound against the entitlement pin.
10. The game styles row has 0.48 KB free and no stated exit for R2, R4, and R6.
11. Rule 4 and N-02 widen the Bell ring pause, and the A-21 row says Fix in E3.
12. A-28 names E5, but the Pulse count values land in E0e.
13. The Node 22 gate run is parked in the wrong PARK class.

Ten Low findings of rounds 8 and 9b also stay open: the contract version of the device Daily Record, the M2 allotment, the generator chunk row, the par band sample per row, the Pulse term of par, the pan rule of a board at 375 px, the `createRun` exception of the verbatim move, the ADR line for the date lock, the owner of the generation 2 Daily replay, and the two action limits of the capture log.
