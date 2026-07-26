# Echo Maze: Deep Review and Prioritized Feature Roadmap

> **Superseded source note:** This review was consolidated into
> [`echo-maze-lifetime-membership-and-echo-atlas-master-plan.md`](echo-maze-lifetime-membership-and-echo-atlas-master-plan.md)
> on 2026-07-25. Retain this file as review evidence, but use the combined
> master plan as the only implementation contract.

**Planning status:** Superseded by the combined master plan

**Implementation status (2026-07-26):** Engineering implementation is complete
through merged PRs #49-#55: access and lifetime membership, Echo Atlas and Gate
Wardens, Cloud Quest Continuity, Explorer Access Settings, Daily Shared
Labyrinth, and Lantern Journal. PR #56 adds integrated release-closure evidence
and remains pending mandatory review and merge; that merge is still required for
remote-main proof. Feature behavior is exercised by the matching
`tests/*.test.js`, `tests/e2e/game.spec.js`,
`tests/e2e/daily.spec.js`, and live PostgreSQL store suites indexed in
[`implementation-coverage.md`](implementation-coverage.md).

**Date:** 2026-07-25

**Reviewed commit:** `85c485f` on `main`

**Implementation authorization:** Not granted by this document

## 1. Executive Recommendation

Echo Maze already has a distinctive moment-to-moment loop: explore a hidden
Labyrinth, recover Echoes, read Warden tactics, and use knowledge to survive.
The product direction now has two layers:

1. establish a trustworthy account-to-membership boundary;
2. deepen the paid and free player experience without adding pay-to-win rules.

The recommended delivery order is:

1. **Lifetime Membership** — one Guest demo Run, three server-counted signed-in
   Runs, then one $5.99 USD lifetime purchase for unlimited new Runs; Clerk
   owns identity and Stripe-hosted Checkout handles the one-time payment;
2. **Cloud Quest Continuity** — make the commitment of an account and paid
   access durable across devices;
3. **Echo Atlas + Gate Wardens** — the first major content feature:

> **Echo Atlas + Gate Wardens** — make the twenty-Labyrinth Quest feel like one
> remembered expedition. A visible Atlas charts all five Difficulty Bands, and
> every fourth Labyrinth ends with a special Gate Warden that still obeys the
> game's central rule: one correct answer defeats the Warden; a wrong answer
> costs Vitality and produces a fresh Question.

Echo Atlas remains the best content bet because it:

- makes the existing twenty-Labyrinth promise visible and meaningful;
- creates five memorable climaxes from the five existing Difficulty Bands;
- reuses the strongest verb in the game instead of inventing a second game;
- preserves deterministic Runs, kid-safe Questions, and the current economy;
- can ship without a database migration or new model-generated content;
- creates a natural home for later cloud sync, learning reflection, and
  cosmetic rewards.

## 2. Review Basis

This roadmap is grounded in the current repository and a live local playthrough,
not only in README claims.

### 2.1 Repository and architecture checks

- `main` matches `origin/main`; no open pull requests were present.
- CodeGraph was current: 51 indexed files, 482 symbols, and 996 edges.
- Graphify was refreshed at `85c485f`: 560 concept nodes, 889 edges, no import
  cycles.
- Governing documents reviewed:
  - `CONTEXT.md`
  - `design.md`
  - ADRs `0001` through `0006`
  - the completed entry-experience plan
- Main extension seams reviewed:
  - `src/game/game-session.js`
  - `src/game/quest-progress.js`
  - `src/questions/quest-levels.js`
  - `src/questions/question-bank.js`
  - `src/main.js`
  - `src/player/`
  - `server/player-*`
  - current unit and browser tests

### 2.2 Live player-flow checks

The app was exercised locally at desktop and 390 × 844 mobile sizes:

- landing and returning-device entry;
- Quest Level selection;
- keyboard and touch-oriented Labyrinth presentation;
- Echo recovery;
- a live Warden encounter;
- Question Hint reveal and hide;
- correct-answer Warden defeat;
- Global Scoreboard empty state;
- local Run Records;
- desktop and mobile Warden Challenge layouts;
- browser console warnings and errors.

No app runtime error was observed. Local Clerk development-key warnings were
expected for the configured development environment.

### 2.3 Current validation result

`npm run check:full` passed:

- ESLint: passed
- TypeScript JavaScript checking: passed
- Vitest: 15 files, 113 tests passed
- production build: passed
- Playwright: 55 passed, 3 intentionally skipped, 58 total

Two non-failing platform warnings remain relevant:

1. the Clerk JavaScript chunk is large, although it is loaded through a dynamic
   import boundary;
