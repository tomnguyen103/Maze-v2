# Popup UI implementation plan

Status: approved by the owner on 2026-11-27, with each D1 to D15 recommendation adopted. Implementation starts in a new session. Nothing in this plan is built, committed, or pushed.
Date: 2026-11-27.
Source of the look: `docs/design/mockups/2026-11-26-directions/13-popup/scenes.html` (version 3, approved).
Locked art: Popup theme, Clover the bunny (default Explorer), Fangmoor the Shadow Wolf (Warden).

This plan is a delta on `docs/plans/2026-11-26-premium-rebuild.md`. It is not a second plan.
It keeps M0 to M4 and M6 of that plan as they are. It replaces M5 ("Renderer and Pilot Chart") and section 7 (the Pilot Chart `design.md` amendment).
Each acceptance test of the rebuild M5 rows carries over in full. Each finding that rebuild section 6 gives to R1 to R7 keeps its slice id (section 7 of this plan).

## 1. Owner decisions

Each row has one recommendation. The run adopts the recommendation unless the owner picks another answer.

| No. | Decision | Recommendation | Other answer |
| --- | --- | --- | --- |
| D1 | Rollout of the global tokens | A build-time look flag (section 3). Each Popup slice merges to `main` behind the flag; production keeps Pilot Chart until slice R9 flips the default and deletes the Pilot Chart files | One atomic flip slice: too large for the slice size rule. A long-lived integration branch: breaks the "remote holds `main` alone" rule |
| D2 | When production shows Popup | R9, after R7c: every gen1 surface is Popup. Gen2 marks (R2g, R3g, R5g) land later; gen2 is off in production until its own variable is set, so no Explorer sees a gen2 Run with Pilot Chart marks | Flip after M4 and the gen2 marks: Popup waits for the whole engine rebuild |
| D3 | First Popup slice the owner reviews | R2 board marks (Clover, Fangmoor, paper tiles) in a local preview with the flag on | R7a landing first: it promises a board that does not exist yet |
| D4 | Explorer picker storage | Device-local key `echo-maze:explorer-figure:v1` in the Settings dialog. Account sync parks with the database lane | Sync now: needs Access Settings `version: 3`, a server route change, and a SQL migration, so it parks anyway |
| D5 | Fangmoor at Bright Start | Closed jaw and a softer eye glow at Bright Start. Trail Scout and Maze Master show the full face | One Fangmoor at every Quest Level |
| D6 | Night theme (invariant I1) | Keep Night. Night Popup is a "lamp-lit page": a deep plum page with cream ink. R0a mocks it before code | Drop Night: breaks I1 and the Theme Choice the Explorer already saved |
| D7 | Cover colour | Add `--cover-deep` `#0d5b55` for each text and pull-tab label on the cover (7.63:1 on card). The bright `#17a398` stays for the cover art. This changes the approved look a little | Keep the bright cover and put each label on a sun or card plate |
| D8 | Admin and Class pages | Tokens and fonts only. No Popup art, no flaps | Full Popup restyle: needs mockups and adds two large slices |
| D9 | Fonts | Chewy for the wordmark, scene titles, and Echo digits on the board. Andika for all other text. Geist Mono stays only where a Seed code or Run id shows | Keep Archivo for titles |
| D10 | Readout digits (I7) | Andika tabular digits at 700 weight, the bold file that loads. No Chewy for numbers that change during a Run | Chewy digits: they change width, so the Readout reflows |
| D11 | Character art form | Canvas paths in a lazy art chunk, sized by spike R0c | WebP sprite sheet: only if R0c shows it is smaller and sharp at 24 px |
| D12 | Echo Atlas data | The new Atlas reads the derived model of ADR 0008 (`projectAtlas`, `projectQuestAtlas`). No new stored state | New stored Atlas state: needs a migration and gives a second truth |
| D13 | Records, Lantern Journal, Tactics Lab, Run Replay, Daily Constellation, Echo Postcard, Lifetime, offline continuity | Tokens, fonts, and paper card frames only. A mockup round follows later for each surface the owner wants richer | Mock each now before code |
| D14 | Figure in Run Replay, Echo Postcard, and Class Play | Run Replay and Echo Postcard draw the figure picked on this device. Class Play draws Clover for each Explorer | Always Clover |
| D15 | Pilot Chart terms in GLOSSARY | Keep Readout, Action rail, Title block, Chart notes, Grid reference, and Neatline as names of what each part does; their forms change. Retire the Pilot Chart look term and the water-and-land words of Coastline; Coastline becomes the ink edge where a Passage meets Land | Rename each term to a book word: large churn in code, tests, and copy |

