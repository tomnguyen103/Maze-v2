# Echo Maze premium UI rebuild: Pilot Chart, executed

Status: plan, revision 1. Implementation starts only after the owner replies "approved".
Date: 2026-11-24. Base commit `020c1ba` on `fix/swarm-audit-safe-fixes` (83 uncommitted files; this plan is not committed).

Sources: `design.md` (Pilot Chart contract), `tokens.css`, `docs/plans/rebuild-v3.md` §6 and P6 (status: plan, awaits "approved"), `GLOSSARY.md`, 90 baseline captures under `.scratch/premium-ui/baseline/` (15 surfaces × light and Night × 375, 1280, 1920 px), five surface critiques and one adversarial synthesis from a seven-agent audit (117 findings, 13 craft references), the impeccable detector (`detect.mjs --json src index.html` exits 0 today), and 13 reference sites read on 2026-11-24. A claim with no capture or code line carries `[code-only]`.

Terms follow `GLOSSARY.md`: Explorer, Labyrinth, Run, Echo, Gate, Warden, Vitality, Pulse, Fog, Readout, Action rail, Title block, Chart notes, Theme Choice, Echo Atlas, Atlas Region, Region Hue, Pilot Chart, Daily Shared Labyrinth, Quest Level, First Light Tutorial, Lantern Journal, Tactics Lab, Run Record, Classroom. New terms this plan names: **Neatline** (the 1px ink frame around the board with tick marks per tile), **Grid reference** (column letters and row numbers outside the Neatline), **Chart device** (a Neatline, a tick border, a title block, a scale bar, a compass rose, a ruled ledger, or a stamp), **Ruled row** (a list row divided by a hairline, with no border box), **Button tier** (primary ink fill, secondary ink outline, tertiary underlined text link).

Review artifacts: the sample screens on the Design canvas at
<https://claude.ai/artifact/UMbg8huQAwDXUsusNtdJk5> (§10).

## 1. Verdict

The direction is right. The contract is thin. The execution drifted.

- **Direction.** Pilot Chart is a premium identity: a finite symbol set from U.S. Chart No. 1, one magenta light, three water screens, paper and ink. No critique argued against it.
- **Drift.** The code breaks the written rules on every surface. Evidence:
  - Landing: the hero crop `public/landing-gameplay.webp` is a Field Journal capture on cream (commit fc9aaf9, 2026-10-09, before Pilot Chart landed in b5caf3d). The alt text at `index.html:68` and `src/landing/landing-controller.js:36` says "buff chart paper: ivory passages". `tests/audit-performance.test.js:189` asserts that alt. Both prices sit in Geist Mono (I7). The step row is three equal cards (`src/daylight.css:1938`).
  - Play: the board is 432 px wide inside a 910 px panel at 1280 (`quest-board-light-desktop.png`; `daylight.css:519-529`). Five bordered boxes nest in `.labyrinth-panel`. The event ribbon is a magenta-filled bar that animates `max-height` (`daylight.css:715-751`). Walls are brown rounded tiles (`canvas-renderer.js:287-309`; `tokens.css:81-83`). Wardens render red (`canvas-renderer.js:651`). The renderer's `palette.signal` reads `--color-explorer`, so lights flip blue and magenta by state (`canvas-renderer.js:777`).
  - Dialogs: magenta panel fills on five non-light surfaces (`first-light.css:68`; `game-dialogs.css:129, 617, 1180, 1253, 1304`). Every dialog carries a soft border, a 6px radius, and a shadow (`game-dialogs.css:45-48`). `--color-line-soft` edges reach 1.53:1 light and 1.44:1 Night; I4 needs 3:1.
  - Atlas: a card grid covers a static SVG with `preserveAspectRatio="none"` (`quest-atlas-view.js:449-462`); the map clips at every desktop width (`quest-atlas.css:6, 35`); on a phone about 24 CSS px of map show on open.
  - Shell: four routes, four shells (72, 84, 76, 82 rem; ink or soft border; sticky or not). The Admin gate page has no styles at all (`admin-controller.js:133-136`).
- **Under-specification.** `design.md` names no Neatline, title block, scale bar, ledger, dialog anatomy, button tier, shared shell, empty state, or type size below body. The palette table has no Wall, Fog, Passage, Explorer, Echo, or danger row. Fog density and hatch weight have no number. The code improvised, and the detector cannot see what the contract does not name. The detector exits 0 today, so the premium gap is craft, not a mechanical rule.