2. the PostgreSQL driver warns that future SSL-mode semantics will change.
   Production database configuration should explicitly retain certificate
   verification before more cloud data is added.

Production Clerk, Neon, and Vercel behavior was not changed or authenticated
during this planning review.

## 3. Current Product Model

```text
Landing
  |
  +-- Enter / Continue Quest
        |
        +-- Choose Quest Level
              |
              +-- Start one deterministic Labyrinth Run
                    |
                    +-- Explore Fog
                    +-- Recover Echoes
                    +-- Read Warden mode
                    +-- Meet Warden
                    |     |
                    |     +-- Correct: defeat Warden, gain score + Pulse
                    |     +-- Wrong: lose Vitality, receive fresh Question
                    |     +-- Hint: free for current Question
                    |     +-- Skip: first free, later cost Vitality
                    |
                    +-- Reach open Gate
                          |
                          +-- Save local Run Record
                          +-- Submit escaped score when authenticated
                          +-- Advance Labyrinth Number
```

### 3.1 What is already strong

#### Core identity

- Knowledge has a direct gameplay consequence. Warden Questions are not a
  detached quiz screen.
- Fog, Pulse, Echoes, the Gate, and readable Warden modes form a coherent
  exploration vocabulary.
- One Run is understandable without a tutorial wall.

#### Safety and determinism

- The maze and game rules are pure and seed-driven.
- Model output cannot invent child-facing content; it must match reviewed cards.
- Bundled Questions preserve play when Ollama, Gemini, or the network fails.
- Question generation, identity, and database access remain outside
  deterministic Run calculation.

#### Progression and economy

- Three Quest Levels support different learners.
- Twenty Labyrinths grow through five four-Labyrinth Difficulty Bands.
- Quest-wide map fingerprints and Question IDs prevent repetition.
- Hint and Question Skip rules are clear, limited, and tested.

#### Delivery quality

- Desktop and mobile layouts are functional.
- Warden Challenges pause the timer and avoid pressure during learning.
- Keyboard, swipe, touch controls, reduced motion, large text, and focus
  behavior have browser coverage.
- Local Records and the Global Scoreboard serve different purposes.

### 3.2 Highest-value gaps

#### Gap A — a Quest is numerically long, but not emotionally cumulative

`QuestProgress` currently stores the Quest Level, Labyrinth Number, completed
count, used map fingerprints, used Question IDs, and next Question ordinal.
Vitality, Pulses, and score reset each Labyrinth.

That is correct architecture, but the player sees little persistent evidence of
the journey beyond `Labyrinth N of 20` and the next Difficulty Band label. The
five bands have no authored milestone, visible route, collectible memory, or
change in dramatic rhythm.

**Product risk:** twenty Labyrinths can feel like twenty separate Runs rather
than one Quest.

#### Gap B — account commitment is stronger than account continuity

A guest can finish one Labyrinth, then must create an account to continue.
Profiles and scores sync, but Quest Progress and Run Records remain local.

**Product risk:** an Explorer can commit to an account and a twenty-Labyrinth
Quest but still lose that Quest when changing devices or clearing storage.

#### Gap C — the learning loop has feedback, but no memory

Wrong answers receive a kind explanation and a fresh unique Question. The app
does not retain a learner-facing view of practiced ideas, mastered ideas, or
concepts worth revisiting.

**Product risk:** the game can say what happened in one Challenge, but not what
the Explorer learned across a Quest.

#### Gap D — accessibility works, but is mostly browser-controlled

The app supports focus, reduced motion, responsive layouts, and zoom. It has no
player-facing controls for stronger Fog contrast, larger maze marks, or a
reader-friendly Question text style.

**Product risk:** children who need those adjustments must know how to configure
their browser or device first.

#### Gap E — competition is casual by design

The server bounds and recalculates Score Entries, but ADR 0005 correctly states
that a modified client can still fabricate plausible Run facts.

**Product risk:** expanding the Global Scoreboard into high-stakes daily or
reward-bearing competition before server verification would overpromise
fairness.

### 3.3 Architecture constraint

`src/main.js` is the central browser orchestrator and already coordinates Run
start, actions, Questions, dialogs, timing, records, account state, and results.
New features should add focused modules and small integration hooks. They should
not turn `main.js` into the storage, domain, rendering, and network owner for new
systems.

No broad refactor is recommended. Extract only the seam required by each
approved vertical slice.

## 4. Non-Negotiable Game Contracts

Every roadmap item must preserve these tested invariants:

- [ ] A correct answer defeats the encountered Warden.
- [ ] A wrong answer removes one Vitality and, while the Run remains active,
      continues with a fresh Warden Question.
- [ ] Losing final Vitality ends the Run.
- [ ] Warden Questions remain short, age-appropriate, reviewed, and
      unambiguous.
