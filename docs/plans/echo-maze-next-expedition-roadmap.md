# Echo Maze Next Expedition Roadmap

**Status:** Feature contract frozen — Milestone 1 implementation authorized

**Review date:** 2026-07-29

**Reviewed code baseline:** `1313fc8` on `main`, synchronized with `origin/main`

**External inspiration reviewed:** [WebGemma](https://web-gemma.vercel.app/)

**Execution state:** The frozen contract is confirmed and Milestone 1 is in
implementation through GitHub issue #95. Later milestones remain paused behind
the Milestone 1 human checkpoint and their own implementation tickets.

**Primary product outcome — resolved during feature grilling:** Personal Play
Quest continuation. A new Explorer should understand the first Run, recover it
through an ordinary same-device interruption, and choose to continue the
twenty-Labyrinth Quest. Learning, Classroom, Daily, and later-milestone features
remain subordinate to that outcome when priorities conflict.

**Scope commitment — resolved during feature grilling:** Every feature listed
in the Section 8 prioritized portfolio is promised for production delivery.
Evidence, privacy review, content audits, and technical spikes may change a
feature's detailed design, slicing, or order, but do not cancel a portfolio
feature. An unsafe or infeasible design must be replaced with a compliant
design that preserves that feature's purpose.

## 1. Executive recommendation

Echo Maze no longer needs another infrastructure-first roadmap. Its deterministic
gameplay, child-safe Question boundary, Lifetime Membership, Quest continuity,
Daily verification, privacy controls, admin tooling, and Classroom isolation are
already unusually mature.

The next product program should make that strong foundation feel like a
memorable expedition.

Recommended sequence:

1. make the first five minutes easier and protect active Run continuity;
2. turn Echo Atlas into the product's signature explorable world, make
   completed Runs replayable memories, and give each Region one fixed Twist;
3. deepen learning through visual explanations, short Lantern Trails, and
   reviewed Learning Deck choice;
4. add purposeful Class Expeditions, complete nonvisual play, and narration;
5. add privacy-safe social wonder and offline resilience after the core
   experience is stronger.

The flagship bet is **Echo Atlas**: five illustrated Atlas Regions joined by
bridges, twenty interactive landmarks, utility-first details with one short
authored field note, and direct handoffs into play and practice. It borrows
WebGemma's strongest idea — a journey that is itself explorable — while
preserving Echo Maze's locked storybook field-guide identity.

## 2. Review basis

This plan is based on current repository and browser evidence, not README claims
alone.

### 2.1 Repository evidence

- Git: clean `main` at `1313fc8`; no open pull requests.
- CodeGraph: 257 files, 2,295 nodes, and 4,716 edges; index current.
- Graphify: 2,199 nodes, 3,984 edges, and 183 communities; graph rebuilt from
  the reviewed commit with no import cycle reported.
- Product contracts reviewed:
  - `CONTEXT.md`
  - `design.md`
  - `tokens.css`
  - ADRs 0001–0037 relevant to gameplay, Atlas, Journal, Daily, access,
    Classroom, replay verification, and the frozen feature contract
  - prior product plans and `docs/plans/implementation-coverage.md`
  - `docs/UNFINISHED-FEATURES.md`
- Current implementation seams reviewed:
  - `src/game/game-session.js`
  - `src/game/quest-progress.js`
  - `src/game/quest-atlas.js`
  - `src/game/quest-atlas-view.js`
  - `src/game/run-action-log.js`
  - `src/game/active-run-locator.js`
  - `src/learning/`
  - `src/classroom/`
  - `src/main.js`
  - player, Daily, Classroom, and replay server boundaries

### 2.2 Live app evidence

The current app was exercised locally at:

- desktop: 1440 × 1000;
- mobile: 390 × 844;
- landing, first entry, Quest Level choice, active gameplay, Atlas, Journal,
  Records, Settings, Daily, Casual Global Scoreboard, and signed-out Classroom
  states.

Observed strengths:

- desktop gameplay remains centered and fold-fitting;
- the level chooser explains difficulty and curriculum clearly;
- the game remains usable when player or Daily services are unavailable;
- unavailable services resolve to truthful messages instead of blocking local
  play;
- mobile has no page-level horizontal overflow;
- the central Labyrinth and core controls remain reachable near the top of the
  mobile experience.

Observed friction:

- signed-out play shows seven equal command-bar buttons crowded into the
  390-pixel mobile header; authorized Classroom visibility adds an eighth
  action, and several labels wrap;
- a new Explorer sees many systems before learning one complete play loop;
- Atlas communicates state accurately but reads as a progress matrix rather
  than a place;
- Journal is privacy-safe but offers only a coarse summary and one Question at
  a time;
- Run Records replay a seed, not the Explorer's path or choices;
- refresh reconstructs the same Labyrinth but not the exact active Run state;
- Classroom provides membership, invitations, and aggregate progress, but not
  reviewed assignments or Class Expeditions.

### 2.3 Validation evidence

`npm run check` passed on the reviewed commit:

- ESLint: passed;
- TypeScript checking: passed;
- Vitest: 105 files passed, 7 skipped; 937 tests passed, 16 skipped;
- production build: passed;
- bundle budgets: passed.

Current bundle headroom is narrow:

- landing JavaScript: 7.56 KB gzip of an 8 KB budget;
- gameplay JavaScript: 28.57 KB gzip of a 30 KB budget;
- shared styles: 10.41 KB gzip of a 12 KB budget;
- optional Clerk: 544.21 KB gzip of a 600 KB budget.

No feature in this roadmap may solve headroom by silently raising these budgets.
New player surfaces must be lazy-loaded and new orchestration should leave
`src/main.js`, currently 3,078 lines, smaller or no larger after feature-specific
extraction.

The full Playwright suite and production integrations were not rerun during
this planning pass. No production billing, enforcement, migration, or account
action was performed.

## 3. Current product verdict

### 3.1 What is already strong

#### Game identity

- Fog, Pulse, Echoes, Wardens, and Gate form one coherent exploration loop.
- A correct answer defeats a Warden; a wrong answer costs Vitality and presents
  a fresh Question.
- Warden Patrol, Hunt, and Intercept modes are readable and deterministic.
- The same Labyrinth geometry and rule configuration can be reconstructed from
  seed, Quest Level, and Labyrinth Number; ordinary provider timing may select
  a different reviewed Question.

#### Learning and child safety

- Provider output cannot invent child-facing facts or wording.
- Every accepted Question reproduces a reviewed card exactly.
- Bundled reviewed Questions preserve play when a provider or network fails.
- Questions pause the timer and retain free Hint and exact Question Skip rules.
- Lantern Journal stores only bounded, coarse learning outcomes.

#### Progression and fairness

- Each Quest has twenty unique Labyrinths and Quest-wide unique Questions.
- Five Difficulty Bands scale the same clear core loop.
- Gate Wardens create milestones without raising the score ceiling.
- Payment grants Run Access only; it never changes combat or learning rules.
- Daily competition is replay-verified while the ordinary Global Scoreboard is
  truthfully labelled casual.

#### Platform trust

- Identity, payment, Classroom authority, and persistence remain outside
  deterministic Run calculations.
- Cloud Quest Continuity synchronizes at boundaries rather than mid-Run.
- Classroom data uses forced PostgreSQL row-level security.
- Teacher views expose aggregate counts rather than answer transcripts.
- Export, deletion, audit, rate limit, webhook, and observability boundaries
  are already substantial.

### 3.2 Highest-value gaps

1. **First-run comprehension:** responsive fit does not prove that a child can
   understand the dense initial workbench without help.
2. **Emotional progression:** twenty Labyrinths are technically cumulative but
   still feel visually similar.
3. **Active continuity:** refresh loses position, discoveries, elapsed time,
   Vitality changes, and active Challenge state.
4. **Learning depth:** Journal counts outcomes but does not show why an answer
   works through a suitable visual model.
5. **Run memory:** existing Records offer Play This Seed, not Watch Trail for
   the completed route and decisions.
6. **Choice:** repeat Quests vary seeds and Questions but offer little
   player-chosen curriculum identity.
7. **Teacher purpose:** Classroom manages access and aggregate visibility, not
   a reviewed learning expedition.
8. **Nonvisual play:** the Canvas remains the primary spatial interface.
9. **Return delight:** Daily has fair ranking but no privacy-safe shared visual
   artifact.

## 4. What to borrow from WebGemma

WebGemma was reviewed as inspiration, not as a template to copy.

### 4.1 Transferable patterns

| WebGemma pattern | Echo Maze translation |
|---|---|
| Illustrated islands connected into one journey | Five Atlas Regions connected by field-guide bridges |
| Click a landmark and reveal context in place | Select a Labyrinth landmark and open its utility detail, field note, learning focus, state, and next action |
| Detail view hands off directly to Playground | Atlas landmark hands off to Continue Quest, Workshop, or Watch Trail |
| Journey and Playground are separate top-level modes | Play, Atlas, and Workshop become three clear destinations |
| Color and small metadata make each model recognizable | Shape, region motif, Difficulty Band, and state make each landmark recognizable |
| Contextual capability/setup guidance | Explain unavailable cloud, narration, or Classroom capability at point of use |
| Detail drawer keeps the map visible | Desktop side inspector and mobile bottom sheet preserve journey context |

### 4.2 What must not be copied

At a 390 × 844 viewport override, the reviewed WebGemma document measured
384 pixels of client width and 582–583 pixels of scroll width. Header layers
collided, the Playground rail clipped the workspace, and a visible tab could
not receive a normal pointer click because another header layer intercepted it.

Accessibility issues also make a direct imitation unsuitable:

- SVG landmark groups are clickable but have no role or keyboard focus;
- Journey has no semantic headings;
- several primary controls are below Echo Maze's 44-pixel target minimum;
- mode and model state do not update the URL;
- decorative motion has no detected reduced-motion alternative;
- button cards contain nested links.

Echo Maze must instead provide:

- semantic landmark buttons plus a list fallback;
- stable URLs for Play, Atlas landmarks, and Workshop selections;
- no horizontal page overflow at 320, 390, 768, or 1440 pixels;
- 44 × 44 pixel minimum targets;
- keyboard pan/selection, “Center current,” and explicit zoom controls;
- mobile bottom sheet rather than a fixed desktop rail;
- initial Atlas view fits the active route or provides an overview/minimap;
- reduced-motion behavior that removes nonessential travel and atmosphere;
- one interactive owner per action, never nested links inside buttons.

## 5. Locked product and architecture contracts

Every proposed feature must preserve these rules unless a separately approved
ADR explicitly supersedes one:

- `createRun` and `applyAction` remain the deterministic gameplay boundary.
- Correct answers defeat Wardens.
- Wrong answers remove one Vitality and, while Vitality remains, continue the
  Challenge with a fresh Question.
- Final Vitality loss ends the Run.
- Questions remain short, unambiguous, age-appropriate, reviewed, and untimed.
- Invalid, unavailable, unsafe, changed, or timed-out provider output falls
  back to bundled reviewed content.
- A Quest retains twenty unique Labyrinths and Quest-wide unique Questions.
- Difficulty still escalates through the five four-Labyrinth bands.
- Every Labyrinth retains one free Question Skip; later skips cost one Vitality
  with warning and confirmation.
- Every Question retains its free Hint.
- Gate Wardens stay at Labyrinths 4, 8, 12, 16, and 20.
- Membership grants access only, never power, easier Questions, extra Vitality,
  extra Hints, or favorable ranking.
- Active Run state never becomes mid-Run cloud synchronization.
- Journal never becomes an answer transcript, diagnosis, or permanent child
  profile.
- Classroom data remains tenant-scoped, forced-RLS, and aggregate-only for
  Teacher learning views.
- Daily never alters Quest, Atlas, Run Access, demo, Personal Records, or the
  casual Global Scoreboard.
- New server behavior reuses existing Vercel function rewrites; the current
  function ceiling may not be exceeded.
- New client features are lazy chunks and stay inside existing bundle budgets.
- `design.md` remains locked. An Echo Atlas visual amendment requires explicit
  approval and must preserve its typography, color tokens, outlines, target
  sizes, and field-guide voice.

## 6. Prior-plan reconciliation

This roadmap does not reopen delivered work.

| Existing commitment | Current disposition | Roadmap treatment |
|---|---|---|
| Answer-based Warden combat, Hint, Skip, safety, uniqueness, scaling | Delivered | Locked invariant |
| Entry experience and Guest account boundary | Delivered | First Light extends onboarding only |
| Lifetime Membership and Run Access | Delivered in test-mode engineering | No commercial redesign |
| Echo Atlas and Gate Wardens | Delivered | Echo Atlas gains a presentation and narrative evolution without becoming progress authority |
| Cloud Quest Continuity | Delivered | Active Run Recovery stays local and mid-Run |
| Lantern Journal and one-Question Practice | Delivered | Echo Lens and Lantern Trails deepen the existing safe boundary |
| Explorer Access Settings | Delivered | Trail Compass and Question Narration extend opt-in access |
| Casual Daily Shared Labyrinth | Delivered | Preserved |
| Verified Daily Board and action replay | Delivered in repo | Protocol remains isolated; Run Replay uses its own sanitized terminal log and Constellation may consume only approved aggregates |
| Classroom, invitations, RLS, domain auto-join | Delivered | Class Expeditions add reviewed Teacher intent |
| Gate Warden capstone Questions | Delivered | Reused by Learning Decks |
| Admin question bank | Delivered | Becomes publishing gate for explanations and decks |
| Migration 0018 live application | External operator action | Blocks live Daily Constellation, not other features |
| Live Stripe setup, enforcement, purchase/refund smoke | External approval | Explicitly outside this roadmap's implementation authority |

Truth debt resolved in the Milestone 1 foundation:

- GitHub issue #89 was closed as completed after PR #94 evidence proved its
  child tickets and replay-verified Daily ranking were merged.
- `docs/README.md` now records all nine delivered enterprise-hardening phases,
  ADRs 0001–0037, the closed prior backlog, and this frozen roadmap.
- `docs/performance-budget.md` now records the 2026-07-29 bundle baseline and
  the exhausted 12-function Vercel ceiling.
- the moderated first-player script and privacy-safe findings template are
  stored under `docs/playtests/`.

These are tracker/documentation corrections, not new player features.

## 7. Design direction

### 7.1 Signature

**Five floating field-guide islands stitched by navy rope bridges.**

Each Atlas Region restores one original illustrated layer as its four
Labyrinths are completed. A current landmark carries the electric-pear signal;
completed landmarks become stamped field notes; Gate Warden landmarks use a
diamond crest and an authored reveal. The final Atlas reads as a record of one
specific Quest, not a generic level grid.

### 7.2 Visual system

- Keep warm paper, deep navy, electric pear, sea-glass exploration, coral
  danger, and leaf-green success from `tokens.css`.
- Keep Bricolage Grotesque for display, Geist for body, and Geist Mono for
  compact expedition facts.
- Use original SVG or Canvas field-guide artwork; do not replicate WebGemma's
  island/bridge artwork, silhouettes, composition, gradients, logos, or
  model-card styling.
- Spend visual boldness on Atlas only. Gameplay remains quiet, centered, and
  readable.

### 7.3 Information architecture

Desktop:

```text
[ Play ] [ Atlas ] [ Workshop ]                         [ Explorer / More ]

[ region index ] [        explorable Atlas        ] [ landmark detail ]
```

Mobile:

```text
[ current Quest summary ] [ More ]
[       explorable Atlas, no page overflow       ]
[        selected landmark bottom sheet          ]
[          Play | Atlas | Workshop tabs          ]
```

Play remains the default route and must not be delayed by Atlas assets.
Records, Settings, Sound, Profile, Daily, and Classroom remain reachable, but
they no longer need seven equal-width primary actions on mobile.

### 7.4 Motion

- One orchestrated region-restoration moment after a Gate Warden.
- Short focus travel when “Center current” is used.
- No required drag, zoom, parallax, or ambient animation.
- Reduced motion replaces travel with an immediate state change and short
  opacity transition.

## 8. Prioritized feature portfolio

Scores are directional planning judgments, not usage data. Value and confidence
use a 1–5 scale. Effort is relative and must be refined after feature grilling.

| Order | Feature | Priority | Value | Confidence | Effort | Main dependency |
|---:|---|---|---:|---:|---|---|
| 0 | Truth and delivery headroom | P0 foundation | 3 | 5 | S | None |
| 1 | First Light Tutorial | P0 committed | 5 | 4 | M | Foundation playtest and tuning |
| 2 | Active Run Recovery | P0 committed | 5 | 5 | M | Same-device recovery contract |
| 3 | Echo Atlas | P0 committed flagship | 5 | 5 | L, sliced | Foundation |
| 4 | Run Replay | P1 committed | 4 | 5 | M | Active Run Recovery |
| 5 | Living Regions | P1 committed | 4 | 4 | L, sliced | Echo Atlas |
| 6 | Trail Twists | P1 committed | 4 | 4 | L, rules-heavy | Living Regions + ADR 0026 |
| 7 | Echo Lens and Lantern Trails | P1 committed | 5 | 4 | L, sliced | Journal metadata and admin review |
| 8 | Learning Decks | P1 committed | 4 | 4 | XL, content-heavy | Reviewed content coverage |
| 9 | Class Expeditions | P2 committed | 5 | 3 | XL, sliced | Learning Decks, Classroom authority, cost model |
| 10 | Trail Compass | P2 committed | 4 | 4 | M | Access Settings |
| 11 | Question Narration | P2 committed | 4 | 3 | M | Existing Questions and Access Settings |
| 12 | Daily Trail Constellation | P3 committed | 4 | 3 | L, privacy validation first | Verified Daily + live migration |
| 13 | Offline Run Continuity | P3 committed | 3 | 3 | XL, technical validation first | Active Run Recovery + ADRs 0034–0036 |

Before any feature issue is published, its validation/spec must fill this
decision card:

| Field | Required answer |
|---|---|
| Baseline source | Existing trusted product fact, moderated playtest, or “not available” |
| Primary outcome | One player/Teacher behavior the feature should improve |
| Counter-metric | One harm or displacement the feature must not increase |
| Target | A reasoned hypothesis, marked `[PLACEHOLDER]` until baseline exists |
| Review window | When enough evidence will exist to decide |
| Decision threshold | Continue or revise-until-acceptable rule |

Implementation completion is not product success. A feature can pass every test
and still require revision when its intended outcome does not improve.

## 9. Feature specifications and vertical slices

### 9.1 P0 foundation — Truth and delivery headroom

**Player outcome:** New work starts from truthful status and cannot make core
play slower or less reliable.

**Scope:**

1. close or reconcile stale issue #89 using merged PR #94 evidence;
2. correct `docs/README.md` status drift;
3. record current bundle and Vercel function ceilings as acceptance gates;
4. define a small moderated first-run playtest script before changing
   onboarding;
5. complete the baseline/outcome/counter-metric/target/review-window/decision
   card for each feature before publishing its issue;
6. define only privacy-safe measurement needed for committed feature outcomes.

**Measurement rule:** Prefer supervised playtests and existing server-trusted
facts. Do not add child identity, free text, answer content, raw route history,
or third-party session replay. Any new aggregate telemetry requires a separate
privacy review.

**Acceptance gates:**

- repository docs, GitHub issue state, merged code, and migration status agree;
- no bundle budget is raised;
- no new Vercel function is introduced;
- playtest observations separate what happened from why the team thinks it
  happened.

**Likely files/systems:** `docs/README.md`, issue #89, performance docs, test
fixtures. No gameplay rule change.

### 9.2 P0 — First Light Tutorial

**Player feeling:** “I know what to do, and my first success belongs to me.”

**Purpose:** Replace explanation overload with a short playable tutorial while
keeping the real Labyrinth as the hero.

**Grill decision — resolved:** First Light is committed to ship. A moderated
first-player test tunes its scope and establishes a baseline; it no longer
decides whether the feature exists.

**Defeat decision — resolved:** First Light preserves the normal
Warden/Vitality rule. Repeated wrong answers may end the tutorial attempt at
zero Vitality, after which the Explorer receives an immediate, free **Retry
First Light** action. Tutorial defeat consumes no Run Grant and writes no
Quest, Journal, Score, Daily, Classroom, or Run Record state.

**Entry decision — resolved:** First Light is optional for every Explorer.
**Start First Light** is the recommended action, **Skip to Quest** remains
visible without warning or penalty, and First Light can be replayed later.

**Validation dependency:** First run the foundation playtest. If Explorers
misunderstand the controls or Echo/Warden/Gate loop, First Light must teach the
observed gap. If they understand the loop but the command bar and side content
overwhelm them, keep First Light minimal and also use progressive disclosure in
the existing workbench.

**Contract:**

- deterministic, replayable, and locally bundled;
- outside Quest, Score, Journal, Run Access, Daily, and Records;
- introduces movement, one Echo, one Warden Challenge, Hint, and the Gate in
  that order;
- the first Echo cannot be missed;
- normal Warden Challenge defeat rules apply, followed by free tutorial retry;
- Skip is explained, not forced;
- every Explorer can skip it or replay it later.

**Vertical slices:**

1. **Baseline evidence:** record comprehension, command-density friction, and
   the counter-metric the tutorial must not worsen.
2. **Tutorial rules fixture:** define a small deterministic Labyrinth and
   side-effect-free completion contract.
3. **Guided controls:** introduce only the next usable control through the
   existing workbench.
4. **Warden teaching beat:** use one reviewed Question and demonstrate Hint,
   answer consequence, and timer pause.
5. **Return path:** hand off to normal Quest Level choice without consuming a
   Run or retaining tutorial state as learning history.

**Acceptance gates:**

- no write to Quest Progress, Journal, Run Access, Daily, Scoreboard, Classroom,
  or Run Records;
- tutorial defeat offers Retry First Light without consuming a Run Grant;
- keyboard, touch, screen reader, reduced-motion, and 200-percent text paths
  work;
- a first-time child can state “correct defeats the Warden; wrong costs
  Vitality” after the tutorial;
- provisional playtest target `[PLACEHOLDER]`: at least 80% of first-time
  supervised players finish without an adult taking control.

**Likely seams:** a new focused tutorial module, existing renderer/controller
adapters, reviewed bundled Question resolver, focused unit and browser tests.

### 9.3 P0 flagship — Echo Atlas

**Player feeling:** “This is one expedition, and I can see where I have been.”

**Purpose:** Turn the delivered Atlas projection into a memorable navigable
world without creating a second source of progress.

**Entry decision — resolved:** Play remains the default destination for new and
returning Explorers. Atlas is a prominent optional destination and may host a
short earned restoration ceremony after a Gate Warden, but its illustration,
audio, and interaction chunks never block or preload on the Play route.

**Landmark decision — resolved:** Landmark detail is utility-first with one
brief human-authored field note. Current landmarks continue the Quest,
completed landmarks open Watch Trail when a retained Run Replay is available, learning focuses
open Workshop when available, and ahead landmarks provide preview only. Atlas
contains no generated lore, branching story, inventory, or separate reward
economy.

**History decision — resolved:** Atlas represents the active Quest only.
Starting a new Quest replaces the previous Atlas projection; Echo Atlas
does not add historical Quest storage or a scrapbook archive.

**Contract:**

- remains a pure projection of Quest Progress;
- five regions, twenty landmarks, and the same five Gate Warden milestones;
- completed, current, ahead, and milestone states use shape and text as well as
  color; the linear Quest has no separate “available” choice state;
- landmark detail may show only derived/public Quest facts:
  - Labyrinth Number;
  - Difficulty Band;
  - completion state;
  - reviewed learning focus;
  - Gate Warden status;
  - local completion memory where approved;
  - one short human-authored field note;
- selecting a current landmark can Continue Quest;
- selecting a completed landmark can open Watch Trail after feature 9.6 ships
  and only while its retained Run Replay still exists;
- selecting a learning focus can open Workshop after feature 9.5 ships;
- selecting an ahead landmark provides preview only.

**Vertical slices:**

1. **Landmark projection:** extend immutable Atlas presentation data with
   authored region metadata and stable deep-link identifiers.
2. **Semantic world map:** original artwork, landmark buttons, region headings,
   keyboard navigation, list fallback, pan/zoom controls, and Center Current.
3. **Contextual detail:** desktop inspector and mobile bottom sheet with stable
   URL state and focus restoration.
4. **Restoration ceremony:** one lazy-loaded Gate Warden completion reveal with
   reduced-motion fallback and no gameplay effect.

**Acceptance gates:**

- no new progress or reward inventory table;
- reload/deep link restores selected landmark without changing Quest state;
- every landmark is keyboard- and screen-reader-operable;
- list fallback exposes identical state and actions;
- no page overflow at 320, 390, 768, or 1440 pixels;
- all targets are at least 44 × 44 pixels;
- base Play route does not download Atlas illustration or audio chunks;
- existing bundle budgets remain unchanged;
- supervised players can identify current landmark, next Gate Warden, and
  completed region without instruction.

**Likely seams:** `quest-atlas.js`, a new lazy Atlas page/controller, Atlas
styles/assets, router state, projection tests, desktop/mobile browser tests.

### 9.4 P0 — Active Run Recovery

**Player feeling:** “Closing the tab did not erase what I just did.”

**Purpose:** Restore the exact active Run on the same device without violating
boundary-only cloud continuity.

**Grill decision — resolved:** Use exact Active Run Recovery. One temporary
device-local recovery envelope may retain the bounded state-changing action
sequence until the Run escapes, is defeated, or is explicitly restarted. An
unresolved Challenge may retain its exact normalized reviewed card. Once
resolved, that card, its Hint, and the selected option compact to a
response-free outcome plus only the feedback needed to reconstruct the current
presentation. This data is not a learning transcript and never enters cloud
continuity, Journal, analytics, export, or Run Records. Elapsed time freezes at
the last durable gameplay checkpoint while the app is closed, and a recovered
Run opens paused. “Exact” means every supported state-changing action committed
to a durable recovery checkpoint is preserved; it does not promise
millisecond-perfect persistence during abrupt process termination.

**Terminology resolved:** The canonical domain term is **Active Run Recovery**
and its player-facing label is **Campfire Resume**. `CONTEXT.md` distinguishes
it from forbidden active Run cloud synchronization and cross-device resume.

**Question continuity decision — resolved:** Recovery pins the exact reviewed
Question accepted for the active Challenge in a temporary normalized
reviewed-card snapshot. Later editing or unpublishing never replaces that
Question inside the active Run. The snapshot cannot serve future Runs or
Practice and is deleted with the recovery record.

**Contract:**

- local-only; never sync active position or answers to cloud;
- keep Verified Daily `Run Action Log` version 1 unchanged and protocol
  compatible;
- persist a separate bounded, versioned local recovery envelope;
- store the normalized reviewed-card snapshot accepted for each active
  Challenge; an ID alone is not enough because an admin overlay may change or
  disappear;
- compact a resolved Challenge to a response-free outcome without retaining
  its reviewed card, Hint, or selected option identifier;
- reconstruct through existing `createRun` and `applyAction`, not a second
  engine;
- restore Explorer position, revealed tiles, Echoes, Wardens, Vitality, Pulses,
  free-Skip state, elapsed time, and active Challenge;
- define exact behavior for Hint visibility, a loading Challenge, and
  recovery-version migration;
- offer Continue or Restart when recovery is valid;
- corrupt, outdated, or divergent recovery data fails safely to a fresh
  reconstruction with clear copy;
- terminal Run clears active recovery.

**Vertical slices:**

1. **Recovery contract:** terminology update, separate protocol, immutable
   Question content resolution, size limit, migration, elapsed-time policy, and
   corruption behavior.
2. **Deterministic reconstruction:** replay accepted actions and reviewed
   Questions through the canonical engine.
3. **Resume interface:** Continue/Restart decision, challenge focus recovery,
   and storage-unavailable state.

**Acceptance gates:**

- exact state matches uninterrupted play across fixed fixtures;
- no duplicate Journal, score, access, or Quest boundary write occurs;
- storage denial never blocks current-tab play;
- active recovery contains no account identity or free-form content;
- cloud Quest Progress remains unchanged until the normal terminal boundary;
- Verified Daily version-1 logs remain byte/schema compatible and the server
  still rejects extra fields or unsupported versions;
- recovery payload has a tested hard size limit.

**Likely seams:** `run-action-log.js`, `active-run-locator.js`, a new local
recovery adapter, `main.js` integration extraction, unit and browser tests.

### 9.5 P1 — Echo Lens and Lantern Trails

**Player feeling:** “I can see why this works, then try it again safely.”

**Purpose:** Evolve one-Question Practice into a short, reviewed learning
workshop without turning Echo Maze into a diagnostic dashboard.

**Live-help decision — resolved:** Echo Lens never appears before an answer is
committed in a live Warden Challenge. The existing free Question Hint remains
the sole pre-answer help. Lens may appear after correct/wrong feedback or
outside live play in Journal, Workshop, and Lantern Trails.

**Content-ownership decision — resolved:** Each Echo Lens is authored, reviewed,
and versioned against one exact Reviewed Question Revision. Editing Question
wording, values, choices, answer, Hint, or explanation creates a new revision
whose Lens must be reviewed separately. Objective-level generic Lens content
cannot substitute for a missing revision-specific Lens.

**Trail-length decision — resolved:** A Lantern Trail contains three required,
distinct Practice Lanterns for one learning objective, followed by up to two
optional **Keep Practicing** Questions. Completing the first three creates no
score, mastery rank, reward, or Quest progress.

**Sequence decision — resolved:** Each Lantern Trail revision uses one fixed,
reviewed Question sequence. Correct/wrong outcomes change feedback only; they
do not adapt the next Question, create an ability score, infer mastery, or
produce a diagnosis.

**Continuity decision — resolved:** Unfinished Lantern Trail position exists
only in the current Workshop tab. Refreshing or closing restarts the Trail;
coarse Journal outcomes already recorded remain, but no separate local or cloud
practice-progress record is created.

**Echo Lens:**

- optional post-answer visual explanation matched to reviewed content;
- allowed visual models include number lines, arrays, fraction bars, word
  highlighting, patterns, and simple diagrams;
- every explanation is authored/reviewed and versioned with the exact Question
  revision;
- no generated free-form child explanation.

**Lantern Trail:**

- three required unscored Questions plus up to two optional Keep Practicing
  Questions;
- Explorer may choose an objective or accept a Journal suggestion;
- no Warden, timer, score, Vitality, Run Access, Quest, Atlas, Daily, or
  Classroom ranking effect;
- feedback remains encouraging and factual;
- Journal stores only the existing coarse events.

**Vertical slices:**

1. **Explanation contract:** allowlisted visual primitives, content validation,
   admin preview, and publish blocker.
2. **One objective end to end:** Lens plus a short Trail using bundled reviewed
   cards.
3. **Workshop journey:** objective picker, progress, resume-in-tab, completion,
   and return to Atlas.
4. **Content expansion:** publish additional objectives only when explanation
   and uniqueness coverage is complete.

**Acceptance gates:**

- 100% of launched Lens content passes human review;
- unsupported objectives do not show a generic or model-invented explanation;
- Practice cannot mutate Run or commercial state;
- no exact answer transcript or timestamp enters Journal/cloud storage;
- screen reader exposes the same reasoning as the visual model;
- `[PLACEHOLDER]` playtest target is set only after baseline next-Question
  performance is observed.

**Likely seams:** learning-objective metadata, Question bank validation/admin,
new lazy Workshop modules, Journal adapter, focused tests.

### 9.6 P1 — Run Replay

**Player feeling:** “I can watch my route and spot one smarter choice.”

**Purpose:** Turn a finished local Run into a replayable memory and learning
moment.

**Answer-history decision — resolved:** Persistent Run Replay stores gameplay
outcomes only. At terminal state, any recovery action carrying a selected
answer-option identifier is converted to a sanitized correct, wrong, Hint, or
Skip outcome. Exact option identifiers and selected answer text do not enter
the retained Run Replay.

**Persistence decision — resolved:** Run Replay remains device-local and is
attached only to one of the five retained Run Records. Removing or aging out
that Record removes its Run Replay. No full route log synchronizes to cloud
storage or becomes a public share. Challenge Cards are not part of this
roadmap; any later proposal must be a separately privacy-reviewed, static,
sanitized export rather than a route log.

**Contract:**

- derive a bounded sanitized terminal log from Active Run Recovery and replay it
  through the canonical engine;
- step, play, pause, scrub, and restart a completed Run;
- show movement, Pulse, Echo collection, Warden encounters, and terminal state;
- never retain or display selected-answer identifiers or text;
- default to local-only and identity-free;
- reduced motion uses step-by-step state rather than animation.

**Vertical slices:**

1. persist an approved bounded terminal replay alongside a Run Record;
2. render a local step viewer with controls and event list;
3. link completed Atlas landmarks and Records to the viewer.

**Acceptance gates:**

- replay terminal facts equal original terminal facts;
- old Records without logs remain readable and replay the seed as today;
- deleting or aging out a Run Record deletes its attached Run Replay;
- replay data has no identity, selected-answer identifier or text, or hidden
  provider data;
- Run Replay is a lazy chunk and does not enlarge active gameplay bundle.

### 9.7 P1 — Learning Decks

**Player feeling:** “I can choose the kind of thinking I want to practice.”

**Purpose:** Add meaningful repeat-Quest choice without changing Quest Level or
allowing unreviewed content.

**Launch-roster decision — resolved:** The four launch Decks are:

- Mixed Trail;
- Number Trail;
- Word Trail;
- Nature Trail.

Every non-Mixed Deck revision must, at every Quest Level, supply focused
reviewed Questions for at least 70% of correct-first Warden encounters in each
Region plus a Deck-matched Capstone Question for each Region's Gate Warden.
A revision below that coverage cannot publish; legal demand beyond the focus
boundary uses the announced Mixed fallback.

**Exhaustion decision — resolved:** A selected Deck is a preferred reviewed
objective mix. When its unique focused Questions are exhausted, the game
truthfully announces the transition and continues with unused, reviewed Mixed
Trail Questions at the same Quest Level and Difficulty Band. It never blocks
the Quest, repeats a used Question, or generates unreviewed content to preserve
Deck purity.

**Quest-identity decision — resolved:** Deck and immutable Deck revision are
chosen when a Quest starts and remain fixed until that Quest ends or is
replaced. Selecting another Deck requires a new Quest. Mixed fallback use is
recorded within the selected Deck contract and is not a Deck switch.

**Contract:**

- Quest Level still controls learner tier and Labyrinth scaling;
- Learning Deck controls only the reviewed objective mix;
- content capacity is calculated from current Warden counts and every legal
  Question-consuming path, not from the twenty Labyrinth count;
- each non-Mixed revision clears the 70%-per-Region focus gate at all three
  Quest Levels and includes five Deck-matched Capstones;
- even correct-answer-first play currently needs 36 Bright Start, 56 Trail
  Scout, or 88 Maze Master Warden Questions across a full Quest;
- free Skips, wrong answers, defeats, retries, capstones, and Practice create
  additional demand; exhausting focused content invokes the announced Mixed
  Trail fallback;
- cloud Quest identity includes Learning Deck and immutable revision;
- Deck and revision cannot change mid-Quest;
- two incompatible decks never silently merge;
- no Teacher or player free-form Question authoring.

**Vertical slices:**

1. computed correct-first demand, 70%-per-Region focused-content report,
   fallback proof, and publish blocker;
2. all three non-default Decks across normal and Gate Warden Questions;
3. deck choice at new Quest creation and Atlas identity;
4. cloud conflict and migration handling.

**Acceptance gates:**

- no legal sequence of wrong answers, Skips, defeats, or retries can block the
  Quest for lack of reviewed Questions;
- focused-to-Mixed fallback is announced once and preserves Quest Level,
  Difficulty Band, and uniqueness;
- every published non-Mixed revision meets the 70%-per-Region gate and all five
  Deck-matched Capstone requirements at every Quest Level;
- Question uniqueness and difficulty invariants remain exact;
- default existing Quests migrate to Mixed Trail without losing progress;
- deck selection never changes Run Access or membership value.

### 9.8 P1 — Living Regions

**Player feeling:** “Each part of the expedition feels like a new place.”

**Purpose:** Give five Difficulty Bands distinct atmosphere, readable dramatic
rhythm, and a versioned regional gameplay decision.

**Regional-system decision — resolved:** Living Regions is the composite player
experience. Region Theme owns presentation; Trail Twists is its only gameplay
layer. Both named features ship, but no regional mechanic may hide inside Atlas,
rendering, sound, or theme code.

**Ambient-sound decision — resolved:** Every Region has one authored ambient
sound layer. It starts only after explicit Sound On, pauses with the Run and
hidden tab, and stops immediately with Sound Off. No warning, clue, Twist state,
or Warden-mode signal exists only in audio. Trail Compass remains complete
without it, and First Light uses only universal sounds.

**Warden-visual decision — resolved:** Each Region has one authored Warden Guild
appearance, while Patrol, Hunt, Intercept, and Lured retain universal glyphs and
text labels across every Guild. Gate Wardens retain one universal boss marker,
and color is never the only mode signal. Region art changes neither collision
geometry, timing, pathfinding, nor implied abilities; Trail Compass uses the
same canonical names.

**Gate-staging decision — resolved:** A short skippable entrance beat pauses the
Run before the Region's Gate Warden. Escaping the Region triggers one short
authored Sigil ceremony; its full form plays once per Region in the active
Quest, while repeat Runs use a compact result. Reduced Motion uses a static
transition, Sound is optional, and skipping has no penalty. Staging changes no
timer, score, behavior, reward, or access; the restored Atlas landmark is the
only lasting result.

Ingredients:

- authored region palette/motif derived from existing tokens;
- opt-in authored ambient sound layer;
- region-specific Warden Guild art around universal Patrol, Hunt, Intercept, and
  Lured mode signals;
- distinct Gate Warden encounter staging and Sigil ceremony;
- a separately specified, deterministic, versioned Trail Twist layer.

**Vertical slices:**

1. prototype the Region 1 Theme without changing its accepted Twist contract;
2. playtest whether players recognize the place and Warden telegraph;
3. tune the shared presentation pattern from evidence;
4. implement and test the paired Trail Twist through feature 9.14;
5. deliver all five Region Theme and Trail Twist pairs sequentially.

**Acceptance gates:**

- seed replay remains exact;
- Warden visual identity never misrepresents its actual mode;
- Gate Warden and normal-mode recognition passes without color or sound;
- no hidden information is exposed;
- all regional audio is optional and duplicates no exclusive gameplay signal;
- Gate staging and ceremony are skippable, side-effect-free, and reduced-motion
  safe;
- region assets are lazy and reduced-motion safe;
- Region Theme code changes no gameplay state;
- every gameplay change belongs to a versioned Trail Twist and carries explicit
  compatibility through active locators, recovery, Records, shares, Daily, and
  applicable server replay;
- Question, Hint, Skip, Vitality, score, and Run Access rules remain unchanged;
- the first prototype must make its Difficulty Band and Gate Warden
  anticipation recognizable before the remaining pairs enter production;
- prototype findings tune presentation and mechanics but cannot cancel any
  committed Region or Trail Twist.

### 9.9 P2 — Class Expeditions

**Player feeling:** “Our class is restoring one shared journey without putting
me on display.”

**Teacher outcome:** Assign a reviewed learning path in under
`[PLACEHOLDER]` minutes and see aggregate progress without answer surveillance.

**Access decision — resolved:** Students do not need individual Lifetime
Membership for assigned classwork. Each distinct assigned Run uses a
Classroom-sponsored Run Grant scoped to one Student, Classroom, Class
Expedition, and stable Run identifier. It changes no Personal Play allowance or
gameplay rule. The funding shape, limits, revocation, refunds, and closure rules
are resolved below. Production activation still requires the documented cost
model, Stripe test-mode proof, migration and abuse controls, support operations,
and separate authorization for live billing.

**Assignment-unit decision — resolved:** One Class Expedition assigns one
four-Labyrinth Atlas Region at a chosen Quest Level and Learning Deck revision.
It ends at that Region's Gate Warden, requires four Classroom Run Grants per
Student, and gives every Student an independent Class Play copy. A Teacher
assigns another Class Expedition to continue into the next Region.

**Completion-window decision — resolved:** A Teacher-set completion date is
advisory. Late Class Play remains available with no punishment, score change,
streak loss, or automatic access removal. Only explicit assignment closure or
authoritative Classroom Membership removal can stop new assigned play.

**Teacher-visibility decision — resolved:** Teacher views remain aggregate-only.
They may show class counts for started, per-Labyrinth completion, Region
completion, and coarse learning objectives, but no named completion status,
individual learning history, answer trail, route history, or Student ranking.

**Revocation decision — resolved:** Authoritative Classroom Membership removal
immediately blocks further Class Play reads and writes, even for a previously
granted assigned Run. When the client learns of removal it stops the active
Class Run and deletes its local recovery. No Class result is persisted;
Personal Play remains unaffected.

**Funding decision — resolved:** One non-recurring Class Expedition License is
purchased by a Teacher or school sponsor for one Classroom, one assigned Atlas
Region, and 30 assigned Students. It funds four assignment-scoped Run Grants
per eligible Student. Students never see a paywall, and the model has no
subscription or reusable credit/energy balance. Pricing requires a cost model;
live Stripe activation remains separately authorized.

**Capacity decision — resolved:** A declared-capacity seat is consumed when a
Student receives their first Classroom Run Grant for the Class Expedition.
Students who join later may use capacity that has never been assigned. Removing
a Student or ending their participation does not recycle that seat. When all
declared seats are assigned, the sponsor must purchase a one-time capacity
extension in increments of 5 seats for the same Class Expedition before another
Student begins. Multiple extensions are allowed; existing Students and their
Grants remain unaffected.

**Capacity-package decision — resolved:** The base License contains 30
non-recyclable assigned seats. Each one-time extension adds 5 seats and follows
the same unused-only refund rule.

**Price decision — resolved:** Capacity and access semantics are frozen, but the
USD amount remains cost-model-gated. The model must measure payment fees,
database and replay-verification cost, support/refund burden, and school
purchasing friction. Purchase, extension, refund, and dispute flows must pass
in Stripe test mode. A later list-price change never alters an already purchased
Expedition, and live billing requires separate explicit authorization.

**Refund decision — resolved:** The License receives a full refund only before
the first Student receives a Classroom Run Grant. A capacity extension is
refundable only before its first added seat is assigned. Once Class Play starts,
neither purchase receives an automatic or prorated refund. Billing disputes go
through sponsor support and never automatically interrupt Class Play, delete
Student progress, or alter Personal Play.

**Closure decision — resolved:** Explicit assignment closure is graceful and
reversible. It blocks new Grants and new Labyrinth starts, but an already-started
Labyrinth may finish or recover and still contributes to aggregate progress.
Reopening restores access to remaining Grants without resetting progress,
assigned capacity, or issued Grants. Authoritative Classroom Membership removal
remains the only classroom action that force-stops an active Class Run.

**Regional-rules decision — resolved:** Class Play always uses the assigned
Region's fixed Trail Twist from its first Labyrinth under the same rules as
Personal Play. Teachers may select Quest Level and a published Learning Deck
revision but cannot disable, replace, or randomize the Twist. Verified Daily
remains separate under Classic Rules.

**Contract:**

- Teacher selects an Atlas Region, published Learning Deck revision, Quest
  Level, and optional completion window;
- Student plays the assigned four Labyrinths under normal regional rules,
  including the fixed Trail Twist and Gate Warden;
- Teacher cannot override or randomize the Region's Trail Twist;
- class Atlas may show aggregate restored landmarks but no public individual
  ranking;
- completion windows never create streak loss, punishment, or access loss;
- closing an assignment blocks new starts while allowing an active Labyrinth to
  finish or recover;
- Teacher sees aggregate coarse objective and completion counts only;
- capacity seats are assigned once and cannot be transferred or recycled;
- refund eligibility ends when the first covered Grant or extension seat is
  assigned;
- all reads and writes remain forced-RLS and Classroom-scoped;
- Class Runs never receive Offline Continuity Receipts and pause for an online
  authority recheck after network loss;
- Personal Play remains separate.

**Vertical slices:**

1. assignment data contract and forced-RLS proof;
2. Teacher creates one reviewed Class Expedition;
3. Student starts/continues it from Classroom;
4. aggregate class Atlas and completion summary;
5. sponsor purchase, extension, capacity, refund, and dispute flow in Stripe
   test mode;
6. export/deletion/audit/operations coverage.

**Acceptance gates:**

- cross-Classroom isolation is proven in direct PostgreSQL tests;
- once authoritative Classroom Membership removal is recorded, subsequent
  Class Play reads and writes fail closed and associated Class Play records
  cascade; webhook lag and retry are tested;
- no prompt, selected answer, timestamped answer trail, or individual public
  rank is exposed;
- no named Student completion or individual learning-progress view is added;
- Classroom route reuses an existing serverless function;
- first-Grant seat assignment and capacity-extension authorization are
  idempotent under retries and concurrency;
- billing events cannot directly revoke Class Play or delete Student progress;
- close, reopen, and active-Run completion remain idempotent under retries and
  preserve aggregate-only reporting;
- four Classroom Run Grants per Student are authorized idempotently under the
  approved funding, limit, and revocation contracts before assignment play;
- no Class Run receives offline authority and reconnect requires current
  Membership plus assignment authorization;
- a concrete USD price cannot be proposed before the cost model and complete
  Stripe test-mode flow pass;
- Personal Play rules remain unchanged.

### 9.10 P2 — Trail Compass

**Terminology decision — resolved:** The precise development term is **Revealed
Path Compass** and the player label is **Trail Compass**. “Echo Sonar” is not
used because Echo already names a collectible, Pulse already reveals hidden
passages, and “sonar” incorrectly implies a hidden-state scan.

**Playability decision — resolved:** Trail Compass is a complete nonvisual
gameplay path, not an orientation-only widget or simplified mode. Keyboard and
screen-reader play must support every legal action, normal and Gate Wardens,
Echoes, Pulse, and all five regional Trail Twists under the same rules, score,
and outcomes as the visual maze.

**Communication decision — resolved:** Trail Compass uses quiet, action-driven
output. Each player action may produce one concise polite status describing
what changed. **Describe Trail** repeats the full revealed state on demand, and
optional directional tones play only after the player presses **Listen**.
There is no continuous, timer-driven, or automatic spatial audio. Sound Off
disables tones but never hides accessible text.

**Persistence decision — resolved:** Trail Compass defaults Off and is never
enabled through inferred screen-reader detection. Every Run and Explorer Access
Settings expose a clear **Use Trail Compass** action. Guests retain the choice
on that device; signed-in Explorers sync it across devices. The versioned Access
Settings record intentionally expands beyond its original four fields, with
existing records migrating Trail Compass to Off. Directional tones remain
user-triggered and governed by Sound rather than becoming another synchronized
preference.

**Player feeling:** “I can understand the revealed maze without relying only on
the picture.”

**Contract:**

- DOM-based controls expose every currently legal action without Canvas focus;
- compass describes the current tile, legal revealed exits, revealed entities,
  and active Trail Twist state;
- optional spatial audio indicates only already revealed Echo, Gate, or Warden
  direction and plays only after an explicit Listen action;
- one concise polite status describes each player-action result; a separate
  Describe Trail action repeats the full revealed state;
- never reveals Fog-hidden entities, shortcuts, or optimal paths;
- presentation-only; no geometry, timer, score, or ranking effect;
- every normal Quest remains playable by keyboard and screen reader without
  relying on the maze picture.
- Trail Compass enablement follows the versioned local/cloud persistence rules
  in ADR 0031 without entering deterministic gameplay state.

**Acceptance gates:**

- parity tests prove no hidden-state leak;
- action-trace parity tests prove visual and nonvisual play produce identical
  deterministic Run state for every core action and Trail Twist;
- normal Wardens, Gate Wardens, Pulse, Echoes, and all five fixed Trail Twists
  can be completed through the nonvisual path;
- status updates are concise and do not flood live regions;
- no automatic or continuous tone loop exists;
- audio has volume, stop, and mute behavior and respects Sound off;
- legacy four-field Access Settings migrate deterministically to Trail Compass
  Off, while signed-in saves remain revision-safe;
- all core play remains possible when Trail Compass is disabled.

### 9.11 P2 — Question Narration

**Terminology decision — resolved:** The development term is **Question
Narration** and its player control is **Read Aloud**. “Read With Me” is not used
because it implies a shared-reading tutor or assessment that the feature does
not provide.

**Voice-privacy decision — resolved:** Question Narration uses only browser
voices reporting `localService: true`. Question, choice, Hint, feedback, and
Echo Lens text is never sent to a remote narration service, and the app never
silently falls back to a remote browser voice. If no suitable local voice
exists, Read Aloud explains its unavailability while visible and screen-reader
accessible text remains authoritative.

**Control decision — resolved:** Nothing speaks automatically. **Read Aloud**
speaks only currently visible content and exposes pause, resume, repeat, and
stop. Closing or replacing that content cancels speech immediately. Question
Narration is independent from game Sound, and narration use never changes or
records an answer outcome.

**Persistence decision — resolved:** Narration offers Standard, Slower, and
Faster pace choices, with Standard as the default. Guest pace stays local;
signed-in pace syncs as the sixth Explorer Access Settings field. The selected
local voice remains device-local because installed voice inventories differ.
If it disappears, narration may choose another suitable local voice but never a
remote voice. There is no automatic-read preference.

**Player feeling:** “I can hear the reviewed Question at my pace.”

**Contract:**

- user-triggered narration for Question, choices, Hint, feedback, and Lens;
- only a suitable local browser voice may receive reviewed content;
- no microphone permission, recording, speech recognition, or voice answer;
- narration can pause, resume, repeat, and stop immediately;
- closing or replacing source content cancels speech;
- game Sound does not govern Question Narration;
- narration pace follows the ADR 0031 local/cloud settings rules while selected
  voice remains device-local;
- math/science pronunciation metadata is human-reviewed;
- text remains visible and authoritative.
- no local voice, delayed voice discovery, unsupported speech synthesis, and
  language mismatch all fail to an honest text-only state.

**Acceptance gates:**

- no automatic speech on dialog open;
- no remote voice service or child audio upload;
- supported-browser pronunciation is manually accepted for launched content;
- unsupported browsers receive truthful text-only behavior;
- Warden timer remains paused exactly as today.

### 9.12 P3 committed — Daily Trail Constellation

**Player feeling:** “Other Explorers found their own paths through today's
Labyrinth.”

**Purpose:** Add shared wonder after Daily completion without another reward
economy.

**Contribution decision — resolved:** At most one route contributes per
authenticated Explorer and canonical UTC Daily Labyrinth. The Explorer's first
verified escape contributes; later escapes may view the Constellation but never
replace that contribution. Guests may view after escaping but do not contribute
because one-person-one-route cannot be enforced. Aggregation happens during
verification without retaining a personal route for later replacement.

**Threshold decision — resolved:** The public projection remains **Paths are
still forming** until 20 distinct authenticated Explorers contribute. Each
visible cell, passage, or Pulse marker requires at least 5 contributors. The UI
shows only Quiet, Glowing, or Bright density bands, never exact counts, and
publishes an update only after a batch includes at least 10 new contributors.

**Retention decision — resolved:** The Run Action Log exists only in request
memory for replay and aggregation and never enters storage, logs, or analytics.
Only aggregate counters and a route-free contribution receipt persist. The
receipt participates in export and account deletion. The Constellation is
public only for the current UTC Daily; all new aggregate and receipt data
hard-deletes 48 hours after expiry, with no historical archive.

**Contract:**

- visible only after a Daily escape to avoid spoilers;
- accepts only the first verified escape from each signed-in Explorer and Daily
  identifier;
- aggregate route density and Pulse-use areas, never raw individual trails;
- 20-contributor publication, 5-contributor cell, and 10-new-contributor batch
  thresholds apply under ADR 0033;
- no username, identity, exact answer, elapsed time, or raw action log;
- raw verified logs are not retained for this feature;
- aggregate and route-free receipt data expires 48 hours after its Daily;
- later verified escapes cannot replace or subtract an earlier contribution;
- no streak, scarce cosmetic, Quest effect, or ranking bonus.

**Required privacy validation before implementation:**

1. prove aggregate usefulness from synthetic verified logs;
2. threat-model reconstruction and small-cohort leakage;
3. prove request-memory-only route handling and 48-hour aggregate deletion;
4. estimate serverless and database cost;
5. confirm migration 0018 is live before claiming production availability.

**Safety condition:** Any aggregation that permits raw or individually
reconstructable routes must be revised until the committed feature uses only
privacy-preserving aggregates.

### 9.13 P3 committed — Offline Run Continuity

**Terminology decision — resolved:** The development term is **Offline Run
Continuity** and the player action is **Continue Offline**. “Pocket Expedition”
is not used because it implies a separate downloadable game or permission to
admit new Runs offline.

**Practice decision — resolved:** While online, the Explorer may preselect one
eligible learning objective whose exact fixed Lantern Trail is cached: three
required Questions plus two optional. It remains unscored and current-tab-only.
Offline play cannot adapt, generate, replace, or select another Practice
Question; choosing a different Trail requires reconnecting.

**Admission decision — resolved:** Successful online admission for an eligible
Guest or Personal Run may issue a server-signed Offline Continuity Receipt. It
is device-bound and scoped to the exact Run ID, seed, Quest Level, Labyrinth,
ruleset revision, and immutable reviewed content-pack hash. It expires when the
Run becomes terminal or after seven days. The browser verifies it with a
bundled public key; the signing key never enters the client. Expiry preserves a
paused local recovery and requires reconnection rather than deleting progress.

**Class Play decision — resolved:** Classroom Run Grants never receive Offline
Continuity Receipts. Network loss preserves a Class Run only as paused local
recovery; play resumes after reconnecting and successfully rechecking both
authoritative Classroom Membership and assignment status. Guest and Personal
offline continuity remain available.

**Completion decision — resolved:** An offline Run records a bounded Run Action
Log version 2 with deterministic actions, exact Reviewed Question Revision IDs,
and selected option identifiers but no reviewed text. On reconnect, the server
validates the receipt and replays the Run. Only successful replay may update
Cloud Quest Progress, Lantern Journal outcomes, or shared score. The local Run
Record begins as Pending verification; a terminal rejection preserves it as
Offline—unverified without changing cloud/shared state. Transport retries use
one stable idempotency key. Verified Daily remains separate on Classic Rules
version 1.

**Receipt-window decision — resolved:** Offline play authority lasts at most
seven days and ends immediately at terminal state. A terminal receipt and
detailed action log remain submission-valid for up to 48 additional hours,
never beyond nine days from issue. Successful verification or terminal
rejection deletes the detailed log immediately. Missing the deadline keeps only
the outcome-only local Run Record marked Offline—unverified; selected option
identifiers and the full route never enter persistent Run Replay storage.

**Update decision — resolved:** Each receipt pins a versioned app shell,
ruleset, reviewed Run pack, and selected Lantern Trail. A service worker may
stage but cannot activate a newer version or evict pinned assets during a
non-terminal Run. Activation may occur after terminal state and durable pending
verification storage. Reconnection never silently migrates an active Run; a
server security block pauses it and preserves recovery. New receipts always use
the newest accepted version.

**Practice-sync decision — resolved:** Offline Lantern Trail feedback is
immediate, but only coarse Question-revision outcomes—correct, incorrect, Hint,
or Skip—remain in current-tab memory. Selected option identifiers and reviewed
text are never queued. Reconnecting in that tab syncs the events idempotently to
the Lantern Journal. Closing or refreshing first discards unfinished position
and unsynced events. Practice never affects Quest, score, Run Record, or shared
state.

**Shared-device decision — resolved:** Signing out deletes that Explorer's
receipts, reviewed packs, Active Run Recovery, pending action logs, and
device-local Run Replay data. A clear warning appears if an unverified offline
result will be lost. Account deletion performs the same local cleanup. Only
public shell, font, and non-account assets may remain, and another account can
never reuse or inspect the prior Explorer's offline state.

**Player outcome:** An already-admitted Run and reviewed Practice remain usable
during poor school Wi-Fi.

**Required technical validation:**

- prove which shell, fonts, artwork, and reviewed cards can be safely cached;
- prove a service-worker update cannot mix rule versions;
- prove active local recovery remains exact across a staged update;
- prove every queued boundary write is idempotent; and
- prove the signed receipt preserves server-authoritative Run admission.

**Hard boundaries:**

- offline may resume only the exact previously authorized Run ID;
- the server-signed, device-bound receipt in ADR 0034 is the sole offline
  admission authority;
- offline Practice is limited to one preselected immutable five-Question
  Lantern Trail;
- offline Practice outcomes follow the current-tab-only synchronization rule
  and never create a durable answer queue;
- every distinct Run ID still requires online server authorization;
- cloud Quest, Journal, and shared-score writes require successful ADR 0035
  replay;
- no offline payment or entitlement inference;
- no offline Class Play or cached assumption of Membership authority;
- no stale verified Daily submission after UTC expiry;
- no silent cache of account or Classroom private responses.
- no account-scoped receipt, pack, recovery, pending log, or Run Replay data
  survives sign-out;
- no service-worker activation or pinned-asset eviction during a non-terminal
  offline Run.

**Release gate:** Offline Run Continuity remains committed, but it cannot ship
until update rollback, cache privacy, receipt, replay, and access-admission
tests are green. A failed design is revised until those gates pass.

### 9.14 P1 committed — Trail Twists

**Player outcome:** Each Region creates one readable movement decision while
the universal Quest rules remain recognizable.

Trail Twists is the only gameplay layer inside Living Regions. Region Theme
modules remain presentation-only; no second regional-rule system is permitted.
Shipping a Region Theme alone does not silently authorize an unspecified
mechanic—the corresponding Twist still needs the contract below.

**Assignment decision — resolved:** Exactly one fixed, authored Trail Twist
belongs to each Atlas Region. It remains consistent across that Region's four
Labyrinths, may increase in complexity toward the Gate Warden, and never rotates
randomly or through player selection.

**Introduction decision — resolved:** Trail Twists begin in the first normal
Quest. First Light teaches only universal rules; Region 1 introduces the
simplest Twist at Labyrinth 1. Legacy Records and shared links without a
ruleset revision retain Classic Rules.

**Accepted Twist mechanics:**

1. **Region 1 — Echo Hush:** When an Explorer action collects an Echo, ordinary
   Wardens skip their movement step for that action only. Normal Warden movement
   returns on the next action. The Twist does not change Questions, Vitality,
   Pulses, score, or Gate Warden Challenge rules.
2. **Region 2 — Windways:** A small deterministic set of visibly directional
   passage tiles carries the Explorer one additional legal tile. The destination
   is visible before entry, the travel counts as one action, Wardens move once
   after it finishes, Windways never chain, and their source tiles never overlap
   the start, Gate, Echoes, or initial Wardens.
3. **Region 3 — Echo Bridges:** Each Echo is paired deterministically with one
   visible sealed shortcut. Collecting that Echo permanently opens its Bridge
   for Explorer and Warden pathfinding. Bridges only add edges to an
   independently solvable base Labyrinth; they never close or remove its paths.
4. **Region 4 — Tide Doors:** Deterministic optional shortcut edges alternate
   between open and sealed. A successful movement or Pulse action resolves the
   Explorer and Wardens against one shared visible phase, then toggles the Doors
   for the next action. Questions, Hints, pauses, and blocked inputs do not
   advance them, and the base Labyrinth stays connected with every Door sealed.
5. **Region 5 — Warden Bells:** A small deterministic set of one-use Signal
   Bells exposes **Ring Bell** while the Explorer is adjacent. Ringing spends
   one action and Move; ordinary Wardens enter a visible one-action Lured state
   and move one step toward that Bell, which then becomes spent. Normal modes
   return next action; hidden positions and Gate Wardens remain unaffected.

**Daily compatibility decision — resolved:** Verified Daily remains Classic
Rules under Run Action Log version 1. Trail Twists do not enter the competitive
Daily contract; any future Daily Twist support requires an explicit replay
protocol version and separate compatibility decision.

**Shared-score decision — resolved:** Every new Score Entry carries its exact
Atlas Region and ruleset revision. Rankings, best-entry replacement, and Global
Max Score compare only within that exact composite `(Atlas Region, ruleset
revision)` partition. The board defaults to the current Run's Region and rules;
legacy entries remain available under Classic Rules and are never deleted or
silently reclassified. Verified Daily remains separate.

**Required validation contract:**

1. paper-prototype each accepted Twist and document its exact meaningful choice;
2. implement the accepted ADR 0026 mechanics without adding a second regional
   rule system;
3. add an explicit rule/config version to active locators, same-device
   recovery, Run Records, share URLs, and any applicable server replay contract;
4. prove compatibility decisions for normal Runs, Gate Wardens, Daily,
   verified replay, old Records, and old share links;
5. preserve Question, Hint, Skip, Vitality, score, and membership rules.

**Revision condition:** If an accepted Twist is only decoration, makes Warden
behavior less readable, cannot preserve deterministic replay, or adds more
instruction cost than meaningful choice, revise that mechanic until it passes
without canceling the Region or its committed Trail Twist.

## 10. Development milestone sequence

This roadmap uses **milestone**, the normal game-development term for an
internal group of work with a review gate. A milestone is not automatically a
public release.

**Preproduction** means design, prototyping, and technical validation before
production feature code begins.

```text
Truth and delivery headroom
  |
  +-- First Light Tutorial
  |
  +-- Active Run Recovery
        |
        +-- Run Replay
        |
        +-- Offline Run Continuity

Echo Atlas
  |
  +-- Living Regions
        |
        +-- Five accepted Trail Twists (ADR 0026)

Echo Lens and Lantern Trails

Learning Decks
  |
  +-- Class Expeditions

Access Settings
  |
  +-- Trail Compass
  |
  +-- Question Narration

Verified Daily + live migration 0018 + privacy validation
  |
  +-- Daily Trail Constellation
```

### Milestone 1 — Onboarding and Run Recovery

**Player-facing features:**

- First Light Tutorial
- Active Run Recovery

**Development prerequisite, not a player feature:**

- Truth and delivery headroom

**Checkpoint:**

- local gate green;
- first-run moderated playtest complete;
- First Light is tuned against the moderated playtest baseline;
- refresh recovery exact;
- no new bundle or function-budget debt;
- human review before Milestone 2.

### Milestone 2 — World Map and Run Memories

- Echo Atlas
- Run Replay
- all five Living Region Theme and Trail Twist pairs, delivered sequentially

**Checkpoint:**

- Atlas semantics and mobile layout proven;
- map-to-detail-to-play handoff works;
- existing Quest progress remains authoritative;
- Hallmark slop gate plus desktop/mobile screenshots pass;
- each accepted Twist preserves deterministic replay and universal gameplay
  invariants;
- prototype and playtest evidence tunes each Region pair but never decides
  whether that committed pair exists.

### Milestone 3 — Learning and Content Variety

- Echo Lens and Lantern Trails
- Learning Decks

**Checkpoint:**

- launched explanations have 100% review coverage;
- no exact answer history is added;
- all three focused launch Decks prove the computed legal Question demand at
  every Quest Level and Region, including all five deck-matched Capstones and
  the announced Mixed fallback;
- Workshop remains unscored and side-effect-free.

### Milestone 4 — Classroom and Accessibility

- Class Expeditions
- Trail Compass
- Question Narration

**Checkpoint:**

- direct forced-RLS tests pass;
- Teacher view remains aggregate-only;
- Classroom Run Grants, four-Run Region scope, 30 non-recyclable seats, and
  five-seat extensions pass authorization and capacity tests;
- Membership removal fail-closes Class Play while explicit assignment closure
  remains graceful and reversible;
- the documented cost model and complete Stripe test-mode flow pass before a
  price is proposed; live billing remains separately unauthorized;
- nonvisual features reveal no hidden state;
- manual assistive-technology review is recorded.

### Milestone 5 — Shared Wonder and Offline Resilience

- Daily Trail Constellation
- Offline Run Continuity

**Checkpoint:**

- Constellation thresholds, batching, request-memory-only aggregation, and
  48-hour deletion pass privacy and reconstruction tests;
- Offline Continuity Receipts, Run Action Log version 2 replay, dual expiry,
  sign-out cleanup, and pinned-asset update behavior pass;
- no Class Run can start or continue offline;
- failed privacy or offline designs are revised until compliant rather than
  used to cancel either committed feature.

### Cross-milestone validation tracks

Moderated playtests, privacy threat models, content audits, paper prototypes,
cost models, and technical spikes are preproduction evidence for committed
features. They may tune mechanics, sequence, and release slices. They do not
create an R&D-only escape hatch or cancel a named production promise.

## 11. Verification contract for every approved feature

Each feature must follow the repository's default engineering workflow after
approval:

1. run `grill-with-docs` to align the feature, update `CONTEXT.md`, and
   add/supersede ADRs only where the domain or a locked decision changes;
2. run `to-spec` to publish the agreed feature spec in GitHub Issues;
3. run `to-tickets` to create vertically sliced tickets with dependency edges;
4. run `implement` test-first, one ticket at a time;
5. keep each slice independently green;
6. run:

   ```powershell
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   npm run check:bundle
   ```

7. for browser-facing work, run desktop and mobile gameplay checks, keyboard,
   reduced motion, 200-percent text, and the locked design-system review;
8. run local Standards and Spec review;
9. use one draft PR for a related feature batch, then complete mandatory
   CodeRabbit review and resolve findings before merge;
10. merge only after every required gate is green.

Feature-specific tests must trace to its acceptance gates. Existing global
tests do not replace new acceptance evidence.

## 12. Explicit non-goals

This roadmap does not propose:

- free-form AI Questions, explanations, stories, or child chat;
- Teacher-authored unreviewed Questions;
- hidden adaptive grading, diagnosis, or permanent answer history;
- subscriptions, battle passes, streak loss, loot boxes, scarce paid cosmetics,
  coupons, tiers, or paid gameplay power;
- extra Vitality, easier Wardens, extra Hints, or cheaper Skips for members;
- public child profiles, chat, real-time multiplayer, or individual public
  Classroom ranking;
- mid-Run cloud synchronization;
- public raw action logs;
- Challenge Cards, public route sharing, or Daily ghost comparison;
- a second deterministic game engine;
- high-stakes casual Global Scoreboard claims;
- copying WebGemma artwork, layout code, gradients, branding, or mobile shell;
- live Stripe activation, real charges, enforcement changes, or production
  migration application without explicit separate authorization.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Atlas spectacle buries gameplay | High | Play stays default; Atlas assets lazy; one-click Continue Quest |
| More systems increase first-run overload | High | First Light first; three primary destinations; progressive disclosure |
| Main orchestrator becomes harder to change | High | Extract only feature-specific controller seams; no broad rewrite |
| Bundle budgets are exceeded | High | Lazy chunks, asset budgets, no budget increase as workaround |
| New learning content is wrong or misleading | High | Reviewed primitive schema, admin preview, publish blocker |
| Practice becomes diagnosis | High | Coarse suggestions, learner choice, no labels or inferred ability claims |
| Resume duplicates side effects | High | Canonical replay, idempotency, boundary-write tests |
| Visual replay leaks answers or identity | High | Local-only default, no answer text, sanitized export contract |
| Learning Deck runs out of focused cards | High | Announced Mixed fallback plus pre-publish coverage proof |
| Class Expedition leaks across tenants | Critical | Forced-RLS schema plus direct PostgreSQL isolation tests |
| Constellation enables route reconstruction | Critical | Thresholds, request-memory-only aggregation, deletion proof, and revision until safe |
| Narration misreads math/science | Medium | Reviewed pronunciation metadata and manual browser acceptance |
| Offline mode bypasses Run Access | Critical | Signed exact-Run receipt, server replay, bounded expiry, and no Class offline |
| Visual novelty resembles generic AI design | Medium | Locked tokens, original field-guide art, one signature element, slop review |

## 14. Approval gate

No implementation, issue creation, branch creation, migration, deployment,
production setting, billing action, or external service mutation is authorized
by this document.

Recommended first implementation authorization is **Milestone 1 only**,
followed by its human checkpoint.

Player-facing features:

- First Light Tutorial
- Active Run Recovery

Development prerequisite:

- Truth and delivery headroom

**Echo Atlas Preproduction** can run in parallel after Milestone 1 begins. This
means design, prototyping, accessibility planning, and technical validation
only. Echo Atlas production implementation still needs a later, explicit
authorization after its design direction and mobile interaction contract are
reviewed.

Possible implementation authorizations after product convergence:

- `Approve Milestone 1 implementation`
- `Approve Milestone 1 implementation + Echo Atlas preproduction`
- `Keep implementation paused; revise the roadmap: ...`

Confirming that this document matches the intended product freezes the plan; it
does not select any of these implementation authorizations.
