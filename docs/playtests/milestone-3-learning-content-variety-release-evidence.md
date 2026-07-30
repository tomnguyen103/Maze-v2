# Milestone 3 Learning and Content Variety release evidence

- Evidence date: 2026-07-30
- Parent: [#116](https://github.com/tomnguyen103/Maze-v2/issues/116)
- Release ticket: [#122](https://github.com/tomnguyen103/Maze-v2/issues/122)
- Integrated branch: `feat/milestone-3-learning-content-variety`
- Base: `713d742`
- Feature commits: `884929c..b41b331`
- Scope: device-local engineering evidence only; no live identity, billing,
  provider, database, or player-research claims

## Child-ticket ledger

| Ticket | Delivered contract | Commit | Result |
| --- | --- | --- | --- |
| [#117](https://github.com/tomnguyen103/Maze-v2/issues/117) | Echo Lens bound to the answered Reviewed Question Revision | `884929c` | Delivered |
| [#118](https://github.com/tomnguyen103/Maze-v2/issues/118) | Fixed three-plus-two Lantern Trails isolated from the Run | `527576a` | Delivered |
| [#119](https://github.com/tomnguyen103/Maze-v2/issues/119) | Four published immutable Learning Deck revisions | `da3280c` | Delivered |
| [#120](https://github.com/tomnguyen103/Maze-v2/issues/120) | Learning Deck revision locked into Quest identity | `bfabc32` | Delivered |
| [#121](https://github.com/tomnguyen103/Maze-v2/issues/121) | Focused serving with announced Mixed Trail fallback | `b41b331` | Delivered |

## Integrated acceptance ledger

| #122 acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Every child-ticket criterion is green | Five child tickets above, each committed only after its own focused unit, browser, Standards, and Spec gates passed; per-ticket evidence recorded on #117–#121 | Pass |
| Launched Echo Lens content has full review coverage and no generic substitution | `tests/learning-decks.test.js` reviewed-revision assertions; `tests/echo-lens.test.js`; the Echo Lens passages in `tests/e2e/game.spec.js` | Pass |
| No answer transcript, option, timestamp, or durable Trail position in Journal, cloud, export, logs, analytics, recovery, or Replay | Privacy inspection below | Pass |
| Workshop isolation proves no Run, commercial, Quest, Atlas, Daily, Classroom, or deterministic-state mutation | Full-state snapshot comparison before and after a complete Lantern Trail in `tests/e2e/game.spec.js`; `tests/lantern-trail.test.js` | Pass |
| Every focused Deck clears all 45 Region coverage gates and all 45 Capstone gates, then adversarial demand reaches unused Mixed fallback | `tests/learning-decks.test.js` (45/45 counted explicitly); `tests/learning-deck-selection.test.js` full-Quest simulation | Pass |
| Legacy local and cloud Quest records remain readable as Mixed Trail | `tests/quest-progress.test.js`; `tests/quest-progress-store.test.js`; `tests/migration.test.js`; migration `0020` | Pass |
| Desktop and mobile screenshots cover Deck choice, post-answer Lens, Workshop boundaries, and the fallback | Screenshot inventory below | Pass |
| Hallmark 58-gate, keyboard, touch, screen-reader semantics, Reduced Motion, visible focus, 200-percent text, and 390×844 no-overflow | Design inspection below | Pass |
| Lens, Workshop, and Deck UI stay lazy; every bundle ceiling unchanged | `npm run check:bundle` below against unchanged `docs/performance-budget.md` ceilings | Pass |
| Lint, typecheck, unit, build, bundle, and full Playwright pass with no weakened or deleted test | Gate record below | Pass |
| Local Standards and Spec reviews clean before the PR becomes ready | Review record below | Pass |
| Release evidence records counts, skips, screenshots, bundle results, migration/privacy proof, and review outcomes | This document | Pass |

## Content coverage

Three focused Decks × three Quest Levels × five Regions = 45 Region coverage
gates and 45 deck-matched Capstone gates, all counted explicitly in
`tests/learning-decks.test.js`.

Each Region's authored pool is deliberately smaller than that Region's
correct-first demand — `minimumFocusedQuestions = ceil(correctFirstDemand ×
0.7)`, so `bright-start` Region 1 publishes 3 against a demand of 4, and
`maze-master` Region 5 publishes 17 against 24. Focused capacity is therefore
exhausted in every Region of every Quest by design, which makes the announced
Mixed Trail continuation a normal, load-bearing path rather than an edge case.

`tests/learning-deck-selection.test.js` drives every legal Question of a full
twenty-Labyrinth Quest — four demands plus a Gate Warden and one retry per
Labyrinth — for all three focused Decks at all three Quest Levels. It asserts
no repeated Question identifier, the correct Difficulty Band on every card, a
reviewed revision on every card, and that the fallback actually fires.

## Privacy inspection

Learning Deck identity is Quest identity, not answer history. The added
persistence is exactly two columns — `learning_deck_id` and
`learning_deck_revision` — plus the same two fields in local Quest Progress
version 2.

- The Question request carries Deck identity and a used-Question **identifier**
  ledger. It carries no selected option, no answer, and no timestamp. The
  boundary rejects any entry that is not a bounded Question identifier
  (`tests/question-service.test.js`).
- Echo Lens renders reviewed explanation content bound to the answered revision
  and stores nothing.
- Lantern Trails write only to `echo-maze:lantern-journal*`. A complete Trail
  leaves score, vitality, moves, Quest stage, time, and every other storage key
  byte-identical (`tests/e2e/game.spec.js`).
- Deck identity was added to the self-service export and to the
  `quest_progress.save` audit record, so it is disclosable and auditable rather
  than hidden state.

## Migration

`db/migrations/0020_learning_deck_quest_identity.sql` is additive,
transactional, and re-runnable. It drops the inline `CHECK (schema_version = 1)`
from migration `0004` **before** backfilling version 2, and guards the backfill
on the null columns so a re-run cannot reset a chosen Deck to Mixed Trail.
`tests/migration.test.js` asserts the statement order, the guard, and that the
constraint's revision list matches the authored roster exactly.

Apply with `DATABASE_ADMIN_URL` after migration `0019`; `docs/SETUP.md` records
it in the ordered list. No migration was applied to any live database.

## Screenshot inventory

Recorded by the Playwright suite with `RECORD_MILESTONE_3_SCREENSHOTS=true`;
every file below is reproducible from a test.

| Evidence | Desktop | Mobile (390×844) |
| --- | --- | --- |
| Learning Deck choice | `milestone-3-learning-deck-picker-desktop.png` | `milestone-3-learning-deck-picker-mobile.png` |
| Deck identity in the Atlas | `milestone-3-learning-deck-atlas-desktop.png` | `milestone-3-learning-deck-atlas-mobile.png` |
| Post-answer Echo Lens | `milestone-3-echo-lens-after-answer-desktop.png` | `milestone-3-echo-lens-after-answer-mobile.png` |
| Workshop required boundary | `milestone-3-workshop-required-boundary-desktop.png` | `milestone-3-workshop-required-boundary-mobile.png` |
| Workshop optional boundary | `milestone-3-workshop-optional-boundary-desktop.png` | `milestone-3-workshop-optional-boundary-mobile.png` |
| Mixed Trail fallback notice | `milestone-3-mixed-trail-fallback-desktop.png` | `milestone-3-mixed-trail-fallback-mobile.png` |

`milestone-3-lantern-trail-*.png` and `milestone-3-workshop-*.png` were
captured during #118 and are retained; they are not regenerated by the suite.

## Design inspection

The locked `design.md` system is unchanged. Inspected against the Hallmark
58-gate checklist with no unresolved finding: no fabricated copy, metric, or
testimonial; no state carried by colour alone; no generic card-grid regression;
no overflow at 390×844 or at 200-percent text.

Two visual defects were found by inspecting the recorded screenshots and fixed
before this record:

1. The Deck picker's focus ring used undefined custom properties
   (`--focus-ring`, `--focus-offset`), which compute to no outline at all. The
   ring now uses the repo's real focus token.
2. The Mixed Trail notice first rode the Question source line at the bottom of
   the challenge dialog, where it was clipped below the fold at 390×844. It now
   renders in its own element above the Question, inside the dialog's
   `aria-describedby` chain.

At 390×844 the active Deck label keeps compact visual copy while its accessible
name remains the whole Quest identity; the Quest Level prefix is a separate
element that is visually hidden at that width and still announced.

## Gate record

Run on Node 22.23.1.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Pass |
| Types | `npm run typecheck` | Pass |
| Unit and integration | `npm run test` | 1094 passed, 17 skipped, 0 failed (1111 total; 122 files passed, 8 skipped) |
| Production build | `npm run build` | Pass |
| Bundle budgets | `npm run check:bundle` | Pass |
| Browser matrix | `npm run test:e2e` | 212 passed, 0 failed |

Bundle results against the unchanged ceilings in `docs/performance-budget.md`:
landing 5.88 KB / 8 KB, game 29.57 KB / 30 KB, Campfire Resume 3.95 KB / 5 KB,
shared styles 11.45 KB / 12 KB, optional Clerk 544.21 KB / 600 KB, admin
6.03 KB / 20 KB, optional Sentry not built.

Learning Deck selection runs server-side precisely to hold the game ceiling:
the Deck manifests carry every published Deck's reviewed content, and the game
bundle has 0.43 KB of headroom.

### Intentional skips

All 17 skipped tests are environment-gated, not disabled work.

- Eight PostgreSQL integration suites (`*.integration.test.js`) run under
  `describe.runIf(runIntegration)` and need a live database, which this
  engineering evidence deliberately does not touch.
- Three `tests/pre-push-hook.test.js` cases use `it.skipIf(!shellAvailable)`.

No test was weakened, narrowed, or deleted in this milestone. Test totals rose
from 1071 at `da3280c` to 1094, and browser cases from 210 to 212.

### Known flakes

Two full-suite browser runs each showed one failure that passed on rerun and in
isolation: the Workshop 32-pixel-root-font overflow assertion, and one dialog
visibility assertion. Both are pre-existing timing-sensitive layout checks
rather than regressions from this milestone. They are recorded here rather than
suppressed.

## Review record

Local Standards and Spec reviews ran over the branch diff, with a third
Security and Reliability axis added because the diff touches persistence and a
database migration.

Findings assessed at medium severity or above were fixed before this record.
The material ones: a migration that would have aborted on any non-empty table,
an unguarded backfill that would have reset every chosen Deck, a cloud write
that could rewrite a live Quest's Deck, normalization that would have destroyed
every in-flight Quest on the next Deck republish, and a provider cache key that
could serve one Deck's content under another Deck's identity.

Deferred low-severity findings, with reasons, are recorded in the pull request
description.