- [ ] Invalid, changed, unavailable, unsafe, or timed-out provider output falls
      back to bundled content.
- [ ] A Quest contains twenty unique Labyrinth layouts.
- [ ] Warden Questions never repeat inside the active Quest.
- [ ] Difficulty increases by Labyrinth Number through the five existing
      Difficulty Bands.
- [ ] Every Labyrinth retains one free Question Skip; later skips cost one
      Vitality with a warning.
- [ ] Every Question retains its free Hint.
- [ ] The same seed, Quest Level, and Labyrinth Number reconstruct the same
      Labyrinth and rule configuration.
- [ ] Questions, profile state, and cloud availability never change
      deterministic movement or maze generation.
- [ ] Guest demo behavior, local Run Records, and existing stored data remain
      compatible unless a separately approved migration says otherwise.

## 5. Priority Roadmap

| Order | Feature | Priority | Player impact | Engineering risk | Dependency |
|---:|---|---|---|---|---|
| 0 | Platform trust guardrails | P0 foundation | Indirect but necessary | Low | None |
| 1 | **Lifetime Membership + Trial Ledger** | **P0 / Now** | Very high | High | Guardrails, Clerk identity, Stripe one-time payment |
| 2 | Cloud Quest Continuity | P1 / Next | High | High | Stable Quest data contract |
| 3 | **Echo Atlas + Gate Wardens** | P1 / Next | Very high | Medium | Guardrails |
| 4 | Lantern Journal + Practice | P1 / Next | High | Medium | Reviewed topic metadata |
| 5 | Explorer Access Settings | P2 / Later | Medium-high | Low | None |
| 6 | Daily Shared Labyrinth | P3 / Later | Medium | High | Fairness contract and cloud foundation |

### Priority logic

- **P0** creates a truthful, server-enforced commercial boundary and protects
  platform trust.
- **P1** makes paid commitment durable, then deepens the Quest and learning
  promises.
- **P2** broadens who can comfortably play after the core journey is stronger.
- **P3** adds retention and competition only after fairness boundaries are
  explicit.

## 6. P0 Foundation — Platform Trust Guardrails

This is not a player-facing feature. It is a short preflight before the first
feature branch.

### Outcomes

- Production database SSL verification is explicit rather than dependent on
  changing driver aliases.
- Clerk remains dynamically loaded and does not block Guest entry when
  unavailable.
- A small performance budget records the landing and gameplay JavaScript
  actually loaded before interaction.
- Current local storage and database migration behavior is characterized before
  new persistence is introduced.

### Acceptance gates

- [ ] Production and preview database connection settings explicitly preserve
      certificate verification.
- [ ] Guest landing and Guest gameplay remain usable when Clerk fails or times
      out.
- [ ] A measured baseline distinguishes initial application code from
      on-demand Clerk code.
- [ ] `npm run check:full` remains green.

## 7. P0 Feature — Lifetime Membership + Trial Ledger

**Purpose:** Convert the existing one-Run Guest demo into a clear,
server-enforced path from account creation to one paid membership.

Recommended contract:

- one Guest demo Run, using the existing ADR 0006 completion boundary;
- three signed-in free Run starts, counted atomically in PostgreSQL;
- one $5.99 USD one-time purchase through Stripe-hosted Checkout;
- Clerk remains the account and authentication system;
- permanent unlimited Runs for the purchasing Clerk account;
- no subscription, renewal, or saved-payment requirement;
- no paid gameplay advantage;
- active Runs always finish, while access changes apply to the next Run.

This feature supersedes ADR 0006's signed-in-unlimited rule. It requires a
dedicated access ledger because current escaped-score rows omit defeats and
cannot reconstruct Run starts.

The full product, architecture, security, failure-state, migration, payment
constraint, acceptance, and ticket plan is in
[`membership-access-implementation-plan.md`](membership-access-implementation-plan.md).

Cloud Quest Continuity follows immediately because membership restores access
across devices while Quest Progress currently remains browser-local. The
membership MVP may launch first only with honest on-screen disclosure that
Quest Progress and Run Records remain on the current device.

### Acceptance gates

- [ ] A Guest receives one completed demo Run.
- [ ] A Clerk account receives exactly three idempotently counted free Run
      starts across devices.
- [ ] A fourth signed-in free Run is impossible under concurrent requests.
- [ ] Stripe Checkout shows exactly $5.99 USD once and creates no Subscription.
- [ ] Paid, fully refunded, disputed, and funds-restored states behave as
      specified.
- [ ] Client state, query parameters, and forged webhooks cannot grant access.
- [ ] Existing accounts receive three free Runs at launch.
- [ ] All gameplay invariants and `npm run check:full` remain green.

