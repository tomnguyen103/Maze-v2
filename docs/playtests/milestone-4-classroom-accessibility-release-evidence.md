# Milestone 4 Classroom and Accessibility release evidence

- Evidence date: 2026-07-30
- Parent: [#124](https://github.com/tomnguyen103/Maze-v2/issues/124)
- Release ticket: [#132](https://github.com/tomnguyen103/Maze-v2/issues/132)
- Integrated branch: `feat/milestone-4-classroom-accessibility`
- Base: `11ee3fc`
- Scope: device-local engineering evidence only; no live identity, billing,
  provider, database, or player-research claims

## Child-ticket ledger

| Ticket | Delivered contract | Commit | Result |
| --- | --- | --- | --- |
| [#125](https://github.com/tomnguyen103/Maze-v2/issues/125) | Class Expedition data contract and forced-RLS proof | `9df5b27` | Delivered as authored tests; the forced-RLS proof is **not executed** on this device — see the checkpoint ledger |
| [#126](https://github.com/tomnguyen103/Maze-v2/issues/126) | Teacher assigns, closes, reopens a Class Expedition | `811cef0` | Delivered |
| [#127](https://github.com/tomnguyen103/Maze-v2/issues/127) | License and capacity in Stripe test mode + cost model | `59cfe10` | Delivered |
| [#128](https://github.com/tomnguyen103/Maze-v2/issues/128) | Student Class Play through Classroom Run Grants | `26bcc60` | Delivered |
| [#129](https://github.com/tomnguyen103/Maze-v2/issues/129) | Aggregate-only Teacher Expedition progress | `b30fe51` | Delivered |
| [#130](https://github.com/tomnguyen103/Maze-v2/issues/130) | Trail Compass and six-field Access Settings | `e4b44ae` | Delivered |
| [#131](https://github.com/tomnguyen103/Maze-v2/issues/131) | Question Narration with local Read Aloud | `de27dfb` | Delivered |

Post-ticket commits on the branch: `34340cf` (lint fix + gate-masking
correction, disclosed below), `4827d6d` (three-axis review findings, browser
evidence, screenshots), and the Mixed Trail flake diagnosis recorded below.

## Roadmap checkpoint ledger

| Milestone 4 checkpoint criterion | Evidence | Result |
| --- | --- | --- |
| Direct forced-RLS tests pass | `tests/classroom-rls.integration.test.js` — new Expedition boundary case: crafted cross-Classroom reads return nothing, crafted writes fail `42501`, definer-only licenses/seats, concurrent first-Grant seat race yields distinct seats, membership-removal cascades Grants while seats survive, tenant context clears after commit and rollback. Environment-gated: it needs a disposable migrated database (`RUN_DATABASE_INTEGRATION=1`) which this device-local evidence deliberately does not touch, so this run records the tests as authored and skipped, not executed | Authored; environment-gated |
| Teacher views aggregate-only | `read_class_expedition_progress` returns class counts only; route test asserts the exact response keys and the absence of `studentName`/`username`/`user_`/`rank`; runtime role has no grant on seats/licenses | Pass |
| Grants, four-Run scope, 30 non-recyclable seats, five-seat extensions | Migration text tests (seat/extension checks, one-base index) and route tests, all executed; consumed capacity derives from `MAX(seat_number)` so GDPR account deletion erases the personal seat row without recycling capacity. The RLS-integration cases covering the same rules are authored but environment-gated, so this row rests on the executed migration and route tests alone | Pass on executed tests; database-level enforcement unexecuted |
| Membership removal fail-closes while closure stays graceful | Grant rows cascade with the membership FK; the client stops the assigned Run, deletes only its local Active Run Recovery, persists no Class result (`tests/class-expedition-play.test.js`); the SQL issue function checks the existing-Grant lookup before the closed rejection, pinned by a dedicated migration test | Pass |
| Documented cost model + complete Stripe test-mode flow before any price; live billing separately unauthorized | `docs/plans/class-expedition-cost-model.md` (price explicitly unproposed; figures labeled non-price anchors); structural test-mode gates, pinned checkout host, per-purchase idempotency keys, store-then-process inbox, monotonic replay guards (`tests/class-expedition-billing.test.js` 8/8); no USD constant (`not.toMatch(/amount = \d{3,}/)`) | Pass |
| Nonvisual features reveal no hidden state | Trail Compass derives descriptions from exactly the renderer's visibility model; leak unit tests assert per-entity absence; e2e journey asserts the Gate and Echoes stay unspoken at the Fog-hidden start | Pass |
| Manual assistive-technology review recorded | See Assistive-technology review below | Recorded, with its automated-proxy limitation stated |

## Privacy inspection

- Teacher-visible Expedition output is counts only; no response field names,
  orders, or timestamps a Student. Structural route tests assert absence.
- Classroom Run Grants store Run identifier, Labyrinth Number, and
  escaped/defeated status — no route, answer, or timing data.
- Grants, seats, and sponsored Licenses joined the self-service export
  (`echo-maze-export/3` sections `class_run_grants`,
  `class_expedition_seats`, `class_expedition_licenses`); deletion is covered
  by FK cascades, with seats erased as personal data while consumed capacity
  is never recycled.
- Question Narration sends reviewed text only to browser voices reporting
  `localService: true`; remote-only inventories read as no voice at all, and
  the chosen voice URI is the only narration fact persisted, device-local.
- Trail Compass persists exactly one new synced field (`trailCompassEnabled`)
  plus `narrationPace` in the six-field Access Settings record; tones are
  user-triggered and carry no new persistence.
- New local keys: `echo-maze:class-expedition:v1:<user>` (assigned-Expedition
  selection), `echo-maze:cx-on:v1` (boolean flag),
  `echo-maze:class-run-outcome-pending:v1:<user>` (one bounded terminal
  outcome retry entry), `echo-maze:narration-voice:v1` (voice URI). None
  carries answer content.

## Migrations

- `db/migrations/0021_class_expeditions.sql` — transaction-wrapped; four
  forced-RLS tables owned by the tenant owner; ten SECURITY DEFINER functions
  with pinned search_path, PUBLIC revoked, runtime-only EXECUTE; Deck
  revision constraint drift-tested against the published catalog; disputes
  never block Grants; dispute-won reinstatement only from `disputed`.
- `db/migrations/0022_access_settings_v2.sql` — additive six-field Access
  Settings advance with the constraint-drop-before-backfill ordering pinned
  by test.
- Both are recorded in the `docs/SETUP.md` ordered list. **No migration was
  applied to any live database** — live application remains an external
  operator action, as inherited from Milestones 1–3 for 0018–0020.

## Screenshot inventory

Recorded by the Playwright suite with `RECORD_MILESTONE_4_SCREENSHOTS=true`;
every file is reproducible from a test.

| Evidence | Desktop | Mobile (390×844) |
| --- | --- | --- |
| Teacher Expedition tools + aggregates | `milestone-4-teacher-expeditions-desktop.png` | `milestone-4-teacher-expeditions-mobile.png` |
| Student Expedition card | `milestone-4-student-expeditions-desktop.png` | `milestone-4-student-expeditions-mobile.png` |
| Trail Compass panel in play | `milestone-4-trail-compass-desktop.png` | `milestone-4-trail-compass-mobile.png` |
| Read Aloud honest unavailable state | `milestone-4-read-aloud-unavailable-desktop.png` | `milestone-4-read-aloud-unavailable-mobile.png` |
| Six-field Access Settings dialog | `milestone-4-access-settings-six-fields-desktop.png` | `milestone-4-access-settings-six-fields-mobile.png` |

## Design inspection

The locked `design.md` system is unchanged. Screenshots were inspected
against the Hallmark 58-gate checklist: token-only color, 44-pixel targets,
no fabricated copy or metrics, no state carried by color alone, no page-level
horizontal overflow at 390×844. One defect found and fixed before this
record: the Teacher form's Learning Deck `<select>` rendered at browser
default size and overflowed its column at 390 px; classroom selects now
carry the 44-pixel token-styled rule.

## Assistive-technology review

Recorded honestly as an automated proxy, per the roadmap's approval gate:
no human screen-reader session occurred. What was verified by automation and
inspection: every new control is a real `<button>`/`<label>`/`<select>` with
an accessible name; compass statuses ride the existing single polite
live-region channel (one status per action, describe-on-demand); Read Aloud
states are exposed as disabled buttons with `role="status"` explanations;
the settings dialog announces and focuses per the existing pattern; Reduced
Motion and 200-percent text pass in the browser suite. A manual NVDA/VoiceOver
pass remains valuable post-release listening work and is deliberately not
claimed here.

## Gate record

Run on Node 22.23.1.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Pass |
| Types | `npm run typecheck` | Pass |
| Unit and integration | `npm run test` | 1156 passed, 18 skipped, 0 failed (1174 total) |
| Production build | `npm run build` | Pass |
| Bundle budgets | `npm run check:bundle` | Pass — 10 budgets measured, 1 skipped (optional Sentry, not built) |
| Browser matrix | `npm run test:e2e` | Two consecutive runs, each 218 passed, 18 skipped, 0 failed (236 total) — 1.7m and 1.6m |

Bundle results: landing 6.06 KB / 8 KB, game **30.00 KB / 30 KB (2 bytes of
headroom)**, Campfire Resume 3.95 / 5, shared styles 11.45 / 12, Trail
Compass 1.81 / 6, Class Expedition play 1.01 / 5, Question Narration
1.47 / 6, Deck picker 0.41 / 2, Daily submission 0.37 / 2, Clerk 544.21 / 600,
admin 6.03 / 20. Both lazy chunks this milestone extracted now carry their own
budget rows, so the bytes moved out of the game chunk stay measured and
enforced rather than growing unpoliced.

The ceiling bit during the CodeRabbit round: the Warden-mode fix put the game
chunk 21 bytes over, and the roadmap forbids raising a budget as a workaround.
It was paid for structurally, not by dropping the fix — the Warden-mode note
moved into `describeCompassAction` so its bytes land in the Compass chunk,
only the three Compass `let` bindings were hoisted for the temporal-dead-zone
fix rather than the whole function, and `daily-submission.js` became a lazy
import at its already-async call site. The game chunk still has 2 bytes.

**Headroom debt stated plainly:** the game chunk sits 2 bytes under its
ceiling. Milestone 4 already moved the Deck picker into a lazy chunk to stay
under; Milestone 5's offline work must begin with a deliberate main-chunk
extraction, not incidental growth.

### Intentional skips

All 18 skipped unit tests are environment-gated, not disabled work: the
PostgreSQL integration suites (`*.integration.test.js`, now including the
Class Expedition boundary case) run only with
`RUN_DATABASE_INTEGRATION=1` and live database URLs, and three
`pre-push-hook` cases require a shell.

Of the 18 skipped browser cases, 16 are project-gated (desktop-only or
mobile-only passages). The other two are the sign-in and create-account
journeys, which skip at runtime on "Clerk could not initialize during this
browser run." (`tests/e2e/entry.spec.js:121`, `:845`). Those two are
desktop-only cases that then skipped on desktop as well, so **they ran on
neither project** — hosted-Clerk journeys are not covered by this record.

### Disclosed test changes

- `tests/access-settings.test.js` — the case asserting a `version: 2` record
  is rejected was rewritten: version 2 is now the canonical record and the
  case asserts unknown paces and malformed records reject instead.
  Four-field fixtures across the settings suites were upgraded to the
  six-field record.
- `tests/classroom-rls.integration.test.js` — the "different Run identifier
  conflicts" expectation became the lost-acknowledgement re-point assertion
  after the review fix that lets a non-terminal Grant re-point; `escaped`
  remains terminal.
- `tests/e2e/game.spec.js` — the stored-settings equality assertion advanced
  to the six-field record, and the Mixed Trail continuation waits received
  the same 15-second under-load budget the Milestone 3 record documents for
  sibling dialog waits. The Mixed Trail case was then rebuilt around a cursor
  over the winning plan and a pinned Quest seed (see Flake diagnosed and
  removed); it asserts the same announcement, notice, and Quest Level facts as
  before. Nothing asserted was reduced.

### Gate-hygiene correction (disclosed)

During tickets #130/#131 the automated gate piped lint output through
`tail`, which masked one real `no-unused-vars` failure introduced by the
Deck-picker extraction; commits `e4b44ae` and `de27dfb` therefore claimed a
green lint that was not. Commit `34340cf` fixed the lint error and the gate
now checks exit codes directly. Unit, build, and bundle results in those
commits were unaffected.

### Flake diagnosed and removed

`announces the Mixed Trail continuation once per Quest` failed intermittently
across this milestone's runs — twice on mobile, once on desktop — and each time
passed in isolation, which is why it was first read as the lazy-chunk-under-load
class recorded in the Milestone 3 evidence. Raising its dialog waits to 15
seconds did not stop it, so the case was diagnosed rather than re-timed. Two
defects, neither of them load:

1. After answering the first challenge the case replayed `plan.actions` from
   index 0 while the Explorer already stood mid-Labyrinth, spending moves the
   Run had made. The desynced walk reached a second challenge only by accident.
2. A Quest draws its seed at random on every start. Walking all 4200 seeds
   `createSeed()` can name through the same planner the case uses, 939 of them
   (22.4 percent) lay out a Labyrinth holding fewer than two challenges — 832
   hold one and 107 hold none — so even a correct walk had no second challenge
   to reach.

The case now walks the plan with one cursor, stopping at the plan's own `answer`
markers — the invariant `completeMilestonePlan` already relies on — and pins the
Quest seed by serving `crypto.getRandomValues` from a fixed counter, so the
Labyrinth layout is identical on every run. The seed is pinned through the draw
rather than the URL because a shared seed needs `level` and `labyrinth` beside it
and would skip the Deck picker the case exercises. Verified at 12 consecutive
passes (6 repeats × 2 projects) before the runs recorded above. The 15-second
budgets stay but no longer carry the case.

`opens Workshop catalog and transfers paused play` failed once on mobile earlier
in the milestone and has not recurred; it remains attributed to the
lazy-chunk-under-load class and is not claimed as diagnosed.

One additional run mid-session reported unrelated failures because the e2e build
raced concurrent source edits; it is disregarded as invalid rather than counted.

## Review record

Local Standards and Spec reviews ran over the branch diff as parallel
subagents, with the Security & Reliability third axis added because the diff
touches forced-RLS tenancy, payments, and persistence.

Every finding assessed at medium severity or above was fixed on the branch
(commit `4827d6d`). The material ones: a cross-Classroom License reservation
path with no tenant gating; a stale Class Expedition selection routing
Personal Runs through Classroom Run Grants; Read Aloud's content observer
canceling its own speech; billing disputes blocking new Grants against ADR
0030; terminal outcomes lost on transient failures with the Grant stranded
as issued; account deletion recycling seats and corrupting seat numbering;
missing export coverage for Grants, seats, and Licenses.

Deferred low-severity findings, each with its reason, are recorded in the
pull request description.

CodeRabbit then reviewed the branch and posted 19 actionable findings — 7 Major
and 12 Minor — plus 13 trivial nitpicks. All 19 were fixed in one batch. The
material ones: consumed Expedition capacity was derived from `MAX(seat_number)`
over surviving seat rows, so account deletion lowered it and a replacement
account could reuse a spent seat; the capacity reader counted only `paid`
extensions while issuance counted `paid` and `disputed`, letting
`seats_assigned` exceed `seats_total`; a failed Grants lookup was
indistinguishable from "no Grants" and silently re-seeded a Student's Quest
Progress to the Region's first Labyrinth; a checkout failure after
`reserveLicense` left the reservation dangling; `createQuestProgress` could
throw inside a click handler and leave the button dead; and two "no student
names" privacy assertions were checked against strings the fixtures never
produced, so neither could fail. Consumed capacity is now a non-personal
watermark on the Expedition that only increases.

One finding was verified and found overstated rather than accepted as written:
the reported temporal-dead-zone crash on the Compass bindings does not occur in
the production build — 218 browser cases pass at the reviewed commit, which a
boot-time throw would have prevented. The ordering was corrected anyway, since
declarations-before-use does not depend on a minifier's tolerance.

## External actions that remain truthfully deferred

- Applying migrations 0018–0022 to any live database (operator action).
- Live Stripe activation, real charges, production enforcement, and any
  concrete USD price proposal (separate product-owner authorization).
- A human assistive-technology listening session (optional post-release
  research; never a release blocker per the roadmap's approval gate).
