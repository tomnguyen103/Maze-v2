# Milestone 2 World Map and Run Memories release evidence

- Evidence date: 2026-07-29
- Parent: [#103](https://github.com/tomnguyen103/Maze-v2/issues/103)
- Release ticket: [#114](https://github.com/tomnguyen103/Maze-v2/issues/114)
- Integrated branch: `feat/milestone-2-world-map-run-memories`
- Base: `f97a5a6`
- Feature commits: `596b9b0..ddef4f3`
- Scope: device-local engineering evidence only; no live identity, billing,
  provider, database, or player-research claims

## Child-ticket ledger

| Ticket | Delivered contract | Commit | Result |
| --- | --- | --- | --- |
| [#104](https://github.com/tomnguyen103/Maze-v2/issues/104) | Versioned ruleset identity through a normal Run | `596b9b0` | Closed |
| [#105](https://github.com/tomnguyen103/Maze-v2/issues/105) | Semantic twenty-landmark Echo Atlas | `ea236ca` | Closed |
| [#106](https://github.com/tomnguyen103/Maze-v2/issues/106) | Outcome-only Run Replay retained with Run Records | `9ea50d1` | Closed |
| [#107](https://github.com/tomnguyen103/Maze-v2/issues/107) | Watch Trail from completed Atlas landmarks | `6dcd789` | Closed |
| [#108](https://github.com/tomnguyen103/Maze-v2/issues/108) | Shared-score partition by Region and ruleset | `98e383b` | Closed |
| [#109](https://github.com/tomnguyen103/Maze-v2/issues/109) | Region 1 Theme and Echo Hush | `66733db` | Closed |
| [#110](https://github.com/tomnguyen103/Maze-v2/issues/110) | Region 2 Theme and Windways | `4a3e282` | Closed |
| [#111](https://github.com/tomnguyen103/Maze-v2/issues/111) | Region 3 Theme and Echo Bridges | `4cc0b9d` | Closed |
| [#112](https://github.com/tomnguyen103/Maze-v2/issues/112) | Region 4 Theme and Tide Doors | `a7ef1a6` | Closed |
| [#113](https://github.com/tomnguyen103/Maze-v2/issues/113) | Region 5 Theme and Warden Bells | `ddef4f3` | Closed |

## Integrated acceptance ledger

| #114 acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Every child-ticket criterion is green | Ten closed child tickets above; each feature commit was made only after its focused unit, browser, Standards, and Spec gates passed | Pass |
| Atlas semantics and map/list parity on desktop and mobile | `tests/quest-atlas-view.test.js`; `tests/e2e/game.spec.js` Atlas semantics, map/list parity, keyboard, viewport, and mobile tap passages | Pass |
| Map → detail → Play and landmark → Watch Trail restore exact focus/state | `tests/quest-atlas-view.test.js`; `tests/e2e/game.spec.js` completed-landmark and lazy Watch Trail passages | Pass |
| Quest Progress is the sole Atlas authority | `tests/quest-atlas.test.js`; refresh, new Quest, Active Run Recovery, and Watch Trail passages in `tests/e2e/game.spec.js` | Pass |
| Five deterministic Twists survive original, recovery, and replay | Region rules, Active Run Recovery, Run Replay, and full Region browser passages in `tests/game-session.test.js`, `tests/run-ruleset.test.js`, `tests/active-run-recovery.test.js`, `tests/run-replay.test.js`, and `tests/e2e/game.spec.js` | Pass |
| Legacy Records/shares and Verified Daily remain Classic Rules | `tests/storage.test.js`; the shared-link and v2-locator passages in `tests/e2e/game.spec.js`; `tests/migration.test.js`; `tests/daily-*.test.js`; `tests/e2e/daily.spec.js`; ADR 0037 | Pass |
| Replay/recovery contain no forbidden identity, answer, provider, or cloud-route data | Privacy inspection below; negative serialization assertions in `tests/active-run-recovery.test.js`, `tests/run-replay.test.js`, and `tests/e2e/game.spec.js`; ADR 0027 | Pass |
| Atlas, Replay, art/audio, and ceremonies stay lazy; bundle ceilings stay fixed | Lazy-import assertions and browser request checks; `npm run check:bundle` against unchanged `docs/performance-budget.md` ceilings | Pass |
| Hallmark 58-gate review has no unresolved finding | Existing locked `design.md` retained; inspected evidence below; no fabricated copy, overflow, inaccessible state-by-color, or generic card-grid regression | Pass |
| Desktop/mobile evidence covers Atlas, Watch Trail, and every Region pair, including Reduced Motion and 200% text | Screenshot inventory below plus automated geometry assertions in `tests/e2e/game.spec.js` | Pass |
| Complete local engineering gate is green | Final gate record below | Pass |
| Local Standards and Spec reviews are clean | Final review record below | Pass |

## Privacy inspection

The retained Run Replay follows ADR 0027: it stores bounded movement and
outcome actions beside a device-local Run Record. Answer selections become only
`correct`, `wrong`, `hint`, or `skip`; exact option identifiers and Question
text are discarded.

Automated serialization inspections reject these forbidden fields and values:

- `answerId`, `choices`, and Question text;
- account, email, provider-debug, and user-authored identity data;
- a retained `runId` or other cross-account route;
- full action logs in share payloads, public scores, or cloud submission
  routes.

Account scoping and cleanup tests prove that sign-out/account deletion remove
the local Explorer's retained replay before another account can use the device.
Legacy Records without a replay remain readable, and eviction of a Record also
evicts its replay.

Verified Daily remains deliberately separate: it uses the existing server
verification path under Run Action Log version 1 and Classic Rules. Milestone 2
does not route local Watch Trail data into Verified Daily.

## Deterministic Region coverage

| Region | Theme | Trail Twist | Original / recovery / replay proof |
| --- | --- | --- | --- |
| 1 | Mosslight Grove | Echo Hush | collecting an Echo suppresses ordinary Warden movement for that action only; original, recovery, and retained outcome replay |
| 2 | Windcall Ridge | Windways | deterministic carry direction/state, blocked carry, recovery, and replay |
| 3 | Sunspan Crossing | Echo Bridges | collecting a paired Echo permanently opens its visible Bridge for Explorer and Warden pathfinding; recovery and replay |
| 4 | Tideglass Reach | Tide Doors | sealed/open shared phase, legal movement, recovery, and replay |
| 5 | Bellroot Summit | Warden Bells | Ring Bell, one-use signal, Warden lure/blocked pursuit, recovery, and replay |

Every Region continues to use the universal game contract: kid-safe reviewed
Questions, answer-based combat, Quest-wide unique maps and Questions,
escalating difficulty, Vitality, Hint, Skip, timer pause rules, and deterministic
seed replay.

## Visual evidence inventory

All files are committed under `docs/playtests/screenshots/`. The browser tests
write them only when their explicit evidence-recording environment switch is
set, so ordinary test runs do not mutate the repository.

| Surface/state | Desktop | Mobile |
| --- | --- | --- |
| Atlas at 200% text + Reduced Motion | `milestone-2-atlas-200pct-reduced-desktop.png` | `milestone-2-atlas-200pct-reduced-mobile.png` |
| Watch Trail at 200% text + Reduced Motion | `milestone-2-watch-trail-200pct-reduced-desktop.png` | `milestone-2-watch-trail-200pct-reduced-mobile.png` |
| Region 1 — Echo Hush | `milestone-2-region-1-echo-hush-desktop.png` | `milestone-2-region-1-echo-hush-mobile.png` |
| Region 2 — Windway carried | `milestone-2-region-2-windway-desktop.png` | `milestone-2-region-2-windway-mobile.png` |
| Region 3 — shell | `milestone-2-region-3-shell-desktop.png` | `milestone-2-region-3-shell-mobile.png` |
| Region 3 — opened bridge | `milestone-2-region-3-opened-bridge-desktop.png` | `milestone-2-region-3-opened-bridge-mobile.png` |
| Region 4 — sealed phase | `milestone-2-region-4-sealed-phase-desktop.png` | `milestone-2-region-4-sealed-phase-mobile.png` |
| Region 4 — open phase | `milestone-2-region-4-open-phase-desktop.png` | `milestone-2-region-4-open-phase-mobile.png` |
| Region 5 — bell ready | `milestone-2-region-5-bell-ready-desktop.png` | `milestone-2-region-5-bell-ready-mobile.png` |
| Region 5 — bell rung / Warden lured | `milestone-2-region-5-bell-rung-desktop.png` | `milestone-2-region-5-bell-rung-mobile.png` |

Inspection covered content hierarchy, state labels, map readability, control
availability, modal containment, vertical scrolling, horizontal overflow,
focus visibility, and non-color-only meaning. At 200% text, Atlas and Watch
Trail intentionally scroll vertically while remaining within the viewport and
without horizontal clipping.

## Hallmark 58-gate record

Audit inputs were locked `design.md`, `tokens.css`, `src/daylight.css`,
`src/game/region-theme.css`, every desktop/mobile screenshot above, and the
responsive Playwright measurements. Echo Maze deliberately reuses its locked
Workbench, Map/Diagram, and Focused Encounter structures; that is system
consistency rather than generic-template repetition.

**Pre-emit critique:** Philosophy 5; Hierarchy 5; Execution 5; Specificity 5;
Restraint 5; Variety 4. No axis required a release-blocking revision.

| Gates | Result | Milestone 2 evidence |
| ---: | --- | --- |
| 1–7 | Pass | Bricolage/Geist roles remain locked; no gradient text, icon-card template, nested cards, decorative side stripe, generic centered hero, or pure black/white base was added. |
| 8–9 | Pass | Atlas uses the locked Map/Diagram structure and Watch Trail a Focused Encounter, each with functional asymmetric rhythm rather than a Hero/three-cards/CTA template. |
| 10–19 | Pass | No transition-all, uniform hover scaling, bounce easing, layout-property motion, fading focus ring, redundant success toast, auto-rotation, placeholder brand copy, or motion-only state was added. |
| 20–21 | Pass | Locked design tokens and `.hallmark/log.json` carry the truthful design-system stamp; no Specimen fallback is present. |
| 22–27 | Pass | Tinted neutrals, restrained signals, token spacing, readable measure, native control states, and global Reduced Motion behavior hold across Atlas, Watch Trail, and all Regions. |
| 28–29 | Not applicable | Milestone 2 has no video or abstract hero background. |
| 30 | Pass | No mixed icon library or emoji value-prop icon appears. |
| 31–32 | Not applicable | No Lottie asset or repeated-archetype generation run was introduced. |
| 33–38a | Pass | Canvas/decorative semantics are explicit; page/dialog roots contain horizontal overflow; action rows align; locked type roles remain; display headings stay upright. |
| 39 | Not applicable | Atlas and Watch Trail introduce no input, textarea, or select field. |
| 40–41 | Pass | Ink, muted ink, focus blue, electric pear, cyan, coral, mint, and Region accents retain readable computed surfaces; primary actions keep dedicated accent ink. |
| 42–43 | Pass | Compact game controls and the existing Record strip avoid marketing-navigation and generic-footer fingerprints. |
| 44 | Not applicable | No marketing hero was emitted; the equivalent Atlas/Watch Trail content is measured at every contracted viewport. |
| 45–49 | Pass | Every visual mark communicates gameplay; no invented metric, testimonial, logo, fake browser chrome, untokenized color/font, or wrapped clickable label was added. |
| 50 | Not applicable | No image-bearing card grid exists. |
| 51 | Pass | Long headings and privacy copy wrap without forcing horizontal overflow at mobile width or 200% text. |
| 52–53 | Not applicable | No theme-split section heading or CSS radio-tab pattern exists. |
| 54–55 | Pass | Utility labels stack above display headings, and all-caps utility text keeps a readable line height. |
| 56–57 | Not applicable | No secondary sticky-at-zero element or reference-DNA imitation was added; locked `design.md` remains authoritative. |

**Hallmark result:** 58 of 58 pass or correctly not applicable.

**Unresolved finding count:** 0 critical; 0 major; 0 minor.

## Lazy-loading and budget proof

- The game shell dynamically imports Atlas and Watch Trail at their controls,
  Region theme data/CSS at normal Quest start, audio only after Sound opt-in,
  and ceremony code only at a terminal Region milestone.
- Browser passages assert Region presentation and audio chunks are absent
  before their seams and requested after use; the Labyrinth 4 passage makes
  the same pre/post assertion for the ceremony chunk.
- Delayed terminal chunks keep competing navigation disabled until the saved
  result is rendered. Failed Atlas presentation falls back to an explicit
  saved-progress result, and a failed Region presentation retries on the next
  normal Quest while Classic Daily and First Light remain universal.
- Region art remains a local lazy CSS chunk, and audio remains a generated
  Web Audio layer rather than an eager or third-party payload.
- `npm run check:bundle` enforces the locked ceilings in
  `docs/performance-budget.md`: game entry 30 KB gzip and stylesheet 12 KB
  gzip. No ceiling was raised for Milestone 2.

## Final gate record

| Gate | Command | Result |
| --- | --- | --- |
| Lint → typecheck → unit → build → bundle | `npm run check` | Pass — 1,033 unit tests passed, 17 skipped; 114 files passed, 8 skipped; game entry 28.02/30 KB gzip; shared styles 10.63/12 KB gzip |
| Desktop + mobile browser matrix | `npm run test:e2e` | Pass — 200 passed, 18 intentional environment skips |
| Standards review | local review of `git diff f97a5a6...HEAD` plus #114 evidence changes | Pass — clean |
| Spec review | local review against #103, #104–#114, CONTEXT.md, and ADRs 0025–0037 | Pass — clean |
| CodeRabbit | aggregate PR head status and one-time findings read | Required after local evidence commit |

CodeRabbit is a release gate, not a local evidence claim. This document becomes
the merged release record only after the aggregate PR's CodeRabbit status reads
`Review completed`, its findings are resolved, and the PR is squash-merged.