## 8. P1 Feature — Echo Atlas + Gate Wardens

### 8.1 Player experience

**Purpose:** Turn twenty escalating Labyrinths into one legible expedition.

**Player fantasy:** “I am restoring a lost map, crossing five regions, and
proving what I learned at each threshold.”

**Emotional rhythm:**

```text
Labyrinths 1–3   Learn and explore
Labyrinth 4      Gate Warden climax + first Atlas sigil
Labyrinths 5–7   New region, stronger patterns
Labyrinth 8      Gate Warden climax + second sigil
Labyrinths 9–11  Apply growing mastery
Labyrinth 12     Gate Warden climax + third sigil
Labyrinths 13–15 Advanced expedition
Labyrinth 16     Gate Warden climax + fourth sigil
Labyrinths 17–19 Final ascent
Labyrinth 20     Final Gate Warden + completed Echo Atlas
```

Example Atlas language:

```text
Foundation   ● — ● — ● — ◆
Developing   ◎ — ○ — ○ — ◆
Capable      ○ — ○ — ○ — ◆
Advanced     ○ — ○ — ○ — ◆
Mastery      ○ — ○ — ○ — ◆

● completed   ◎ current   ○ ahead   ◆ Gate Warden
```

### 8.2 Recommended MVP contract

#### Echo Atlas

- Add a `Quest Atlas` action in gameplay and a compact Atlas summary in the
  result dialog.
- Show twenty nodes grouped into the existing five Difficulty Bands.
- Each node is `completed`, `current`, or `ahead`.
- Labyrinths 4, 8, 12, 16, and 20 use a distinct Gate Warden node.
- Completed Gate Wardens light one cosmetic Atlas sigil.
- Atlas state is derived from existing Quest Progress. No separate currency,
  inventory, or reward ledger is added.
- The Atlas never reveals the generated Labyrinth layout or hidden entities.

#### Gate Warden

- A milestone Labyrinth still contains the configured total number of Wardens.
  One is reserved as the Gate Warden; the remaining Wardens move normally.
- Recovering all Echoes opens the Gate visually but leaves its milestone seal
  active.
- Attempting to enter the sealed Gate starts a paused Warden Challenge.
- One correct answer defeats the Gate Warden, adds the normal Warden score and
  Pulse reward, and removes the seal.
- A wrong answer removes Vitality and provides a fresh unique Question while
  the Run remains active.
- The existing Hint and Question Skip economy applies without exceptions.
- After defeating the Gate Warden, the Explorer makes the final move into the
  unsealed Gate to escape.
- Escaping lights the band sigil and advances Quest Progress normally.

#### Question source

- MVP Gate Wardens use the next reviewed, band-matched, Quest-unique Warden
  Question.
- No free-form “boss Question” generation is introduced.
- A later content pass may curate special capstone cards, but it is not needed
  to prove the mechanic.

### 8.3 Success condition

The feature is working when:

- an Explorer can see where they are in the complete Quest at a glance;
- milestone Labyrinths have a clear beginning, buildup, and climax;
- a Gate Warden obeys the same answer, Hint, Skip, Vitality, and fallback
  contracts as any normal Warden Challenge;
- seed replay and Quest-wide uniqueness remain exact;
- the Atlas provides payoff without changing combat balance through buffs.

### 8.4 Failure states and edge cases

- Enter a milestone Gate before all Echoes: existing locked-Gate behavior wins;
  no Gate Warden Challenge starts.
- Lose final Vitality to the Gate Warden: Run ends as a defeat; the band sigil
  remains locked.
- Use the free Question Skip earlier in the Labyrinth: Gate Warden skips cost
  Vitality, exactly as the existing economy requires.
- Defeat regular Wardens before the Gate Warden: total Warden score remains
  bounded by the configured Warden count.
- Refresh during a Gate Warden Challenge: current refresh semantics reconstruct
  the same Labyrinth from its locator; it does not persist an in-progress frame.
- Replay a milestone Run Record: Labyrinth Number reconstructs the Gate Warden
  rule.
- Open a shared milestone link: the same seed, Quest Level, and Labyrinth Number
  produce the same milestone configuration.
- Complete Labyrinth 20: the final sigil lights before the existing Quest
  completion result is shown.

### 8.5 Explicit non-goals

- No new currency, shop, crafting, loot rarity, or battle pass.
- No stat upgrades or permanent combat buffs.
- No multi-answer Warden that violates “one correct answer defeats it.”
- No new AI-generated child-facing wording.
- No change to Personal Record ranking.
- No framework migration.
- No broad `main.js` rewrite.
- No cloud sync inside this feature.