## 2. Relation to the premium rebuild

| Rebuild item | Change |
| --- | --- |
| M0 Harness (H1 to H6, S0) | Unchanged |
| M1 Shell split (S1a to S1d, S2, S3, S4) | Unchanged. S0 and S4 must give at least 3 KB free on the game row before R2 merges |
| M2, M3, M4 | Unchanged |
| M5 Renderer and Pilot Chart | Replaced by M5P (section 4). Slice ids R1 to R7 stay, keep their findings, and keep their acceptance tests |
| M6 Z1 | Unchanged |
| M6 Z2 | Rewrites `design.md` from the shipped Popup build |
| Section 7, Pilot Chart amendment | Replaced by section 3. The rows that are not about the look carry over: three Fog states, the Memory dot, the Echo number minimum size, the Lured square outline, the narrow frame ticks and 12 px gutter, the Grid reference below 420 px, the paused full cover (A-40), the legend contract (B-12, B-47), forced-colors shapes, the tile floor rule of max(24, ceil(48 / DPR)) px (B-10, spike decision 3), the Motion table rule (B-84), and the I3 change |
| ADR 0051 (Pilot Chart replaces Field Journal) | Superseded by a new ADR, "Popup book replaces Pilot Chart" |
| ADR 0052 (Pilot Chart board contract) | Superseded by a new ADR, "Popup board contract". The contract rows carry over; only the forms change |
| Reserved ADR 0057 (R1 token read) | Re-scoped: it amends the Popup board contract ADR, not ADR 0052 |

New ADR numbers: the last file is `0053`, and the rebuild plan reserves `0054` to `0063`. Popup ADRs take `0064` and later. The ADR slice confirms the next free number before it writes a file.

## 3. Rollout: the look flag

`tokens.css` and the font variables are global. A token change restyles every surface at once. The look flag keeps `main` shippable while the Popup slices land one by one.

- A build-time constant `import.meta.env.VITE_LOOK` takes `pilot` (default) or `popup`.
- Each look has its own token file and font imports. A static branch on the constant picks one, so Vite drops the other look from the build.
- `npm run check:bundle` builds both looks. Each budget row must pass in each look.
- `public/theme-boot.js` and the I2 bar colours read the same constant at build time.
- Tests that pin look values run once per look. `tests/design-tokens.test.js` reads the look of the file it checks.
- Local preview and the capture receipts use `VITE_LOOK=popup`.
- R9 sets the default to `popup`, deletes the Pilot Chart token file, its fonts, and its CSS, and removes the constant. The flag is a forced temporary workaround: its label is `shortcut: two looks coexist until R9`, and its removal condition is the R9 merge.

## 4. Design contract (the `design.md` amendment)

The amendment lands in slice R0a, after the owner approves this plan. Nothing in `design.md` changes now. The amendment describes the Popup look under the flag; Pilot Chart stays documented until R9.

### 4.1 Tokens

`design.md` requires `oklch()`. The mockup hexes convert as follows.