## 2. The template test

Fix every finding in §4 and the app still reads as a template. The first play frame proves it: nine tiles in a blank dotted field. A wider empty board at move 0 is a larger template. The seven gaps the rebuild must close:

1. **A chart, not a canvas in a box.** Neatline, tick border, Grid reference, corner title block, scale bar. The board reads as a sheet only with these devices.
2. **The board is the only hero.** Every surface leads with chrome today: the landing with a wordmark h1, the play page with eight buttons and a subtitle, the Atlas with four text rows. The Labyrinth is the first object at every breakpoint.
3. **Signature moments.** The Pulse reveal ring, the Explorer's dead-reckoning trail with a tick every ten moves, and the Gate's light sector that points into the entrance. Without these the Pulse is a pink rectangle and progress is a counter.
4. **Hierarchy by one axis.** Size and weight of upright Archivo on one ink. Today four devices compete: caps eyebrow, box, water screen, chip.
5. **Motion.** One draw-on, then stillness. Today's motion is a layout-shifting toast and a trail that draws under its frame.
6. **Empty states.** A blank ruled chart. Records, Atlas, and the move-0 board draw the ruled page, not placeholder copy.
7. **Copy voice.** One fact per line, present tense. The play panel states the objective five times. The Readout reads aloud as one sentence.

Ten principles the critiques agree on sit in Appendix A.

## 3. Contract decisions

`design.md` is the live contract. `rebuild-v3.md` §6 is a plan that awaits approval. Where the two conflict, this plan picks one rule and amends `design.md` in slice S-A. Each row is a decision the owner can overturn in the approval reply.

| # | Topic | design.md | rebuild-v3 §6 | This plan |
| :-- | :-- | :-- | :-- | :-- |
| C1 | Walls | hatched ink | buff land, coastline stroke | Paper land, 45° ink hatch from a `createPattern` tile, one ink coastline around each merged wall run. Buff is a cream-family tint and stays banned. |
| C2 | Wardens | ink marks | magenta danger circle | Ink silhouette (round, pointed, chevron, ringed) with a dotted ink danger line. Only the Gate Warden carries the Signal light. Red leaves the play palette. |
| C3 | Explorer | not named | position-fix symbol | Position-fix symbol: ink ring with a centre dot, no glow. The trail is a dashed ink track with a tick every ten moves. The `--color-explorer` blue marks the trail head only. |
| C4 | Fog | stippled | 8 × 8 dot screen tile | An 8 × 8 pattern tile at 4 to 6% ink coverage. The high-contrast toggle removes it. |
| C5 | Monospace | Readout numbers, seeds, code, IDs (I7) | banned | I7 stands. Geist Mono sets Readout numbers, seeds, and IDs only. Prices and every label move to Atkinson. |
| C6 | Section labels | 12px 700 uppercase | banned | Kept as a group label, one per page region at most. Never an eyebrow above a headline. |
| C7 | Region Hues | restrained washes, 3:1 fill | light characteristic per Region | 12 to 18% hue wash on paper. The 1px ink coastline carries 3:1, not the fill. The Atlas rule in `design.md` changes to say so. |
| C8 | Lights | Signal on lights only | same | Unchanged. Every signal-soft panel fill becomes Water 1 or Stone with a 1px ink border. |
| C9 | Night ground | `oklch(21% 0.012 250)` | S-52 night table | Paper `oklch(21% 0.03 250)`, muted ink to L84, Night water screens deepen. I1 and I2 hold. |

## 4. Ranked findings

Severity and confidence come from the audit. PNG names refer to `.scratch/premium-ui/baseline/`.