### 8.6 Tuning hypotheses

These values are hypotheses until playtested:

- milestone interval: every four Labyrinths;
- one Gate Warden Question per successful defeat;
- Gate Warden included in the existing Warden-count budget;
- no extra Vitality granted before a milestone encounter;
- one Atlas sigil per Difficulty Band.

“Broken” is defined before playtest as any of:

- milestone Runs exceed their neighboring Runs mainly because of repeated
  Question retries rather than maze mastery;
- players cannot explain why the Gate is sealed;
- the Gate Warden feels like a surprise penalty rather than a visible climax;
- score ceilings differ between milestone and non-milestone Labyrinths with the
  same configured Warden count;
- a shared seed or replay changes whether a Gate Warden exists.

### 8.7 Implementation tasks

Implementation starts only after approval and the repository's feature workflow
creates the final issue/spec/tickets.

#### Task 1: Lock the milestone classification contract

**Description:** Document the special Gate Warden as an accepted game-rule
decision, write a failing milestone-classification test, then add the smallest
pure classifier and Warden-budget configuration needed to make that slice pass.

**Acceptance criteria:**

- [ ] Only Labyrinths 4, 8, 12, 16, and 20 are milestones.
- [ ] A milestone reserves one configured Warden without changing the total
      Warden count.
- [ ] Existing Difficulty Band and normal-Warden configuration tests remain
      green.

**Verification:**

- [ ] The focused test is observed red before the classifier is added.
- [ ] `npm run test -- tests/quest-levels.test.js tests/game-session.test.js`
- [ ] Lint and typecheck pass after the slice.

**Dependencies:** None

**Files likely touched:** `CONTEXT.md`,
`docs/adr/0007-echo-atlas-and-gate-wardens.md`,
`tests/quest-levels.test.js`, `tests/game-session.test.js`

**Estimated scope:** Medium

#### Task 2: Add a pure Quest Atlas projection

**Description:** Derive five Atlas regions and twenty node states from existing
Quest Progress without adding a second progress source.

**Acceptance criteria:**

- [ ] Projection returns correct completed, current, ahead, and milestone states
      for Labyrinths 1, 4, 5, 20, and a completed Quest.
- [ ] Projection never mutates stored Quest Progress.
- [ ] Existing version-1 Quest Progress remains readable.

**Verification:**

- [ ] `npm run test -- tests/quest-atlas.test.js tests/quest-progress.test.js`
- [ ] Typecheck passes for all projected states.

**Dependencies:** Task 1

**Files likely touched:** `src/game/quest-atlas.js`,
`tests/quest-atlas.test.js`

**Estimated scope:** Small

#### Checkpoint A: Product and state contract

- [ ] User approves Atlas language and Gate Warden rules.
- [ ] No stored-data migration is required for the MVP.
- [ ] Determinism and uniqueness invariants are represented in tests.
- [ ] Repository is green at the checkpoint.

#### Task 3: Implement Gate Warden deterministic state

**Description:** Add milestone configuration and pure Run transitions while
keeping the total configured Warden count and score ceiling stable.

**Acceptance criteria:**

- [ ] Milestone Runs reserve one configured Warden as the Gate Warden.
- [ ] Gate entry starts the Challenge only after all Echoes are recovered.
- [ ] Correct, wrong, defeat, and post-defeat Gate entry transitions match the
      approved contract.

**Verification:**

- [ ] Each outcome test is observed red before its smallest rule change.
- [ ] `npm run test -- tests/quest-levels.test.js tests/game-session.test.js`
- [ ] Fixed milestone seeds reproduce identical Run state.
- [ ] Non-milestone fixtures remain byte-for-byte behaviorally equivalent.

**Dependencies:** Checkpoint A

**Files likely touched:** `src/questions/quest-levels.js`,
`src/game/game-session.js`, `tests/quest-levels.test.js`,
`tests/game-session.test.js`

**Estimated scope:** Medium

#### Task 4: Reuse the existing Warden Question pipeline

**Description:** Route a Gate Warden Challenge through the current reviewed
Question, Hint, Skip, feedback, safety, and fallback paths.

**Acceptance criteria:**

- [ ] Gate Warden Questions use the current Difficulty Band and next Quest-wide
      ordinal.
- [ ] Accepted Question IDs are remembered before display and never repeat.
- [ ] Provider failure uses a bundled card without changing Run rules.

**Verification:**

- [ ] Focused Question service and Quest Progress tests pass.
- [ ] A forced provider failure completes the Gate Warden flow with bundled
      content.
- [ ] Timer remains paused for the complete Challenge.

**Dependencies:** Task 3