| Token | Hex | oklch | Role |
| --- | --- | --- | --- |
| `--paper` | `#fbf3e2` | `oklch(96.6% 0.024 85.8)` | Page ground |
| `--card` | `#fffaf0` | `oklch(98.6% 0.014 84.6)` | Card, dialog, Question page |
| `--ink` | `#3a2449` | `oklch(30.5% 0.070 310.3)` | Text, outlines, Land edges |
| `--ink-soft` | `#5e4a6b` | `oklch(44.3% 0.058 311.6)` | Secondary text |
| `--meadow` | `#6cc24a` | `oklch(73.4% 0.177 137.9)` | Passage tiles (with ink outline) |
| `--sky` | `#4db8ff` | `oklch(75.1% 0.141 241.4)` | Fog flaps |
| `--sky-deep` | `#2a86c4` | `oklch(59.6% 0.126 243.2)` | Flap fold edge |
| `--coral` | `#ff5a3c` | `oklch(68.5% 0.206 32.5)` | One accent: Danger, Vitality loss (marks only) |
| `--coral-deep` | `#c2442e` | `oklch(55.9% 0.166 32.2)` | Coral text (new; 4.57:1 on paper) |
| `--sun` | `#ffd98a` | `oklch(90.1% 0.106 84.7)` | Echo, Gate light, Readout ribbons |
| `--cover` | `#17a398` | `oklch(64.6% 0.109 186.2)` | Book cover art |
| `--cover-deep` | `#0d5b55` | `oklch(42.6% 0.070 186.8)` | Cover text and primary pull-tab (new, D7) |
| `--clover` | `#ffb3c7` | `oklch(84.4% 0.092 2.0)` | Clover body |
| `--scarf` | `#1fb5a8` | `oklch(69.8% 0.117 185.5)` | Clover scarf |
| `--fur` | `#2b1747` | `oklch(26.0% 0.086 299.6)` | Fangmoor fur |

R0a also sets the Night values (D6) and a focus ring token that passes 3:1 on paper, card, and cover.

### 4.2 Contrast (measured, WCAG 2 ratio)

The settled bars: body and title text 7:1, other text 4.5:1, each mark and control boundary 3:1.

| Pair | Ratio | Bar | Result and fix |
| --- | --- | --- | --- |
| ink on paper | 12.44 | 7:1 | Pass |
| ink on card | 13.21 | 7:1 | Pass |
| ink-soft on paper | 7.13 | 7:1 | Pass, small margin |
| ink on sun | 10.17 | 7:1 | Pass |
| ink on sky | 6.29 | 4.5:1 | Pass for labels on flaps; no title text on sky |
| ink on meadow | 6.18 | 4.5:1 | Pass for labels; no title text on meadow |
| ink on coral | 4.44 | 4.5:1 | **Fail.** No text on coral; coral text uses `--coral-deep` on paper |
| coral-deep on paper | 4.57 | 4.5:1 | Pass for short labels only |
| card on cover | 3.00 | 7:1 | **Fail.** Cover text uses `--cover-deep` (D7) |
| ink on cover | 4.40 | 7:1 | **Fail.** Same fix |
| cover-deep on card | 7.63 | 7:1 | Pass |
| cover-deep on paper | 7.19 | 7:1 | Pass |
| coral on paper | 2.81 | 3:1 | **Fail.** Each coral mark carries an ink outline |
| meadow on paper | 2.01 | 3:1 | **Fail** alone. Each tile carries an ink outline |
| sky on paper | 1.98 | 3:1 | **Fail** alone. Each flap carries an ink fold line |
| clover on meadow | 1.32 | 3:1 | **Fail** alone. Clover carries a 2 px ink outline at each size |
| fur on meadow | 7.18 | 3:1 | Pass |
| fur on sky | 7.31 | 3:1 | Pass |

Rule: no board mark depends on fill colour alone. Each mark has an ink outline and a shape cue.

### 4.3 Banned list

| Pilot Chart ban | Popup decision | Limit |
| --- | --- | --- |
| Cream paper ground | Lifted | Paper token only; no texture image |
| Glows | Lifted for Fangmoor eyes and the Gate light only | One glow per mark; off under reduced effects and high contrast |
| Red on the board | Lifted for coral only | Danger and Vitality loss only, always with an ink outline and a shape |
| Drop shadows | Lifted as one "paper lift" token | Two levels only: flat and lifted. No soft grey card shadow |
| Rounded tiles | Lifted | One tile radius token; dialogs and pull-tabs have their own radius tokens |
| Pills | Kept | Pull-tabs are tab shapes, not pills |
| Gradient washes | Kept | Flat fills only |
| Emoji as icons | Kept | Drawn marks only |

### 4.4 Fonts

