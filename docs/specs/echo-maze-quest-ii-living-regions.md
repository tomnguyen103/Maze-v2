# Echo Maze Quest II: Living Regions

## Status

Accepted implementation contract for roadmap item P3. The work is split into
two PR batches because the player path, offline propagation, authored content,
and acceptance tests together exceed a review-sized change.

## Player problem and intended feeling

After completing the first Quest, an Explorer should feel invited into a new
place with a recognizable rhythm, not handed the same twenty Labyrinths with
new labels. Each region should answer the player question “what is changing
here?” through a short authored story beat and a visible gameplay consequence
that comes from the existing Trail Twist/Warden rules.

The intended feeling is curiosity first, then competence: the arrival beat
orients the player, the variation beat lets them notice the regional pattern,
the escalation beat asks for deliberate use of the pattern, and the Gate beat
lets them leave the region with a clear memory of what they learned.

## Scope

Quest II contains five fixed region arcs and four Labyrinths per region:

| Region | Existing Trail Twist | Labyrinth beats | Learning emphasis |
| --- | --- | --- | --- |
| Echo Hush | `echo-hush-v1` | arrival → variation → escalation → gate | notice a changed rhythm |
| Windways | `windways-v1` | arrival → variation → escalation → gate | compare movement choices |
| Echo Bridges | `echo-bridges-v1` | arrival → variation → escalation → gate | connect two observations |
| Tide Doors | `tide-doors-v1` | arrival → variation → escalation → gate | plan before committing |
| Warden Bells | `warden-bells-v1` | arrival → variation → escalation → gate | apply the full pattern |

The five regions reuse the current five difficulty bands and the existing
Quest Level selection. Quest II adds authored content and pacing; it does not
add a new engine, a new player-facing rules menu, paid map/inventory, hidden
adaptive grading, or free-form AI content.

## Functional requirements

### Content-pack identity

- Quest I IDs remain valid and resolve to the existing content.
- Quest II IDs are generated in the `quest_ii_*` namespace and are accepted by
  current Quest progress, cloud, share, and offline receipt validators.
- A new Quest after a completed Quest I starts Quest II.
- A retry, recovery, cloud reconciliation, or offline continuation never
  changes the content pack behind the player's back.
- A completed Quest II starts another Quest II when the player chooses New
  Quest.

### Region arcs and storylets

- There are exactly five Quest II region records, each mapped to one existing
  Trail Twist revision.
- There are exactly twenty storylets, one for each Quest II Labyrinth.
- Each storylet includes a stable ID, region ID, Labyrinth number, pacing beat,
  child-safe copy, and a gameplay tie that names the existing Twist or Warden
  event it follows.
- Storylets are selected deterministically from Quest identity and Labyrinth
  coordinates. They do not contain answers, raw routes, or player history.
- The existing story log and Atlas surfaces render the selected storylet with
  semantic labels that work on desktop, mobile, and keyboard navigation.

### Reviewed Warden content

- Quest II ordinary and Gate Warden cards are authored in a static reviewed
  catalog.
- Each card passes the existing `normalizeQuestion` contract and carries a
  reviewed revision ID.
- The question service chooses Quest II catalog content before provider or
  database fallback. AI providers, when configured, may only reproduce the
  exact reviewed card and may not alter its child-facing fields.
- Offline content selection receives the Quest identity and resolves the same
  Quest II card family.
- Cards cover every Quest Level, difficulty band, Labyrinth beat, and challenge
  kind needed by the normal Quest path.

### Escalation and uniqueness

- Question difficulty rank is nondecreasing across the five existing bands.
- Author metadata marks the expected cognitive move for each band; no hidden
  ability inference or runtime adaptive difficulty is introduced.
- Within one Quest II identity, question IDs and reviewed revision IDs are
  unique across the full progress ledger.
- Catalog tests prove no duplicate IDs/revisions across all Quest Levels,
  regions, Labyrinths, and ordinary/Gate Warden cards.
- Existing map fingerprint and used-question ledgers remain authoritative for
  runtime duplicate prevention.

### Grey-box pacing acceptance

- Each region can be played as four explicit beats before any visual polish is
  considered complete.
- The acceptance fixture can walk the player through all five regions and
  verify the beat order, region mapping, question coverage, and Quest-wide
  uniqueness without a network provider.
- Desktop and mobile browser checks cover the Quest II label, storylet copy,
  focused Warden interaction, and keyboard-operable controls.

## Implementation decisions

- The existing opaque Quest ID is the content-pack seam; no database migration
  is required.
- The existing `createRun`/`applyAction` and ruleset revisions are reused.
- Quest II reviewed questions are selected as a static bank before external
  providers. No child-facing AI generation is added.
- Existing story log, Atlas, progress, cloud, offline receipt, and replay
  boundaries are extended only with the Quest identity that already exists.
- Unvalidated tuning values remain `[PLACEHOLDER]` until playtest evidence is
  available.

## Test plan

1. Contract tests for Quest ID namespace, pack inference, completion-to-Quest-II
   transition, and recovery identity preservation.
2. Content tests for exactly five regions, twenty storylets, reviewed card
   normalization, coverage across Levels/bands/challenge kinds, escalation,
   and Quest-wide ID/revision uniqueness.
3. Question-service tests proving Quest II bypasses unrelated provider/database
   content while retaining the reviewed-template guard.
4. Offline and cloud boundary tests proving Quest II identity is propagated and
   cannot be swapped during continuation.
5. Browser tests for desktop/mobile story presentation and keyboard access,
   plus a grey-box fixture that verifies the complete 20-Labyrinth content
   sequence without solving every maze interactively.
6. Full local gate required before every push:
   `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
   `npm run check:bundle`.

## Batch and blocking graph

- Batch A: contract, content catalog, reviewed question bank, and catalog
  coverage tests.
- Batch B: progression and question/offline propagation, player presentation,
  browser acceptance, and final integration tests.
- Batch B is blocked by Batch A. The roadmap item is blocked until both PRs
  are merged and their post-merge main verification is green.