**Files likely touched:** `src/main.js`,
`src/game/game-session.js`, `tests/game-session.test.js`,
`tests/question-service.test.js`

**Estimated scope:** Medium

#### Checkpoint B: Core mechanic

- [ ] A headless milestone Run can be won and lost through the Gate Warden.
- [ ] Normal Warden combat remains unchanged.
- [ ] Score, Pulse, Vitality, Hint, and Skip rules are consistent.
- [ ] Unit tests, lint, typecheck, and build pass.

#### Task 5: Add the accessible Quest Atlas interface

**Description:** Add one focused Atlas view and integrate it with gameplay and
results using the locked design system.

**Acceptance criteria:**

- [ ] Twenty nodes and five bands have readable labels and non-color-only
      states.
- [ ] Gameplay can open and close the Atlas without advancing time.
- [ ] The result dialog shows the newly completed node or sigil.

**Verification:**

- [ ] Keyboard focus returns to its trigger after the Atlas closes.
- [ ] Desktop, 390 × 844 mobile, reduced-motion, and 200-percent-text checks
      pass.
- [ ] No horizontal overflow and no hidden required action.

**Dependencies:** Task 2 and Checkpoint B

**Files likely touched:** `src/game/quest-atlas-view.js`, `index.html`,
`src/daylight.css`, `src/main.js`, `tests/e2e/game.spec.js`

**Estimated scope:** Medium

#### Task 6: Add milestone presentation and end-to-end proof

**Description:** Make the sealed Gate and Gate Warden legible on the canvas,
in the legend, through live announcements, and through deterministic browser
fixtures.

**Acceptance criteria:**

- [ ] Players can distinguish locked, open-and-sealed, and open Gate states.
- [ ] One desktop and one mobile browser passage prove the complete milestone
      flow.
- [ ] Share, refresh, replay, defeat, Retry, and final Quest completion remain
      correct.

**Verification:**

- [ ] Hallmark applicable UI gates pass.
- [ ] Desktop and mobile screenshots receive human review.
- [ ] `npm run check:full`
- [ ] Local diff review finds no unresolved real issue.
- [ ] CodeRabbit reaches `Review completed`; all findings are resolved before
      merge.

**Dependencies:** Task 5

**Files likely touched:** `src/game/canvas-renderer.js`, `src/daylight.css`,
`src/main.js`, `tests/e2e/game.spec.js`, `README.md`

**Estimated scope:** Medium

#### Checkpoint C: Feature complete

- [ ] Every non-negotiable contract in Section 4 passes.
- [ ] Five milestones are visible across the Atlas.
- [ ] Gate Warden combat feels like a climax, not a new quiz mode.
- [ ] No account, database, or generated-content dependency was added.
- [ ] PR is reviewed and merged only after the required local and CodeRabbit
      gates.

## 9. P1 Feature — Cloud Quest Continuity

### Player outcome

An authenticated Explorer can continue the same Quest on another device without
cloud-syncing a live, mid-move Run.

### Recommended MVP

- Sync terminal Quest Progress at Labyrinth boundaries.
- Sync the selected Quest Level, Labyrinth Number, completed count, used map
  fingerprints, used Question IDs, next ordinal, and any derived Atlas state.
- Keep the active Run locator and in-progress Run device-local.
- Migrate existing local Quest Progress on first authenticated sync.
- Use an optimistic revision number.
- When local and cloud represent different active Quests, ask the player which
  one to keep. Never silently overwrite either.
- Store reviewed IDs and deterministic metadata, not Question text, answer
  choices, or free-form child data.
- Keep Guest mode local and playable through its existing one-Run allowance.

### Acceptance gates

- [ ] Sign in on device B resumes the correct next Labyrinth.
- [ ] Quest-wide map and Question uniqueness survives device changes.
- [ ] Offline completion remains local and syncs when service returns.
- [ ] Same-Quest conflicts merge monotonic history safely; different-Quest
      conflicts require a player choice.
- [ ] Account deletion and sign-out behavior are documented.
- [ ] No in-progress position, timer, Question, or Warden state enters cloud
      storage.

### Planned vertical slices

1. **Versioned server contract and migration**
   - Add one authenticated Quest Progress record per Player Profile.
   - Validate all lengths, enums, integers, revisions, and bounded arrays.
   - Verify with migration, store, route, and authorization tests.

2. **Read-only cloud recovery**
   - Signed-in players can inspect and restore cloud progress.
   - Local Guest behavior stays unchanged.
   - Verify unavailable, unauthorized, empty, and existing states.

3. **Boundary-only write sync**
   - Sync after new Quest choice and terminal Labyrinth progression.
   - Use idempotent revision-aware writes.
   - Verify duplicate, offline, stale, and retry behavior.