| Face | Package | Use | Check in R0a |
| --- | --- | --- | --- |
| Chewy | `@fontsource/chewy` 5.3.0 (on npm) | Wordmark, scene titles, board Echo digits | Latin subset size; offline asset package |
| Andika | `@fontsource/andika` 5.3.0 (on npm) | Body, Readout, Questions, Chart notes | Latin 400 and 600 sizes; tabular digits (D10) |
| Archivo, Atkinson Hyperlegible Next | in `package.json` today | Pilot look only; removed in R9 | Bytes freed at R9 |
| Geist Mono | in `package.json` today | Seed code and Run id only (D9) | Each use listed |

Pass criterion: the shared styles row stays at or under 13 KB in each look, and the first play paint loads at most two font files. Popup font files enter the offline asset package, so offline continuity shows the same faces. The server sets that package in `OFFLINE_ASSET_PACKAGE`, and the client holds no font list. R0a defers this step: the Popup font URLs join that value in the slice that ships Popup.

### 4.5 Variants

| Variant | Mocked | Decision |
| --- | --- | --- |
| Night (I1) | No | D6. R0a mocks one board and one dialog before R1 code |
| High contrast (Access Setting) | No | Ink outlines 3 px; flaps become a solid hatch on card; glows off |
| Large marks (Access Setting) | No | Marks scale 1.25 in the tile; below the Echo number minimum size the digit moves to the Readout |
| Reduced effects and `prefers-reduced-motion` | No | No flaps, confetti, or pop-ups; the motion chunk does not load (B-84) |
| `forced-colors: active` | No | Each mark keeps its shape and takes a system colour; Fangmoor eyes use `Highlight` (B-93) |

### 4.6 Board marks

> Amendment, 2026-11-28 (ADR 0067): the board draws paper forms from the owner-approved mock. A Passage is cream paper, Land is a meadow card with a deep lip and an ink outline, unknown tiles are sky Fog cards with a folded corner, and the Echo is a coral-deep disc. The rows below that name a hatch, a Fog fold line, or a Pulse tint read as superseded where they differ.

| Mark | Popup form | Mocked |
| --- | --- | --- |
| Passage | Meadow paper tile, ink outline, tile radius | Yes |
| Land | Raised hedge card in a darker green with ink hatch | Yes |
| Coastline | Ink edge where a Passage meets Land, 3:1 on both grounds | Yes |
| Fog (unknown) | Sky flap, closed, ink fold line | Yes |
| Remembered tile | Flap folded half back with a Memory dot; no Echo, Gate, Warden, telegraph, or Danger line | No (R2 spike) |
| In sight | Open tile | Yes |
| Danger line | Coral dashed line with ink outline between a Warden and its next tile | No |
| Explorer | Clover (or the picked figure), ink outline | Yes |
| Warden, patrol | Fangmoor, round eyes, ears up, round shape cue | Eye colour yes; cue added |
| Warden, hunt | Fangmoor, slit eyes, ears back, pointed shape cue | Eye colour yes; cue added |
| Warden, intercept | Fangmoor, chevron shape cue | No |
| Warden, Lured | Fangmoor in a square outline, eyes closed | No |
| Telegraph | Paper arrow tab in the next tile | No |
| Echo with number | Sun paper star, Chewy digit, minimum size rule | Yes |
| Gate | Pop-up arch with sun light | Yes |
| Pulse range ring | Dashed ink ring, static form | No |
| Pulse tint (B-48) | Flap lift on Pulse tiles, listed in the legend | Yes |
| Twist marks | Paper sticker per Twist kind | No |
| Neatline and Grid reference | Ruled page edge with one tick per tile | No |
| Paused cover | Book half closed, full cover, "Resume" tab (A-40) | Yes |

Warden Mode rule: eye colour shows the Mode, and each Mode also has a shape cue. The legend and the Trail Compass list each Mode by name.

Art fallback: until the art chunk loads, or if it fails offline, the board draws the current shape marks (Explorer ring, Warden silhouette per Mode). These marks meet the mark contract, so the Run plays the same. A test covers the fallback.

## 5. M5P slices