| # | Surface | Sev | Conf | Finding | Fix |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Play | critical | 0.95 | Board 432 px in a 910 px panel at 1280 (`quest-board-light-desktop.png`; `daylight.css:519-529` sizes from `100dvh - 23rem`). | Size from the column: `min(100%, 44rem)` at 1280, 60 to 70% of the panel at 1920. Chart notes become the side gutter at 85rem+. |
| 2 | Canvas | critical | 0.95 | Brown rounded wall tiles, red Wardens, blue "signal", radial Explorer glow (`canvas-renderer.js:287-309, 339-351, 651, 777`). | Repaint to §3 C1 to C4. Rename `palette.signal` to `palette.explorer`; add `palette.light` bound to `--color-signal`. |
| 3 | Landing | critical | 0.95 | Cream Field Journal crop, trail squiggle under the frame, mono prices, h1 repeats the wordmark 300 px under it (`landing-light-desktop.png`). | New light and Night crops from the live renderer behind `<picture>`; trail inside the frame; price line in body type; the h1 states the promise. |
| 4 | Atlas | critical | 0.9 | Card grid covers a static stretched SVG; clips at every width; no map on phone open (`quest-atlas-light-desktop.png`, `quest-atlas-light-mobile.png`). | SVG is the surface: `xMidYMid meet`, data-bound stamps per completed Labyrinth, region names as chart labels, detail as a bottom sheet on phones. |
| 5 | Canvas | critical | 0.85 | Night Explorer ring L74 on passage L84 fails 3:1 (`quest-board-dark-mobile.png`; `tokens.css:206, 281`). | Night passage drops to about L34; Explorer ring takes ink. Add Explorer, Passage, Wall, Fog rows to the palette table. |
| 6 | Play | high | 0.9 | Event ribbon is a magenta-filled bar that shifts layout (`daylight.css:715-751`; `main.js:5097-5104`). | Absolute overlay inside the Neatline, paper fill, ink hairline, 2px Signal left rule, reserved height. |
| 7 | Play | high | 0.85 | Five nested bordered boxes in `.labyrinth-panel` (`daylight.css:344-355, 377-386, 451-461, 519`). | The page is the sheet. The only border is the Neatline. Zones divide by hairline rules. |
| 8 | Shell | high | 0.9 | Eight equal boxed buttons plus a subtitle above the board; about 300 CSS px of chrome before the first tile on a phone (`quest-board-light-mobile.png`). | One shared shell: wordmark, New Quest as primary, Daily and Atlas as secondaries, the rest behind Menu. One row from 64rem. Two buttons on phones. |
| 9 | Canvas | high | 0.9 | Fog is one 40%-alpha dot per cell, about 0.25% coverage (`play-firstlight-light-desktop.png`; `canvas-renderer.js:311-333`). | §3 C4 pattern tile. |
| 10 | Dialogs | high | 0.95 | Magenta panel fills on five non-light surfaces (`play-dialog-light-desktop.png`, `quest-daily-light-desktop.png`, `quest-warden-light-desktop.png`). | §3 C8. |
| 11 | Dialogs | high | 0.9 | Soft border, 6px radius, shadow on every dialog; `line-soft` edges at 1.5:1 (`game-dialogs.css:45-48`). | Dialog anatomy (§5): 1px ink border, 4px radius, no shadow, header band, sticky footer. Interactive edges in `--color-line`. |
| 12 | Type | high | 0.85 | Geist Mono on prices and labels; tracked caps eyebrows above headlines; five display tracking values; meta text under 12px. | §3 C5 and C6. Two tracking tokens (`-0.02em` above 1.5rem, `0` below). 12px floor. |
| 13 | Play | medium | 0.85 | Readout is four boxed cells with caps eyebrows plus a separate Warden mode box (`daylight.css:356-410, 451-517`). | One ruled instrument line: 2rem Geist Mono number, 12px body label after it, Warden silhouette drawn inline as the fifth item. |
| 14 | Play | medium | 0.8 | Title block mixes an eyebrow, a middle-dot meta string, a chip, and a dashed seed button (`daylight.css:753-946`). | Chart corner block: two rules, Archivo "Labyrinth 4 of 20" at 1.4rem, level and ruleset in body type, seed as a plain Geist Mono token with a copy icon. |
| 15 | Canvas | medium | 0.85 | No Neatline, ticks, Grid reference, scale bar, or title block. | Draw them once in the renderer and the DOM frame (§5 Chart devices). |
| 16 | Play | medium | 0.8 | Chart notes state the objective five times in a second card (`daylight.css:948-972`). | One objective line in the title block. Log, legend, and hint as Ruled rows with no outer border. |
| 17 | Play | medium | 0.8 | Mobile d-pad is four 45 px boxed squares beside two boxed buttons (`daylight.css:1584-1640`). | One ink-outlined cross with 56 px arms and hairline dividers. Pause becomes a 40 px icon button in the Readout row. Pulse keeps the Signal fill at the rail's right. |
| 18 | Atlas | medium | 0.85 | Pills, unicode glyph icons, 0.62 to 0.72rem type, coloured glow shadow, floating `::after` connectors (`quest-atlas.css:263, 338, 341-360, 467-519`). | Chart No. 1 sprite, 12px floor, no shadow, SVG trail only. |
| 19 | Atlas | medium | 0.85 | Four text rows and a three-row toolbar before the map on phones. | One 40 px toolbar row; a Readout-style status strip (Mapped 3/20, Sigils 0/5, Fossils 0); detail as a bottom sheet with a 96 px peek. |
| 20 | Dialogs | medium | 0.9 | Primary actions below the fold on phones; four action-row alignments (`quest-daily-dark-mobile.png`, `quest-settings-dark-mobile.png`). | Sticky footer. One rule: primary right, secondary left of it, destructive far left; full-width stack under 32rem. |
| 21 | Motion | medium | 0.8 | Ribbon animates `max-height`; landing trail draws off the board. | Draw-on motion only: trail across the crop, Pulse ring, 240 ms recoil. No layout property animates. |
| 22 | Records | medium | 0.7 | Dashed-box empty state; numbers in body font (`quest-records-light-desktop.png`; `game-dialogs.css:968-1009`). | Ruled ledger: Rank, Outcome, Time, Moves, Echoes, Seed; Geist Mono tabular numbers; the empty state is three blank Ruled rows and one line. |
| 23 | Shell | medium | 0.9 | Admin gate unstyled; Class heading promises a choice a signed-out visitor cannot make; mixed Button tiers in one row (`admin-light-desktop.png`, `class-light-desktop.png`). | Shared shell and one gate pattern: label, heading, one sentence, one primary action, one Signal light. Floor only if v3 cuts these routes (§7). |
| 24 | Theme | low | 0.8 | No Theme Choice on the landing; Night paper a flat slab. | Theme Choice in the shell on every route. §3 C9. |
| 25 | Tokens | low | 0.7 | `--radius-pill`, `--shadow-*`, `*-glow` tokens survive; `tokens.css:1` comment calls buff land a signature. | Delete each token at zero references. Restate the header from `design.md`. |