4. **Conflict resolution UI**
   - Show Quest Level, Labyrinth Number, and last completed boundary for both
     choices.
   - Require explicit selection for incompatible Quests.
   - Verify keyboard, mobile, and service-failure behavior.

### Dependencies

- Stable Quest Progress contract after Echo Atlas.
- Explicit database SSL verification.
- Separate ADR covering sync boundaries, conflict policy, and child-data
  minimization.

### Estimated feature scope

Large; must be split across the four vertical slices above.

## 10. P1 Feature — Lantern Journal + Practice

### Player outcome

The game remembers what the Explorer practiced and turns mistakes into a calm,
optional second chance instead of a hidden failure.

### Recommended MVP

- Add reviewed `topicId` and `learningObjectiveId` metadata to every Question
  card.
- Record only coarse attempt outcomes: correct, wrong, Hint used, or Skip used.
- Show a local Lantern Journal grouped by the existing Difficulty Bands.
- After a Run, offer one optional Practice Question for a concept answered
  incorrectly.
- Practice has no timer, Vitality cost, score, Global Scoreboard effect, or
  Warden.
- Practice uses a different reviewed card with the same learning objective; it
  never repeats the original Question.
- Keep attempt history device-local in the MVP. Cloud learning-history storage
  requires a separate privacy decision.

### Acceptance gates

- [ ] Every reviewed card has allowlisted topic metadata.
- [ ] A wrong answer produces a different, reviewed practice card.
- [ ] Practice cannot change Run outcome, score, Vitality, or Quest difficulty.
- [ ] Question uniqueness remains Quest-wide.
- [ ] Feedback remains encouraging and never labels a child as weak or behind.
- [ ] Journal can be cleared independently from account/profile data.

### Planned vertical slices

1. Add and validate reviewed topic metadata.
2. Project local Journal state from bounded attempt events.
3. Add a result-screen Practice Lantern vertical slice.
4. Add accessible Journal browsing and clear-history controls.

### Dependencies

- None for local MVP.
- Cloud storage explicitly deferred until privacy and deletion behavior are
  approved.

### Estimated feature scope

Medium to large, depending on the number of reviewed learning objectives.

## 11. P2 Feature — Explorer Access Settings

### Player outcome

Children can adapt the Labyrinth and Question presentation inside the game
without needing browser settings.

### Recommended MVP

- Stronger Fog and passage contrast.
- Larger Explorer, Echo, Gate, and Warden marks.
- Reader-friendly Question text style.
- Reduced visual effects control that complements system reduced motion.
- Persistent local settings with optional profile sync later.
- Preview each setting before saving.

### Acceptance gates

- [ ] All gameplay meaning remains available without color.
- [ ] Settings do not alter maze geometry, hit detection, timing, or score.
- [ ] Controls work at 390 × 844 and 200-percent text.
- [ ] Defaults remain the current locked design system.
- [ ] Reset restores the canonical design.

### Planned vertical slices

1. Versioned local access-settings adapter and tests.
2. Fog/mark presentation settings with deterministic visual fixtures.
3. Question-reading settings and browser accessibility checks.

### Dependencies

None. This can be planned independently after the P0 feature contract is stable.

### Estimated feature scope

Medium.

## 12. P3 Feature — Daily Shared Labyrinth

### Player outcome

Explorers receive one optional, shared deterministic Labyrinth each day without
changing their active Quest.

### Recommended MVP

- A date-derived server seed, fixed Quest Level, Labyrinth Number, and bundled
  reviewed Question sequence.
- Separate Daily progress and Personal Best from Quest Progress.
- One Daily Run can be shared through the existing link format.
- First release is personal and explicitly casual; it does not award scarce
  cosmetics or alter Quest progression.
- Global Daily ranking is deferred until the server can verify action replay or
  the product explicitly accepts a casual trust model.

### Acceptance gates

- [ ] Every player receives the same deterministic maze and reviewed card order
      for that date.
- [ ] Time zones use one documented boundary.
- [ ] Daily play cannot consume or replace active Quest state.
- [ ] Offline or expired Daily links fail with a readable fallback.
- [ ] No high-value reward depends on a client-asserted result.

### Planned vertical slices

1. Pure date-to-Daily contract and deterministic fixtures.
2. Personal Daily Run and local record, separate from Quest storage.
3. Share/replay UI and expiry behavior.
4. Optional verified Global Daily board as a separately approved follow-up.

### Dependencies

- Explicit fairness decision.
- Cloud foundation if Global Daily ranking is approved.

### Estimated feature scope

Medium for personal Daily play; large with verified global ranking.

## 13. Dependency Map