Slice size: a target of 200 changed lines, a split above 400, and tickets of at most 150 lines. Each R slice carries the capture receipt (375, 1280, 1920 px, with `VITE_LOOK=popup`), the impeccable detector result (exit 0), and a stitch-pipeline receipt. Each rebuild M5 acceptance test stays in its slice; the column below adds the Popup tests.

| Slice | Needs | Content | Popup acceptance test (added to the rebuild test) |
| --- | --- | --- | --- |
| R0a | M1 | Look flag (section 3); Popup token file; fonts; `design.md` amendment; Night, high contrast, and forced-colors mock frames; Stitch `update_design_system` | Each section 4.2 pair meets its bar; both looks pass every budget row; the Pilot build is byte-equal to `main` before the slice |
| R0b | M1 | Tile spike: Clover and Fangmoor at 24 px and 32 px, on canvas, at DPR 1, 2, and 3 | Pass: each Warden Mode and the Explorer are named from a 24 px crop; else the board keeps 32 px and the 375 px frame scrolls (B-10) |
| R0c | M1 | Art chunk spike: canvas paths against a WebP sprite sheet for Clover, Pip, Lumi, Fen, Tuck, and Fangmoor | The smaller sharp form wins (D11); the result sets the art chunk budget row |
| R1 | R0a | Layered renderer, token read with no silent fallback (ADR 0057 re-scoped), repaint on a theme change, Popup `palette.*` | Rebuild R1 tests (B-22 to B-24, B-81 to B-95, Neatline tick alignment at 375, gen1 golden Run); each test runs in each look |
| R2 | R1, S0/S4 headroom | Gen1 board marks of section 4.6; art chunk with fallback; legend contract; paused cover | Rebuild R2 tests (B-12, B-47, B-48, A-40); each mark meets its contrast row; a gen1 Run draws no telegraph and no Memory dot; the fallback test passes |
| R2b | R2 | Explorer picker in the Settings dialog: Clover (default), Pip, Lumi, Fen, Tuck; device-local key (D4); GLOSSARY term for the picked figure | A new device shows Clover; a pick survives a reload; a bad stored value gives Clover with no error; Run Replay and Echo Postcard draw the pick (D14) |
| R2c | R2 | Fangmoor at Bright Start (D5) | A Bright Start Run draws the closed jaw; Trail Scout draws the full face |
| R2g | R2, M4 | Gen2 marks: remembered tile, Memory dot, telegraph (A-05 marks) | Rebuild R2 gen2 tests |
| R3 | R1 | Motion chunk with its budget row, gen1 motions: flap ripple on Pulse, Gate pop-up, Sigil Ceremony pop-up, paper confetti on Gate reached; each one-shot | Rebuild R3 tests on a gen1 Run (B-84); no motion loops |
| R3g | R3, M4 | Gen2 motions | Rebuild R3 tests on a gen2 Run |
| R4 | R1 | Play shell: header, board column, ribbon Readout, pull-tab Action rail, Title block, event line, Chart notes fold-out | Rebuild R4 tests (B-02, B-09, B-10, B-46, B-49, B-50, tick alignment after the scroll) |
| R5 | R2 | Trail Compass parity with the gen1 Popup marks | Rebuild R5 tests (B-13, B-14, B-51 to B-62, R-08, A-22) on gen1 |
| R5g | R5, R2g | Compass text for the gen2 marks | Rebuild R5 tests on gen2 |
| R6a | R1 | Warden Challenge as a pop-up Question page: Question Hint, Question Skip, Read Aloud; right answer with Echo Lens; wrong answer tears a Vitality ribbon | Focus returns to the opener; Read Aloud and the Hint keep their behaviour; `#live-region` sits inside the dialog (B-52 stays with R5) |
| R6b | R1 | Start a Quest (Quest Level wheel, "Play your way", Lifetime Membership), First Light Tutorial, "On this device" / "In your account", Quest conflict | Each dialog follows the Dialog anatomy; copy uses GLOSSARY terms only |
| R6c | R1, R3 | Gate reached, Sigil Ceremony with skip, Run ends with retry and "Play This Seed" | Skip works with the keyboard; reduced effects show the static form |
| R6d | R1 | Other dialogs: records, player, daily, challenge, journal, practice, scoreboard, lifetime, result, Verified Daily Board, "Choose a learning goal" | Tokens, fonts, paper card frame (D13) |
| R7a | R2 | Landing page: hero from a real gameplay crop of the Popup board; `renderLanding` and the `index.html` copy change together; hero WebP files per look | The landing markup equality test passes; the landing JS row stays at or under 8 KB |
| R7b | R1, R3 | Echo Atlas pop-up book: tunnel book, stamp sheet, index tabs, Sigil seals, locked and cleared stamps, phone layout | Each `AtlasNodeState` maps to one stamp form; five Regions and twenty landmarks render from `projectAtlas` with no new state (D12) |
| R7c | R1 | Records, Lantern Journal, Tactics Lab, Run Replay, Daily Constellation, Echo Postcard, Lifetime, offline continuity, Class, Admin: tokens and fonts | Captures show no Pilot Chart token in the Popup look; detector exit 0 |
| R8 | R7c | ADRs, GLOSSARY (D15), `design.md` sync | Each new ADR names what it supersedes; GLOSSARY lists each new term |
| R9 | R8 | Flip: default look `popup`; delete the Pilot Chart token file, fonts, CSS, and the flag | Every budget row passes with the Pilot Chart bytes gone; desktop and mobile gameplay checks (skill `verify`) pass |