Dropped on contradiction between critics: Pause placement, hatch as the sole wall fix, Region hue removal, mono Readout removal.

## 5. Contract additions to `design.md`

Slice S-A writes these sections. The detector cannot check them, so each becomes a line in the capture receipt.

- **Chart devices.** Neatline: 1px ink around the board, 2px tick marks per tile, Grid reference in 10px Geist Mono outside the frame. Title block: a corner block with two rules, Labyrinth number in Archivo, level and ruleset in body type, seed and date on one caption line. Scale bar: the Quest Level ladder on the landing. Ruled ledger: hairline rows, tabular numbers, running heads per band. Stamps: a circled number per completed Labyrinth, filled when complete, dashed when ahead, a Signal flag for a Gate Warden. One compass rose, on the landing only.
- **Palette rows.** Wall, Passage, Fog, Explorer, Echo, Danger line, Trail, light and Night, each with its contrast pair.
- **Dialog anatomy.** Scrim 55% ink; panel 1px ink border, 4px radius, no shadow, paper fill; header band with the title in Archivo, a Geist Mono reference at right, one 2.5rem close square; sticky footer with one primary action; two widths, 36rem and 44rem; full-height sheet under 768px; ink skeleton for a load state; a Signal dot as the only selected mark.
- **Shared shell.** 76rem container, 64px bar, one ink hairline, wordmark left, route name as a quiet tab, Theme Choice right, identical on every route.
- **Button tiers.** Primary ink fill, secondary ink outline, tertiary underlined text link. One size, one weight, 40px minimum height.
- **Empty state.** Label, heading, one sentence, one action, one Signal light as the state mark. Records and Atlas draw the blank ruled page.
- **Type floor.** 12px minimum for every text. Two display tracking tokens. Section labels: one per page region.
- **Fog and hatch numbers.** Fog 4 to 6% coverage from an 8 × 8 tile. Hatch 1px ink at 45°, 4px pitch, inside a merged wall run.
- **Banned, added.** Headline eyebrows. Middle-dot meta strings. Unicode glyphs as icons. Coloured glow shadows. Layout-property animation.

## 6. Constraints the rebuild keeps