```text
Platform trust guardrails
        |
        +-- Lifetime membership contract
        |       |
        |       +-- Atomic trial ledger
        |       +-- Clerk identity + Stripe payment verification
        |       +-- Permanent PostgreSQL entitlement
        |       +-- Lifetime gate + checkout recovery
        |               |
        |               +-- Cloud Quest Continuity
        |
        +-- Echo Atlas projection
        |       |
        |       +-- Gate Warden pure rules
        |               |
        |               +-- Existing Question pipeline
        |                       |
        |                       +-- Atlas + milestone UI
        |
        +-- Cloud Quest contract
                |
                +-- Read recovery
                +-- Boundary writes
                +-- Conflict UI

Reviewed topic metadata
        |
        +-- Lantern Journal
                |
                +-- Practice Lantern

Access Settings -------------------------------- independent after P0 contract

Cloud + fairness contract
        |
        +-- Optional Global Daily Labyrinth
```

## 14. Release Sequence

### Release A — Establish membership trust

- platform trust guardrails;
- one Guest demo plus three server-counted signed-in Runs;
- one $5.99 USD lifetime membership using Clerk identity and one-time Stripe
  Checkout;
- checkout, refund, dispute, outage, and abuse-path proof;
- honest disclosure that Quest Progress remains on the current device.

### Release B — Make commitment durable

- Cloud Quest Continuity;
- safe local-to-cloud migration;
- explicit conflict recovery.

### Release C — Make the Quest memorable

- Echo Atlas;
- Gate Wardens;
- full desktop/mobile milestone proof.

### Release D — Make learning visible

- reviewed topic metadata;
- Lantern Journal;
- optional Practice Lantern.

### Release E — Broaden access

- in-game Explorer Access Settings;
- optional profile sync after local behavior is proven.

### Release F — Add a repeatable shared ritual

- personal Daily Shared Labyrinth;
- global ranking only after fairness approval.

Each release requires its own issue/spec/tickets, test-first implementation,
local gate, local review, mandatory CodeRabbit review, and merged PR.

## 15. Roadmap Success Measures

No analytics claims are made here. These are proposed playtest gates and should
be treated as hypotheses.

### Lifetime Membership

- A player can explain “one Guest Run, then three account Runs, then
  $5.99 once for lifetime access” before creating an account.
- Three distinct signed-in Run starts succeed; a fourth is denied until the
  one-time payment is verified.
- Clearing local storage or switching devices does not reset the signed-in
  allowance.
- Successful checkout unlocks through direct Stripe verification without
  waiting for webhook delivery.
- No Subscription, renewal, or recurring Price is created.
- Membership never changes combat, Question, score, Vitality, Hint, or Skip
  rules.

### Echo Atlas + Gate Wardens

- New players can point to current, completed, and next milestone states without
  explanation.
- Players anticipate that the fourth Labyrinth is special before reaching the
  Gate.
- Gate Warden rule can be explained as “a normal Warden Challenge at a sealed
  Gate.”
- No regression in seed replay, map uniqueness, Question uniqueness, or
  Hint/Skip behavior.

### Cloud Quest Continuity

- A player can switch devices at a Labyrinth boundary and resume the expected
  Quest.
- No test path silently loses the more advanced compatible progress.
- Incompatible Quest conflicts always present a human-readable choice.

### Lantern Journal

- A player can name one concept practiced during the last Run.
- A second-chance card is recognizably related but not repeated.
- Practice is perceived as optional help, not punishment.

### Explorer Access Settings

- A player can find, preview, save, and reset settings without assistance.
- Adjustments never alter game outcome or score.

### Daily Shared Labyrinth

- Two clients receive the same daily maze and card order.
- Daily state cannot alter or erase the active Quest.

## 16. Approval Gate

No application code, configuration, database schema, GitHub issue, branch, or
pull request should be changed until the user confirms the roadmap.

Recommended approval defaults:

1. Approve **Lifetime Membership + Trial Ledger** as the first feature.
2. Confirm **$5.99 USD once**, with no subscription or renewal.
3. Keep Clerk for accounts and use Stripe-hosted Checkout for the one-time
   payment because Clerk Billing supports recurring Subscriptions.
4. Count each signed-in free Run when a new stable `runId` starts; reload of
   that same Run consumes nothing more.
5. Give new and existing accounts three signed-in free Runs.
6. Follow membership with Cloud Quest Continuity.
7. Keep **Echo Atlas + Gate Wardens** as the first major content feature after
   the paid-account foundation.
8. Preserve existing Warden score, Pulse, Vitality, Hint, and Skip rules.

On approval, implementation begins with the repository's required feature
workflow and Task 1 in Section 7.7. Until then, this document is planning only.