R7b Atlas state map:

| `AtlasNodeState` | Stamp form |
| --- | --- |
| `completed` | Inked stamp, landmark in colour |
| `current` | Stamp outline with Clover pin, sun edge |
| `ahead` | Blank perforated stamp, landmark in ink line only |
| `milestone` | Sealed envelope with the Region Sigil outline |
| `completed-milestone` | Pressed wax Sigil seal |

## 6. Budgets

| Row | Today | Rule |
| --- | --- | --- |
| Game row (main + renderer + engine) | 42 KB, 77 bytes free | No Popup art enters this row. R2 merges only after S0 and S4 give 3 KB free. M5P uses at most 40% of that free space |
| Renderer row (added by E0b) | 6 KB | R1 and R2 fit in it, or the mark layer moves to its own lazy file |
| Art chunk row | new | Added in R0c, sized by the spike. Loads after the first board paint; the shape-mark fallback draws until then. In the offline asset package |
| Motion chunk row | new (rebuild R3) | One-shot motions only; not loaded under reduced motion or reduced effects |
| Game styles row | 5.52 of 6 KB | Each look must fit; Popup CSS does not add to the Pilot build |
| Shared styles row | 13 KB | Fonts per section 4.4, in each look |
| Landing JS row | 8 KB | R7a stays under it |

No slice raises a row. A slice that needs more moves code to a lazy file or removes old CSS in the same diff. `scripts/check-bundle-budget.mjs` gains the two-look build in R0a and the art chunk row in R0c.

## 7. Finding homes

Each finding that rebuild section 6 gives to an R slice stays in that slice. Gen2 parts move to the matching `g` slice.

| Slice | Findings |
| --- | --- |
| R1 | B-22, B-23, B-24, B-81, B-82, B-83, B-85, B-86, B-87, B-88, B-89, B-91, B-92, B-93, B-94, B-95 |
| R2 / R2g | B-12, B-47, B-48, A-40; A-05 marks in R2g |
| R3 / R3g | B-84 |
| R4 | B-02, B-09, B-10, B-46, B-49, B-50 |
| R5 / R5g | B-13, B-14, B-51 to B-60, B-62, R-08, A-22; A-05 marks in R5g |

R0a re-reads rebuild section 6 rows 500 to 765 and adds any R-slice finding this table misses.

## 8. Surface inventory

| Surface | Mocked in `scenes.html` | Slice |
| --- | --- | --- |
| Landing 1280 and 375 | Yes | R7a |
| Echo Atlas 1280 and 375 | Yes | R7b |
| Start a Quest, First Light, sign-in choice, Quest conflict | Yes | R6b |
| Play, Pulse, Chart notes, Paused, play at 375 | Yes | R1 to R4 |
| Warden Challenge, Questions, right and wrong answer | Yes | R6a |
| Gate reached, Sigil Ceremony, Run ends | Yes | R6c |
| Verified Daily Board, "Choose a learning goal" | Yes | R6d |
| Settings with the Explorer picker | Partly (`explorer.html`) | R2b, one Stitch CHANGE round first |
| Records, Lantern Journal, Tactics Lab, Run Replay, Daily Constellation, Echo Postcard, Lifetime, offline continuity | No | R6d and R7c, tokens only (D13) |
| Class, Admin | No | R7c, tokens only (D8) |