- **Invariants I1 to I7** stand. At risk: I2 in S-A (Night paper touches the three bar-colour copies), I3 in S-B (painters only; `game-session.js` untouched), I5 in S-C (the shared shell stays inside the lazy game entry), I7 in S-C and S-D.
- **CSP.** `style-src 'self'` and no inline scripts. Every sample in §10 translates to class rules in the sheets, never to `style` attributes.
- **Bundle budgets** (`scripts/check-bundle-budget.mjs`, gzip): landing JS 8 KB, game JS 42 KB, shared CSS 13 KB, game CSS 6 KB. The `createPattern` tiles and the Neatline add under 1 KB of JS. Deleted card CSS pays for the new rows. Every slice runs `npm run check:bundle`.
- **Tests that pin today's look.** `tests/audit-performance.test.js:189` (hero alt), the landing parity test for `renderLanding` against `index.html`, the theme-color triple test, the canvas pixel checks in `tests/e2e/game.spec.js` (see `docs/solutions/testing/canvas-translucent-overlap-pixel-flake.md`), and `scripts/vitest-test-count.json`. Each slice updates the ones it breaks in the same PR.
- **Maze geometry, rulesets, and `echo-bridges-v1`** never change.
- **Accessibility floor.** 4.5:1 text, 3:1 non-text, 40px targets, 16px body, keyboard Run with a live region, reduced motion stops every pulse, a high-contrast toggle doubles the coastline and removes the Fog screen.
- **Workflow.** Each slice is one `feat/` branch off fresh `main`, one PR, one CodeRabbit review (about one review per 40 minutes in this org), merge, branch deleted both sides. Lint, typecheck, test, build, `check:bundle`, and the detector pass before every push. A UI slice carries the capture receipt: each render state at 375, 1280, and 1920 px, light and Night, compared with `design.md`. The pipeline (`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/audit-loop`) runs per slice at modification scale; S-C and S-D open with the `stitch-pipeline` design stage against Stitch project `3244739478942983822` unless the owner waives it.

## 7. Slices

Eight PRs in order. Each row names what ships and the acceptance evidence.