## 9. Tests each slice changes

| Slice | Tests |
| --- | --- |
| R0a | `tests/design-tokens.test.js` (palette values, type families, banned list, Pilot Chart name, ADR names), `tests/theme.test.js`, the budget script tests, `tests/service-worker.test.js` and `tests/offline-content-pack.test.js` (font files in the asset package) |
| R1 | `tests/canvas-renderer.test.js`, `tests/theme.test.js` |
| R2, R2b, R2c, R2g | `tests/canvas-renderer.test.js`, `tests/region-theme.test.js`, Access Settings tests, `tests/service-worker.test.js` and `tests/offline-content-pack.test.js` (art chunk offline) |
| R4 | `tests/e2e/layout-redesign.spec.js`, `tests/audit-accessibility.test.js` |
| R5, R5g | Trail Compass tests |
| R6a to R6d | `tests/audit-accessibility.test.js`, dialog e2e specs |
| R7a | `tests/audit-performance.test.js` (landing markup equality), landing tests |
| R7b | Quest Atlas view tests, `tests/region-theme.test.js` |
| R8 | `tests/design-tokens.test.js` (GLOSSARY terms, ADR names) |
| R9 | Each test that runs per look drops the Pilot run |

A test changes in the same slice as the code it pins. No test is deleted to make a slice green; a pinned value changes to its Popup value, and the commit states the reason.

## 10. Pipeline per slice

Each slice runs the CLAUDE.md pipeline: `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, `/audit-loop`, `pr-workflow`.

1. Grill at modification scale. The open D rows feed the first round.
2. Spec: the acceptance column becomes the BDD matrix; the Oracle column names the mock scene in `scenes.html`.
3. Stitch: CHANGE tier for a screen in Stitch project `3244739478942983822`; LEGACY tier for a screen not there yet. R0a calls `update_design_system` with the section 4 tokens first.
4. Implement: one builder at a time on a `feat/` branch off fresh `main`.
5. Gate: `npm run check` (both looks), the impeccable detector, captures at 375, 1280, and 1920 px, and desktop and mobile gameplay checks (skill `verify`).
6. Review: CodeRabbit per `pr-workflow`, then merge and delete the branch.

## 11. Order

Derived from the Needs column. Every step before R9 is behind the flag, so production shows no change.

1. M0 and M1 of the rebuild.
2. R0a, R0b, R0c.
3. R1.
4. R3, R4, R6a, R6b, R6d, R7c (each needs R1 only).
5. R6c and R7b (need R3).
6. S0 and S4 headroom confirmed, then R2 (D3: first board review), R2b, R2c, R5, R7a.
7. R8, then R9 (D2: production shows Popup).
8. M2, M3, and M4 of the rebuild in their own order. After M4: R2g, R3g, R5g.
9. M6.

## 12. Parked and out of scope

| Item | Reason |
| --- | --- |
| Account sync of the Explorer pick | PARK 1: Access Settings `version: 3` needs a SQL migration and the database lane |
| Rich Popup layouts for the D13 surfaces | Need a mockup round and owner approval |
| Popup audio (page turns, flap sounds) | Not asked for; no audio budget row |
| Question bank and Quest Level logic changes | Out of scope; the samples in `scenes.html` are illustrative |
| Adaptive Difficulty Band tuning | Later decision |

## 13. Risks

- The game row has 77 bytes free today. If S0 and S4 do not give 3 KB, R2 waits, and so do R7a and R9.
- Two looks double the CSS and font work until R9. The flag keeps each build inside its rows, but the gate runs twice.
- Clover at 24 px may not read (R0b). Closed by the R0b spike (`docs/research/2026-11-27-popup-art-spike.md`): a tile needs at least 48 device px, so tile CSS px = max(24, ceil(48 / devicePixelRatio)). At DPR 1 the tile is 48 px, not 32 px, and the frame scrolls at 375 px (B-10).
- Fangmoor may still be too scary for Bright Start. D5 gives a softer form; the owner decides from the R2c capture.
- Night Popup is not mocked. R0a mocks it before code, so the owner sees it before R1.

## 14. Run status, 2026-11-27

The run merged these slices. Since R9, Popup is the only look in every build, and production shows Popup.

| Slice | Status | Where |
| --- | --- | --- |
| R0a | Merged | #303 (tokens, fonts, look flag, ADR 0064) |
| R0b, R0c | Merged | #308 (art spike: the 48 device px tile rule, canvas paths, art row estimate 4 KB) |
| Game-row headroom | Merged | #309 (lazy shell views free 2.9 KB on the game row) |
| R1 | Merged | #304 (token read, repaint on a theme change), #316 (R1a renderer findings), #317 (R1b chart layer and Fog layer) |
| R2, R2b, R2c | Merged | #310 (board marks, Warden Mode legend, paused cover), #311 (Explorer picker), #312 (soft Fangmoor, Lured face) |
| R4, R6a, R6b, R6d, R7c | Merged as CSS under the flag | #306, with fixes in #307. #325 builds the R4 JS findings: B-10 (a tile floor of max(24, ceil(48 / DPR)) px on the play board, fixed in #326, with a frame follow that keeps a manual scroll) and B-02 (a square Watch Trail canvas). R7c had one gap: the Readout numbers used Geist Mono against D9. The fix in #322 sets them in Andika. The `theme-color` value is correct: the `popup-bar-colors` plugin writes the Popup paper colour into the Popup build |
| R5 | Merged | #313 (Trail Compass text parity, live region in dialogs), with a fix in #315 |
| R7a | Merged | #314 (landing hero from a real board crop) |
| R3 | Merged | #318 (motion chunk: flap ripple, Gate pop-up, paper confetti, ceremony pop-up, reduced-motion gate) |
| R6c | Merged | #319 (gate, Sigil, and defeat end cards; Play This Seed; one start at a time from the card), with a fix in #320 |
| R7b | Merged | #321 (Echo Atlas stamp sheet, five stamp forms, tunnel-book frame, phone layout) |
| R2g, R3g, R5g | Parked | Need rebuild M4 (generation 2 engine) |
| R8 | Merged | #323 (ADR 0065 and ADR 0066 supersede ADR 0051 and ADR 0052; GLOSSARY terms per D15; `design.md` sync) |
| R9 | Merged | #324 (Popup is the only look; the Pilot Chart look, the `VITE_LOOK` flag, the `@look` alias and the Pilot landing images are deleted). The gen2 marks land later |
| Follow-ups | Merged | #325 (B-10, B-02, the 250% zoom check again, the ADR 0064 Retirement note and the SETUP font line) #326 (the B-10 tile floor from the device pixel ratio) and #327 (the B-10 follow-up gaps: the held-key scroll, the tile floor fallback and the pixel ratio repaint) and #328 (e2e coverage of the pixel ratio repaint, its re-arm and the held game keys). The Stitch design system drift stays parked under the `design.md` `stitch-note` |
| Board paper forms | Merged | #329 (ADR 0067: paper forms for Passage, Land, Fog, Echo, and the Pulse flap; the hatch, the Fog dot, and the Pulse wash removed; the ink edge on the sticky Neatline). #330 holds the deferred review findings |
| e2e frame fix | Merged | #331 (the layout tests measure `#canvas-frame`; the Playwright web server builds the e2e bundle into `dist-e2e/`, which fixes B-142) |
| Renderer hardening | Merged | #332 closes #305 (repaint guard, renderer `destroy()`, the start error log, one paint on a theme change, the game row pin). Deferred: `onPaletteChange` and the settings `onApply` callbacks still paint twice; a switch between two high-contrast themes with the same scheme fires no event |

The game row measures 41.23 KB of 42 KB after #329. The motion chunk is 0.83 KB.