| Slice | Ships | Acceptance |
| :-- | :-- | :-- |
| **S-A Tokens, type, symbols, contract** | `tokens.css` rewritten: palette rows from §5, Night values from §3 C9, two tracking tokens, 12px floor; pill, shadow, glow tokens deleted at zero references. Twelve Chart No. 1 symbols as one inline SVG sprite in `index.html` plus `Path2D` strings for the renderer. `design.md` gains §5. | Detector exit 0 on `tokens.css`; contrast table for every pair light and Night (I4); I1 key and I2 triple diffed unchanged; `npm run check` green. |
| **S-B Canvas painters** | Fog tile, merged water fill with one coastline, hatched wall runs, position-fix Explorer with dashed trail and ten-move ticks, ink Wardens with dotted danger line, Echo arc, Gate lateral marks and Signal sector, Neatline with ticks and Grid reference, paper paused band, staging text cleared on dialog open. `palette.signal` renamed. | I3 geometry tests green; a Warden reads at 160 px (thumbnail test); captures of move 0, mid-run, and Gate at 375/1280/1920 light and Night; pixel e2e updated. |
| **S-C Play shell** | Board sized from the column (§4 #1); one shared shell with Menu; Readout as one ruled instrument line; title block as a chart corner block; Chart notes as Ruled rows; ribbon as an overlay; mobile cross pad; Pulse one line; record strip as a ruled line; Theme Choice in the shell. | Board owns 60 to 70% at 1280 and 1920, 100% at 375; under 160 CSS px of chrome before the first tile on a phone; captures 375/1280/1920 light and Night; detector exit 0; I5 and I6 tests green; shared CSS under 13 KB and game CSS under 6 KB. |
| **S-D Landing** | Live light and Night crops behind `<picture>`; trail inside the frame; h1 states the promise; price line in body type; the three-card step row becomes a scale bar; pricing as a ruled price line; footer; Theme Choice; compass rose once. | `renderLanding` parity test and `audit-performance` alt test updated; landing JS under 8 KB; captures 375/1280/1920 light and Night; detector exit 0. |
| **S-E Dialogs** | Dialog anatomy (§5) on the shared rule; pause; Daily with one primary; Settings as Ruled rows; access preview flattened; Warden challenge with the Warden silhouette, question as the display text, ink skeleton, narration disabled until load, full-height sheet on phones; First Light as a ruled list; level wizard as a ruled table at 44rem; skip-link bounds. | Captures of each dialog at 375/1280 light and Night; detector exit 0; every control edge 3:1; primary visible without scroll at 375 × 812. |
| **S-F Atlas and ledgers** | Atlas SVG as the surface with `xMidYMid meet`, data-bound stamps, chart labels, status strip, one 40px toolbar, bottom sheet; Records ledger; Journal and Workshop as ruled pages with the shared heading row. | No clipping at 375, 1280, 1920; map visible on phone open; captures light and Night; detector exit 0. |
| **S-G Class and Admin floor** | Shared shell on `/class` and `/admin`; gate pattern; Button tiers; nth-child hue cycle removed; ink borders. Skipped if `rebuild-v3` S01 to S03 cut these routes first. | Captures at 375/1280 light and Night; detector exit 0; wordmark and content share one left edge. |
| **S-H Documenter** | `DESIGN.md` rewritten from the shipped build; `.hallmark/log.json` entry; `docs/solutions/frontend/pilot-chart-execution.md`; `docs/README.md` index line. | Documenter agent output reviewed; `npm run check` green. |

Order rationale: S-A and S-B carry no visible risk to layout and unblock every later crop and sample. S-C before S-D so the landing crop renders from the finished board. S-E to S-G are independent after S-C and can run as one PR each in any order. S-H closes.

Effort: S-A and S-B two to three days each; S-C two days; S-D one day; S-E two days; S-F two days; S-G half a day; S-H half a day `[estimate]`. The CodeRabbit budget sets the floor at eight review rounds plus fixes.

## 8. Relationship to `rebuild-v3.md`

- v3 §6 and this plan share the identity. This plan grades against `design.md` because v3 awaits approval; §3 lists every conflict with the pick.
- v3 S01 to S03 delete Classroom, Admin, Journal, Questions, First Light, Warden challenge, Workshop, Fossils, and Postcards. If the owner approves v3 first, S-E shrinks to pause, Daily, and Settings; S-G drops; the Journal and Workshop rows in S-F drop. Nothing in S-A to S-D depends on a surface v3 cuts.
- v3 S13 to S15 (symbols, painters, four screens, share card) map to S-A, S-B, S-C, S-D, and S-F here. A share card (S15) is out of this plan's scope.

## 9. Open decisions

| # | Decision | Recommendation |
| :-- | :-- | :-- |
| D1 | Base: the current app, or v3 after its cut (S01 to S03)? | Current app, S-A to S-D first. They are identical under both bases. Decide v3 before S-E. |
| D2 | Where this plan commits: `main` directly (docs may go straight to `main`) or onto the dirty `fix/swarm-audit-safe-fixes` branch? | Straight to `main` as `docs(plans): add the premium UI rebuild plan`, after the 83 dirty files land or stash. |
| D3 | Stitch comps before S-C and S-D, or the canvas artboards in §10 as the only comps? | Canvas artboards suffice; Stitch runs only if the owner wants variants. |
| D4 | §3 rows C1 to C9. | As written. |

## 10. Review artifacts

Design canvas: <https://claude.ai/artifact/UMbg8huQAwDXUsusNtdJk5>

The v2 set (top of the canvas) replaces the v1 set after the owner's review of v1. Each v2 board is a chart plate: Neatline, Grid reference, hatched land, water passages, printed title cartouche, and a scale bar. v2 keeps the v1 copy and tokens and changes the structure.

| v2 artboard | Shows |
| :-- | :-- |
| `v2-landing.dc.html` | Landing at 1280 × 820: masthead with Sign in and a segmented Theme Choice, 24 × 13 plate with the trail drawn, a title cartouche on the inner Neatline (Archivo "ECHO MAZE" at 128px, lede, four-mark legend, price line, one primary action, scale bar), edition colophon. |
| `v2-landing-phone.dc.html` | The same landing at 390 × 844: 9 × 7 plate with the scale bar bottom-left, statement block on paper below the plate, two-column legend, price, one action, colophon. |
| `v2-play.dc.html` | Play at 1280 × 944: tabbed masthead, Readout as one ruled instrument band with the Warden mode as its fifth cell, 15 × 15 plate with trail, fog, and Grid reference, control line with Pulse right, chart corner title block, Chart notes as three ruled groups. |
| `v2-play-phone.dc.html` | Play at 390 × 844: Readout band, Warden band, full-width plate, cross pad with Pause and Pulse, title block, objective. |
| `v2-dialog.dc.html` | Warden challenge at 1360 × 820, light and Night side by side: head band with Vitality, question as display text, ruled choices with the focused choice in ink, seed and Show Hint and Skip free in the foot. |

Detector: `node ~/.claude/skills/impeccable/scripts/detect.mjs --json` on the five v2 files exits 2 with six findings, all `cramped-padding` on the `<x-dc>` board wrapper and the dialog's absolute `.half` under-layer. Both are canvas structure, not design rules, so the plan reports them and adds no suppression.

v1 set (below the v2 set on the canvas, kept for comparison):

| v1 artboard | Shows |
| :-- | :-- |
| `Main.dc.html` | Daily landing at 1280: shell, live board crop in a Neatline, promise h1, scale-bar levels, ruled price line, footer. |
| `landing-phone.dc.html` | The same landing at 390 × 844. |
| `play-desktop.dc.html` | Play at 1280: shared shell, board at 60% in a Neatline with Grid reference, ruled Readout line, Chart notes gutter, chart corner title block. |
| `play-phone.dc.html` | Play at 390 × 844: board full width, one-line Readout, cross pad, Pulse right. |
| `dialog-warden.dc.html` | Warden challenge dialog at 1280 light and Night: anatomy band, Warden silhouette, question as display text, ruled choices, sticky footer. |

Each board uses the `tokens.css` light values and the Night values from §3 C9. The boards are comps, not code: the app build translates them to class rules under CSP.

## 11. Not checked and risks

- The dark captures of the Atlas, Records, and dialog surfaces were judged from the critics' text, not opened.
- The level wizard has no capture; its findings are `[code-only]`.
- The Night values in §3 C9 need the I4 contrast table in S-A before any sheet uses them.
- If the owner approves v3 before S-E, rows 23 and parts of 10, 11, 20 become deletions.
- The hero crop pipeline (a render of the live board to `webp` at build time) does not exist; S-D adds a script or ships hand-captured crops from the S-B renderer.

## Appendix A: ten principles

1. The board is the only hero. The landing crop, the Atlas tile, and the Records thumbnail are real renders of the canvas.
2. The canvas and the DOM share one grammar: the same hairline weight, ink, and label size.
3. Progress is a stamp, not a badge. One shape per state, so no reader depends on hue.
4. Metadata is a printed caption: seed, date, Labyrinth number on one line, in title-block order.
5. The Readout is a sentence: numbers in mono, but the line reads aloud.
6. An empty state is a blank chart with ruled margins.
7. Copy speaks like a chart note: short, present tense, one fact per line.
8. Motion is one draw-on, then stillness.
9. At 375px the chart keeps its grammar. Density changes by margin, never by the removal of marks.
10. Every mark is drawn for this chart: wordmark, Warden silhouettes, legend glyphs, nav pictograms.

## Appendix B: craft references

| Reference | Borrow | Applies to |
| :-- | :-- | :-- |
| U.S. Chart No. 1 (NOAA, NGA) | Magenta for the navigationally significant marks only; the legend as a two-column ruled table. | board, dialogs, Atlas |
| Admiralty charts (UKHO) | White water, blue depth tints, hairline contours; upright lettering for fixed objects. | board, Atlas |
| swisstopo national map | White space, one sans face, labels ranked by size and weight. | board, Atlas |
| Mini Metro, Mini Motorways | The board as a map; a hairline HUD in the corners and nothing over the board. | board, Atlas |
| Monument Valley 3 | One full-bleed game frame with the wordmark inside the scene. | landing, shell |
| Return of the Obra Dinn | Two-colour page; a screenshot strip of four thumbnails. | landing, dialogs |
| Playdate | The screen as an instrument inside a hairline bezel; a rotated stamp for state. | shell, board, Atlas |
| Chants of Sennaar | One drawn glyph as the section divider; a uniform review strip. | landing, dialogs |
| Zachtronics catalogue | Each item as a crop plus one caption line. | Atlas, dialogs |
| Semantle | One calibrating sentence, one input, one primary button. | board, dialogs |
| Baba Is You | A hand-lettered wordmark in two inks; store links on one centred line. | landing, shell |
| Puzzmo 2025 redesign | The game at the centre; one sidebar for every meta layer. | board, shell, Atlas |
| NYT Games redesign | A game card with two states, unplayed and in progress; three tabs only. | shell, Atlas |
