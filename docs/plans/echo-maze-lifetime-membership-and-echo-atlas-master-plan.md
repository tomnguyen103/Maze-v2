# Echo Maze Complete Product Plan

## Lifetime Membership + Echo Atlas and Gate Wardens

**Planning status at authorship:** Proposed - awaiting explicit implementation
approval

**Implementation status (2026-07-26):** Engineering implementation is complete
through merged PRs #49-#55. Release-closure PR #56 adds the integrated landing
and validation evidence and remains pending mandatory review and merge; that
merge is still required for remote-main proof. Access, lifetime membership,
Atlas, Warden, continuity, settings, Daily, and Journal behavior is exercised by
the matching `tests/*.test.js`,
`tests/e2e/*.spec.js`, and live PostgreSQL store suites indexed in
[`implementation-coverage.md`](implementation-coverage.md).

**Document version:** 1.0

**Date:** 2026-07-25

**Reviewed commit:** `85c485f` on `main`

**Document scope at authorship:** Documentation only

**Implementation authorization:** Not granted by this document

## 1. Executive Decision

Echo Maze should combine two complementary changes into one product program:

1. a transparent lifetime-access path that gives the game a sustainable
   commercial boundary;
2. Echo Atlas + Gate Wardens, which makes the twenty-Labyrinth Quest feel like
   one memorable expedition.

The complete player promise is:

> Play one Guest demo Run. Create a free Explorer account for three more Runs.
> Then unlock unlimited Runs forever for $5.99 once. Restore the Echo Atlas by
> crossing twenty unique Labyrinths and defeating a Gate Warden at every fourth
> milestone.

The purchase never makes combat easier. Free and paid players use identical
Warden, Question, score, Vitality, Pulse, Hint, and Skip rules. Payment only
unlocks additional Run starts after the free allowance is exhausted.

### 1.1 Recommended delivery decision

Develop the work as two isolated systems, then launch them together:

- **Access system:** Guest demo, account gate, three signed-in Runs, one-time
  payment, permanent entitlement.
- **Quest system:** Echo Atlas, milestone classification, Gate Warden rules,
  accessible milestone presentation.

The access system should remain unenforced in production until the Quest
feature and purchase messaging are ready for the same public release. This
avoids charging players before the deeper Quest value is visible.

### 1.2 Commercial decision

- Product: `Echo Maze Lifetime Membership`
- Price: `$5.99 USD`
- Charge: one time
- Renewal: none
- Subscription: none
- Duration: lifetime access for the purchasing Clerk account
- Payment page: Stripe-hosted Checkout
- Identity: Clerk
- Entitlement authority: PostgreSQL

Clerk Billing is not used because it supports recurring Subscriptions rather
than a true one-time lifetime purchase. Clerk remains responsible for account
creation, sign-in, and authenticated user identity.

## 2. Player-Facing Announcement

> **A Quest worth remembering**
>
> Echo Maze now charts every journey on the Echo Atlas. Cross five regions,
> recover every Echo, and face a Gate Warden at Labyrinths 4, 8, 12, 16, and
> 20. Every Warden still follows the rule Explorers know: one correct answer
> wins; a wrong answer costs Vitality and brings a fresh Question.
>
> Try one Run as a Guest, then create a free account for three more Runs. Keep
> exploring forever with one $5.99 lifetime purchase. No subscription. No
> renewal. No paid gameplay advantage.

This is proposed launch copy, not a claim that the feature has shipped.

## 3. Why These Features Belong Together

### 3.1 Membership alone creates a value problem

The current game can require an account after one Guest Run, but signed-in
Quest Progress remains local and the twenty-Labyrinth journey has little
visible cumulative structure. Charging for additional Runs without improving
the long-term journey risks making the gate feel stronger than the value.

### 3.2 Echo Atlas alone leaves sustainability unanswered

Echo Atlas and Gate Wardens give the Quest a stronger beginning, middle, and
end, but they do not define how continued play supports the product.

### 3.3 The combined loop is coherent

```text
Try the core game
      |
      v
Understand the Warden rule
      |
      v
See a twenty-Labyrinth Atlas
      |
      v
Invest in a named Explorer account
      |
      v
Use three signed-in free Runs
      |
      v
Decide whether to unlock unlimited attempts
      |
      v
Restore five Atlas regions and complete the Quest
```

The Atlas makes the destination visible. Lifetime access removes the attempt
limit. Neither changes the knowledge-based core mechanic.

### 3.4 Important free-path truth

If a player escapes every free Run:

```text
Guest demo Run       -> Labyrinth 1
Signed-in free Run 1 -> Labyrinth 2
Signed-in free Run 2 -> Labyrinth 3
Signed-in free Run 3 -> Labyrinth 4, first Gate Warden
```

This creates a strong best-case first-session arc: the final free Run reaches
the first Atlas milestone.

It is not guaranteed. Defeats and retries also consume Runs, so some players
will reach the lifetime gate before Labyrinth 4. The UI must explain the
allowance before each start and must never imply that a defeat caused the
purchase requirement.

## 4. Review Basis

This plan combines the earlier deep product review, live browser review,
lifetime-access design, and current repository architecture.

### 4.1 Current product evidence

- The central loop is already distinctive: explore Fog, recover Echoes, read
  Warden modes, answer reviewed Questions, and reach the Gate.
- A correct answer defeats a Warden.
- A wrong answer costs Vitality and produces a fresh Question.
- Hint is free for the current Question.
- The first Question Skip is free per Labyrinth; later Skips cost Vitality.
- A Quest contains twenty unique deterministic Labyrinths.
- Questions remain unique across the Quest.
- Difficulty grows through five four-Labyrinth bands.
- Clerk already provides account creation and sign-in.
- Profiles and escaped scores already use PostgreSQL.
- Quest Progress and Run Records remain browser-local.
- One Guest demo Run and the post-demo account gate already exist.

### 4.2 Current technical evidence

- `src/main.js` is the browser orchestrator.
- Pure game rules live under `src/game/`.
- Quest Level and difficulty configuration live under `src/questions/`.
- Clerk browser behavior lives under `src/player/`.
- Authenticated Player APIs and PostgreSQL storage live under `server/`.
- Local Express, Vite development, Vite preview, and Vercel reuse small route
  handlers.
- Existing score submissions already use an idempotency key.
- Current signed-in access is unlimited and must be deliberately superseded.

### 4.3 Validation baseline

The review baseline passed `npm run check:full`:

- ESLint passed;
- TypeScript JavaScript checking passed;
- 15 Vitest files and 113 tests passed;
- production build passed;
- 55 Playwright tests passed;
- 3 Playwright tests were intentionally skipped.

No application validation is claimed for the proposed features because this
document does not implement them.

## 5. Design Pillars

Every future implementation decision must satisfy these pillars.

### Pillar 1 - Knowledge wins

Questions remain part of combat, not a detached quiz or payment mechanism.

### Pillar 2 - Payment buys access, not power

Lifetime members receive unlimited Run starts. They do not receive:

- easier Questions;
- bonus Vitality;
- bonus score;
- extra Pulses;
- stronger Hints;
- free paid Skips;
- exclusive combat outcomes.

### Pillar 3 - A Quest feels cumulative

The Atlas must make completed, current, upcoming, and milestone Labyrinths
legible without creating a second source of Quest Progress.

### Pillar 4 - Child-friendly trust

Price, renewal behavior, free allowance, defeat behavior, and device-local
progress must be stated plainly. No false urgency, countdown discount, hidden
renewal, or manipulative loss framing is allowed.

### Pillar 5 - Determinism remains isolated

Identity, payment, network state, and the Atlas UI must never change seeded maze
generation, movement, Warden rules, Question selection rules, or scoring.

## 6. Non-Negotiable Contracts

### 6.1 Gameplay invariants

- [ ] One correct answer defeats the active Warden.
- [ ] One wrong answer costs exactly the configured Vitality and provides a
      fresh eligible Question.
- [ ] Every child-facing Question comes from the reviewed safe deck or a
      validated provider response matching a reviewed card.
- [ ] No Question ID repeats within one twenty-Labyrinth Quest.
- [ ] No map fingerprint repeats within one Quest.
- [ ] Difficulty increases across the existing five bands.
- [ ] Hint remains free for the active Question.
- [ ] The first Skip remains free per Labyrinth.
- [ ] Later Skips retain the current Vitality cost.
- [ ] Score and Warden-count ceilings remain stable unless separately
      approved.

### 6.2 Access invariants

- [ ] One Guest demo Run is available without an account.
- [ ] Guest escape and defeat both end the Guest allowance.
- [ ] Account creation unlocks exactly three signed-in free Run starts.
- [ ] Signed-in free Runs are counted server-side.
- [ ] Reloading the same authorized `runId` consumes nothing more.
- [ ] The next distinct Run after the free allowance requires lifetime access.
- [ ] `$5.99 USD` is charged once.
- [ ] No Subscription or recurring Price is created.
- [ ] A verified purchase permanently follows the purchasing Clerk account.
- [ ] An active Run may finish when access state changes.

### 6.3 Atlas invariants

- [ ] The Atlas contains five regions and twenty Labyrinth nodes.
- [ ] Gate Wardens appear at Labyrinths 4, 8, 12, 16, and 20.
- [ ] Atlas state is derived from existing Quest Progress.
- [ ] Atlas state never mutates Quest Progress.
- [ ] Gate Wardens reuse current Warden Question, feedback, Hint, and Skip
      rules.
- [ ] Atlas rewards are cosmetic and derived.

## 7. Complete Player Journey

### 7.1 First visit

1. Landing page explains the core game without leading with payment.
2. Player enters as Guest.
3. Guest starts one deterministic Run.
4. The Run may survive browser reload.
5. Escape or defeat ends the Guest allowance.
6. Result dialog explains that a free account unlocks three more Runs.

### 7.2 Account conversion

1. Player selects `Create free account` or `Sign in`.
2. Clerk handles authentication.
3. A new account may choose its Explorer Profile.
4. Access status shows `3 free Runs ready`.
5. The Atlas shows the current Quest position.

Lifetime access must not depend on optional public profile creation.

### 7.3 Signed-in allowance

Before each new signed-in Run:

1. client creates or restores a stable `runId`;
2. server checks existing grant;
3. server checks lifetime status;
4. otherwise server atomically consumes one of three free Run slots;
5. client begins only after receiving a grant.

Suggested messages:

- `This uses free Run 1 of 3.`
- `2 free Runs remain after this start.`
- `Last free Run.`

### 7.4 Atlas journey

The Atlas displays:

- Region 1: Labyrinths 1-4
- Region 2: Labyrinths 5-8
- Region 3: Labyrinths 9-12
- Region 4: Labyrinths 13-16
- Region 5: Labyrinths 17-20

Each node is one of:

- completed;
- current;
- ahead;
- milestone;
- completed milestone.

### 7.5 Gate Warden moment

At Labyrinth 4, 8, 12, 16, or 20:

1. one configured Warden is designated as the Gate Warden;
2. all Echoes must be recovered;
3. the Gate becomes open but sealed;
4. Gate entry opens a normal Warden Challenge;
5. one correct answer defeats the Gate Warden;
6. a wrong answer costs Vitality and loads a fresh unique Question;
7. defeat follows the current Run defeat contract;
8. victory opens the Gate and completes the Atlas milestone.

No health bar, multi-answer boss phase, special paid option, or second combat
system is added.

### 7.6 Lifetime purchase

When the free allowance is exhausted:

1. the player may finish any already authorized Run;
2. every attempt to start a distinct new Run opens the lifetime gate;
3. the gate states `$5.99 once`, `no subscription`, and `no renewal`;
4. a parent/grown-up assistance message appears;
5. the player may leave without losing local Quest Progress;
6. purchase opens Stripe-hosted Checkout;
7. return state says `Verifying purchase...`;
8. the server verifies payment directly with Stripe;
9. lifetime access becomes active;
10. the exact blocked Run action resumes.

### 7.7 Returning lifetime member

1. Clerk sign-in identifies the account.
2. Server returns permanent lifetime access from PostgreSQL.
3. No Stripe call is required for normal Run starts.
4. The player may start unlimited Runs.
5. The Atlas resumes from browser-local Quest Progress.

Until Cloud Quest Continuity ships, the account restores access but not the
browser-local Quest on a new device.

## 8. Feature Specification A - Lifetime Membership

### 8.1 Purpose

Create a simple, honest access boundary after meaningful free play.

### 8.2 Product terms

| Term | Contract |
|---|---|
| Price | $5.99 USD |
| Frequency | Once |
| Renewal | Never |
| Access duration | Lifetime of the purchasing Clerk account |
| Refund effect | Full refund revokes future Run starts |
| Dispute effect | New Run starts suspended while dispute is open |
| Transfer | No automatic transfer between Clerk accounts |
| Card storage | Not requested by Echo Maze |

### 8.3 Run-count policy

The Guest demo is completion-counted because no identity exists.

Signed-in free Runs are start-counted because completion-only counting can be
bypassed through abandonment. A stable `runId` makes reload and network retry
idempotent.

### 8.4 Access states

```text
guest_demo_available
account_required
signed_in_free
lifetime_purchase_required
checkout_pending
lifetime_active
lifetime_refunded
lifetime_disputed
payment_verification_unavailable
```

The app exposes normalized states, not raw Stripe object statuses.

### 8.5 Payment provider boundary

Clerk:

- account creation;
- sign-in;
- session authentication;
- authenticated user ID.

Stripe:

- one-time Product and Price;
- hosted card entry;
- required payment authentication;
- Checkout Session;
- PaymentIntent;
- refunds and disputes;
- signed payment webhooks.

PostgreSQL:

- free Run count;
- Run grant ledger;
- purchase attempt;
- permanent entitlement;
- webhook replay record.

### 8.6 Purchase verification

The browser must never choose:

- price;
- amount;
- currency;
- quantity;
- product;
- success origin;
- account identity.

Authenticated server route creates Checkout with:

- `mode: "payment"`;
- configured one-time Price ID;
- quantity one;
- `$5.99 USD`;
- internal purchase ID;
- authenticated Clerk user ID;
- fixed success and cancel URLs.

On return, the server retrieves the Checkout Session and verifies:

- purchase owner;
- Session identity;
- payment mode;
- paid status;
- Price ID;
- quantity;
- amount `599`;
- currency `usd`;
- unique PaymentIntent;
- refund state.

The success URL alone grants nothing.

### 8.7 Refund and dispute policy

Recommended MVP:

- only full refunds;
- full refund revokes new Run starts;
- active Run may finish;
- open dispute suspends new starts;
- resolved dispute in the product's favor restores access;
- support may manually investigate mistaken linkage;
- account transfers require receipt-based human review.

These rules require published support and refund language before live payment.

## 9. Feature Specification B - Echo Atlas

### 9.1 Purpose

Turn `Labyrinth N of 20` into a visible expedition with anticipation,
milestones, and completion memory.

### 9.2 Player fantasy

> I am restoring a lost map, crossing five regions, and proving what I learned
> at each threshold.

### 9.3 Inputs

- Quest Level
- current Labyrinth Number
- completed Labyrinth count
- Quest completion state
- existing Difficulty Band configuration

### 9.4 Output

A pure projection of:

- five Atlas regions;
- twenty node states;
- five milestone states;
- current and next destination;
- completed cosmetic sigils.

### 9.5 Storage decision

Do not add Atlas storage in the MVP.

The Atlas is derived from `QuestProgress`. This avoids:

- duplicate progress sources;
- migration risk;
- conflicting completion state;
- network dependency;
- payment coupling.

### 9.6 Interface contract

- Twenty nodes remain legible at desktop and mobile sizes.
- Regions have text labels.
- State is not communicated by color alone.
- Milestones have a distinct symbol and accessible name.
- Current node is keyboard and screen-reader discoverable.
- Opening the Atlas pauses gameplay time.
- Closing returns focus to its trigger.
- Reduced-motion users receive no required animated transition.
- 200-percent text does not hide actions or create horizontal overflow.

### 9.7 Cosmetic milestone reward

Each defeated Gate Warden restores one derived Atlas sigil.

Sigils:

- do not enter an inventory;
- are not currency;
- cannot be bought;
- cannot change combat;
- are recreated from Quest Progress;
- disappear only when the player intentionally starts a new Quest.

## 10. Feature Specification C - Gate Wardens

### 10.1 Purpose

Give every Difficulty Band a clear climax without inventing a new combat
grammar.

### 10.2 Milestones

| Labyrinth | Region | Role |
|---:|---:|---|
| 4 | 1 | First threshold |
| 8 | 2 | Developing mastery |
| 12 | 3 | Mid-Quest proof |
| 16 | 4 | Advanced threshold |
| 20 | 5 | Final Gate Warden |

### 10.3 Rule contract

- Milestone classification is a pure function of Labyrinth Number.
- One existing configured Warden is reserved as the Gate Warden.
- Total Warden count does not increase.
- Score ceiling does not increase.
- Gate Warden appears only after all Echoes are recovered.
- Gate entry triggers the Challenge.
- One correct answer defeats it.
- Wrong answer follows current Vitality and fresh-Question behavior.
- Hint and Skip behavior remain unchanged.
- Quest-wide Question uniqueness remains unchanged.
- Provider failure uses the existing safe bundled fallback.
- Timer remains paused for the complete Challenge.

### 10.4 Presentation contract

Players must distinguish:

- locked Gate;
- open but Gate-Warden-sealed Gate;
- open Gate.

Presentation may use:

- map mark;
- Gate treatment;
- legend label;
- live-region announcement;
- Challenge title;
- result milestone message.

Presentation must not rely on flashing, excessive motion, or color alone.

### 10.5 Failure cases

- Defeat before the Gate leaves the Gate Warden unresolved.
- Defeat during Gate Warden Challenge ends the Run normally.
- Refresh reconstructs the same milestone state.
- Provider failure does not remove the milestone.
- A shared seed reproduces the same milestone classification.
- Purchase state does not change Gate Warden rules.

## 11. Combined UX Contract

### 11.1 Landing

Lead with the game:

- hidden maze;
- Echo recovery;
- knowledge-based Wardens;
- twenty-Labyrinth Atlas.

Free and paid terms may appear in a clear secondary section. Do not make the
first screen resemble a pricing page.

### 11.2 Account gate

Required message:

> Your demo Run is complete. Create a free Explorer account to unlock three
> more Runs.

Actions:

- `Create free account`
- `Sign in`

### 11.3 Allowance messaging

Show before consumption:

> This starts free Run 2 of 3.

Show after results:

> One free Run remains.

Before the last free Run:

> Last free Run. Escape, defeat, or retry will use this Run once it starts.

Do not reveal the purchase gate only after a loss with no prior warning.

### 11.4 Lifetime gate

**Unlock every future Run**

**$5.99 once**

- Unlimited Runs for this Explorer account
- No subscription
- No renewal
- Same fair Warden rules for everyone

Supporting copy:

> Ask a parent or grown-up to help with this one-time purchase.

> Lifetime access follows your account. Quest Progress and Run Records still
> remain on this device.

Actions:

- `Unlock lifetime access - $5.99`
- `Not now`

### 11.5 Atlas at the gate

The purchase dialog may show the player's current Atlas position and remaining
regions, but it must not:

- animate fake loss;
- hide completed progress;
- claim progress will be deleted;
- create a countdown;
- call the price a temporary discount;
- imply the Warden defeated the player because they did not pay.

### 11.6 Purchase success

Required states:

- opening Checkout;
- returned and verifying;
- paid and unlocked;
- canceled without charge;
- payment failed;
- verification unavailable;
- already owned.

Success copy:

> Lifetime access unlocked. No renewal. Your next Run is ready.

## 12. System Architecture

### 12.1 Boundary map

```text
Clerk identity
      |
      v
Authenticated access API -----> PostgreSQL access + purchase tables
      |                                      ^
      |                                      |
      v                                      |
Browser access controller                    |
      |                                      |
      +---- stable runId --------------------+
      |
      +---- Stripe Checkout creation ----> Stripe-hosted payment
                                             |
                                             +---- verified webhook
                                             |
                                             +---- direct return verification

QuestProgress ---> pure Atlas projection ---> Atlas view
       |
       +-- Labyrinth Number ---> milestone classifier
                                      |
                                      v
                              pure Gate Warden rules
                                      |
                                      v
                              existing Question pipeline
```

### 12.2 Coupling rules

- Access code may decide whether a new Run can start.
- Access code may not alter the Run after authorization.
- Atlas code may read Quest Progress.
- Atlas code may not write Quest Progress.
- Gate Warden rules may use Labyrinth Number and existing game state.
- Gate Warden rules may not read identity or purchase state.
- Payment code may write entitlement.
- Payment code may not call game transition functions.
- `src/main.js` coordinates narrow controllers; it does not become the storage
  or payment implementation.

### 12.3 Proposed server modules

Future implementation may add:

- `server/access-store.js`
- `server/access-route.js`
- `server/payment-route.js`
- `server/stripe-webhook.js`
- small Vercel route wrappers under `api/`

Exact filenames may change during the approved architecture grill, but the
boundaries must remain separate.

### 12.4 Proposed client modules

Future implementation may add:

- `src/player/access-client.js`
- `src/player/access-controller.js`
- `src/player/lifetime-view.js`
- `src/game/quest-atlas.js`
- `src/game/quest-atlas-view.js`

The pure projection and access controller should be unit-testable without
canvas rendering or Clerk UI.

## 13. Data Contract

### 13.1 `player_access`

One row per Clerk user:

- Clerk user ID;
- free Runs started, constrained from zero to three;
- lifetime status;
- active purchase ID;
- lifetime activation timestamp;
- created and updated timestamps.

Lifetime status:

- `none`
- `active`
- `refunded`
- `disputed`

Do not require a Player Profile foreign key.

### 13.2 `run_access_grants`

Idempotency ledger:

- Clerk user ID;
- stable `runId`;
- grant source: `free` or `lifetime`;
- created timestamp;
- unique key on user ID plus `runId`.

### 13.3 `lifetime_purchases`

Purchase ledger:

- internal purchase ID;
- Clerk user ID;
- unique Stripe Checkout Session ID;
- unique Stripe PaymentIntent ID;
- configured Stripe Price ID;
- amount constrained to `599`;
- currency constrained to `usd`;
- status;
- paid, refunded, and dispute timestamps;
- created and updated timestamps.

Do not store:

- card number;
- CVC;
- full billing address;
- raw Stripe object;
- Clerk session token.

### 13.4 `stripe_webhook_events`

Replay ledger:

- unique Stripe event ID;
- event type;
- Stripe event creation time;
- processed time;
- normalized outcome.

### 13.5 Existing-account migration

- Existing Profile and score rows remain unchanged.
- Existing accounts lazily receive `free_runs_started = 0`.
- Every existing account therefore receives three signed-in free Runs at
  launch.
- Historical scores are not converted into Run usage.
- Existing Guest demo storage remains readable.
- Existing Quest Progress remains version-compatible.

## 14. API Contract

### 14.1 `GET /api/access`

Authenticated response:

```json
{
  "state": "free",
  "freeRunsRemaining": 2,
  "canStartRun": true,
  "lifetime": false
}
```

No raw Stripe object or payment method is returned.

### 14.2 `POST /api/run-access`

Request:

```json
{
  "runId": "opaque-stable-id"
}
```

Success:

```json
{
  "grant": {
    "runId": "opaque-stable-id",
    "source": "free"
  },
  "access": {
    "state": "free",
    "freeRunsRemaining": 1,
    "canStartRun": true
  }
}
```

Blocked:

```json
{
  "error": "Lifetime access is required to start another Run.",
  "code": "lifetime_purchase_required",
  "access": {
    "state": "lifetime_purchase_required",
    "freeRunsRemaining": 0,
    "canStartRun": false
  }
}
```

### 14.3 `POST /api/lifetime-checkout`

Authenticated, no commercial client fields.

Response:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "purchaseId": "opaque-id"
}
```

### 14.4 `POST /api/lifetime-confirm`

Authenticated request carries only the returned opaque Checkout Session ID.

The server retrieves and verifies Stripe state before returning:

```json
{
  "state": "lifetime_active",
  "lifetime": true,
  "canStartRun": true
}
```

### 14.5 `POST /api/stripe-webhook`

- no Clerk session required;
- raw request body required;
- Stripe signature required;
- duplicate event safe;
- no browser-readable response detail beyond success or rejection.

## 15. Payment Security and Reliability

### 15.1 Threat model

| Threat | Required control |
|---|---|
| Reset signed-in allowance through storage | PostgreSQL counter |
| Forge browser access state | Server authorization |
| Race two final free Runs | Atomic transaction |
| Replay Run request | Stable unique `runId` |
| Change price or amount | Server-owned Price ID and verification |
| Forge Clerk user ID | Derive from authenticated session |
| Reuse payment across accounts | Unique Session and PaymentIntent ownership |
| Forge success URL | Direct Stripe retrieval |
| Forge webhook | Raw-body signature verification |
| Replay webhook | Event ID ledger |
| Double-click purchase | Pending purchase reconciliation and idempotency |
| Leak secret | Server-only environment variables |
| Retain sensitive payment data | Store identifiers and normalized state only |

### 15.2 Failure contract

| Failure | Required result |
|---|---|
| Clerk unavailable before Guest demo | Guest demo remains available |
| Clerk unavailable after Guest demo | Account gate remains; progress preserved |
| Access API fails before new signed-in Run | No Run consumed; retry |
| Grant committed but response lost | Same `runId` returns same grant |
| Checkout creation times out | Reconcile before creating another |
| Checkout canceled | No entitlement change |
| Payment fails | No entitlement change |
| Paid browser never returns | Webhook activates access |
| Return arrives before webhook | Direct verification activates access |
| Stripe unavailable for unpaid account | Purchase retry; no access |
| Stripe unavailable for lifetime member | Existing lifetime access continues |
| Full refund | Finish active Run; gate next Run |
| Dispute opened | Finish active Run; suspend next Run |
| Funds restored | Lifetime access restored |

### 15.3 Raw-body requirement

Stripe signature verification requires the untouched request body. The webhook
handler must be mounted before any middleware that parses or transforms its
body. Local Express, Vite middleware, preview, and Vercel wrappers must all
exercise the same verified handler.

## 16. Accessibility and Child-Friendly Requirements

- Purchase action has an accessible name containing the exact price.
- `once`, `no subscription`, and `no renewal` are visible text.
- Parent/grown-up help copy is visible before Checkout.
- Purchase dialog traps focus and restores it to the trigger.
- `Not now` remains visible and keyboard reachable.
- The player may view the Atlas, Run Records, and completed progress without
  purchasing.
- Atlas status uses text and symbols, not color alone.
- Gate states have canvas-independent accessible descriptions.
- Warden Challenge remains un-timed while open.
- Reduced motion, large text, mobile touch, keyboard, and screen-reader paths
  are tested.
- Payment errors never expose raw provider messages to a child.
- No dark pattern links payment to shame, defeat, expiring progress, or false
  scarcity.

## 17. Prioritized Roadmap

| Order | Initiative | Priority | Owner role | Time horizon | Public release |
|---:|---|---|---|---|---|
| 0 | Platform trust and combined contracts | P0 | Product + Engineering | First | No |
| 1 | Trial ledger and lifetime payment foundation | P0 | Engineering | Now | Disabled |
| 2 | Echo Atlas projection and interface | P0 | Game + UI Engineering | Now | With combined launch |
| 3 | Gate Warden mechanic and presentation | P0 | Game Engineering | Now | With combined launch |
| 4 | Combined free-to-lifetime journey | P0 | Product + UI Engineering | Launch | Yes |
| 5 | Cloud Quest Continuity | P1 | Backend + Product | Next | Separate release |
| 6 | Lantern Journal + Practice | P1 | Game + Content | Next | Separate release |
| 7 | Explorer Access Settings | P2 | UI Engineering | Later | Separate release |
| 8 | Daily Shared Labyrinth | P3 | Game + Backend | Later | Separate release |

### 17.1 Priority rationale

- The payment boundary and game value ship together.
- Cloud Quest Continuity follows because lifetime access crosses devices while
  Quest Progress currently does not.
- Learning memory follows after the core Quest is visible and durable.
- Accessibility settings broaden comfort after the core journey is stable.
- Daily competition waits for a stronger fairness contract.

## 18. Future Implementation Plan

The tasks below describe future work only. This document does not authorize or
perform them.

### Phase 0 - Contract and safety

#### T1 - Add combined domain contracts

**Description:** Add separate ADRs for lifetime access and Atlas/Gate Warden
rules, then update the domain glossary.

**Acceptance criteria:**

- [ ] ADR 0007 supersedes signed-in-unlimited behavior from ADR 0006.
- [ ] ADR 0008 locks Atlas and Gate Warden invariants.
- [ ] `CONTEXT.md` distinguishes Run access, Quest Progress, Atlas projection,
      and payment state.

**Verification:**

- [ ] No application behavior changes in this task.
- [ ] Every term has one owner and one definition.
- [ ] Product owner approves the two contracts.

**Dependencies:** None

**Files likely touched:** `CONTEXT.md`, `docs/adr/0007-*.md`,
`docs/adr/0008-*.md`

**Estimated scope:** Medium, 3 files

#### T2 - Characterize shared start and milestone seams

**Description:** Add tests around every Run-start path and milestone
classification before modifying behavior.

**Acceptance criteria:**

- [ ] Continue, retry, new Quest, Run Record replay, direct link, and reload are
      represented.
- [ ] Labyrinths 4, 8, 12, 16, and 20 classify as milestones.
- [ ] All non-milestone Labyrinths classify normally.

**Verification:**

- [ ] Characterization tests pass against current behavior.
- [ ] New milestone expectations are observed red before implementation.
- [ ] `npm run lint`, `typecheck`, and focused tests pass.

**Dependencies:** T1

**Files likely touched:** `tests/demo-access.test.js`,
`tests/quest-levels.test.js`, `tests/e2e/game.spec.js`

**Estimated scope:** Medium, 3 files

### Checkpoint 0 - Contract ready

- [ ] Both ADRs approved.
- [ ] Existing behavior characterized.
- [ ] No production enforcement enabled.
- [ ] Repository local gate remains green.

### Phase 1 - Access foundation

#### T3 - Add access and purchase schema

**Description:** Add constrained tables for allowance, Run grants, lifetime
purchases, and Stripe event replay.

**Acceptance criteria:**

- [ ] Existing Profiles and scores migrate unchanged.
- [ ] New and existing accounts begin with three signed-in Runs.
- [ ] Session, PaymentIntent, amount, currency, and counter constraints reject
      invalid state.

**Verification:**

- [ ] Clean-database migration test passes.
- [ ] Current-fixture migration test passes.
- [ ] Rollback and reconciliation queries are documented.

**Dependencies:** T1

**Files likely touched:** `db/migrations/0002_*.sql`,
`tests/player-store.test.js`, one migration test fixture

**Estimated scope:** Medium, 3 files

#### T4 - Add atomic Run-grant store

**Description:** Implement idempotent free and lifetime Run authorization at
the storage boundary.

**Acceptance criteria:**

- [ ] Three unique free `runId` values succeed.
- [ ] A fourth is denied.
- [ ] Same `runId` returns the original grant.

**Verification:**

- [ ] Concurrent third/fourth request test grants exactly one final free Run.
- [ ] Lifetime grants do not increment the free counter.
- [ ] Failed transaction changes nothing.

**Dependencies:** T3

**Files likely touched:** `server/access-store.js`,
`tests/access-store.test.js`, `server/database.js`

**Estimated scope:** Medium, 3 files

#### T5 - Add authenticated access API

**Description:** Expose access status and Run authorization through the current
Clerk-authenticated server pattern.

**Acceptance criteria:**

- [ ] `GET /api/access` returns normalized state.
- [ ] `POST /api/run-access` validates a bounded opaque `runId`.
- [ ] Browser-supplied user identity is ignored.

**Verification:**

- [ ] Authentication, method, validation, and error-contract tests pass.
- [ ] Local Express, Vite, preview, and Vercel route tests pass.
- [ ] Public leaderboard behavior remains unchanged.

**Dependencies:** T4

**Files likely touched:** `server/access-route.js`, `server/player-api.js`,
`api/access.js`, `tests/access-route.test.js`

**Estimated scope:** Medium, 4 files

#### T6 - Add client access controller

**Description:** Add a focused client that requests status and grants while
keeping network logic out of the game engine.

**Acceptance criteria:**

- [ ] Stable `runId` persists across reload.
- [ ] Every signed-in new-Run path requests a grant.
- [ ] Guest demo behavior remains in `demo-access.js`.

**Verification:**

- [ ] Reload consumes no extra Run.
- [ ] Failed authorization never creates a playable Run.
- [ ] Existing active Run recovery remains green.

**Dependencies:** T5

**Files likely touched:** `src/player/access-client.js`,
`src/player/access-controller.js`, `src/game/active-run-locator.js`,
`tests/access-controller.test.js`

**Estimated scope:** Medium, 4 files

### Checkpoint 1 - Access foundation ready

- [ ] Exactly three signed-in Runs are enforced in tests.
- [ ] Enforcement remains disabled for public production.
- [ ] Existing Guest demo remains unchanged.
- [ ] Local gate passes.

### Phase 2 - One-time payment

#### T7 - Add Stripe Checkout creation

**Description:** Create a server-owned, one-time Stripe Checkout Session for
the authenticated Clerk account.

**Acceptance criteria:**

- [ ] Session uses `mode=payment`, configured Price, quantity one, and fixed
      origins.
- [ ] Browser cannot select commercial fields.
- [ ] Lifetime-active account cannot buy again.

**Verification:**

- [ ] Stripe test-mode Session contains `$5.99 USD` once.
- [ ] Repeated click tests do not create uncontrolled duplicate charges.
- [ ] No Stripe secret enters client output or logs.

**Dependencies:** T3

**Files likely touched:** `server/payment-route.js`,
`api/lifetime-checkout.js`, `tests/payment-route.test.js`, `package.json`,
`package-lock.json`

**Estimated scope:** Medium, 5 files

#### T8 - Add verified Stripe webhooks

**Description:** Fulfill, refund, and dispute purchases through a raw-body,
signature-verified handler.

**Acceptance criteria:**

- [ ] Valid paid event activates one account.
- [ ] Invalid signature changes nothing.
- [ ] Duplicate and reordered events are idempotent.

**Verification:**

- [ ] Stripe fixture tests cover paid, expired, failed, refunded, disputed, and
      restored states.
- [ ] Local and Vercel raw-body paths pass.
- [ ] Logs contain only allowlisted fields.

**Dependencies:** T3 and Stripe test configuration

**Files likely touched:** `server/stripe-webhook.js`,
`api/stripe-webhook.js`, `tests/stripe-webhook.test.js`

**Estimated scope:** Medium, 3 files

#### T9 - Add synchronous purchase confirmation

**Description:** Verify returned Checkout Sessions directly so paid players do
not wait for asynchronous webhook delivery.

**Acceptance criteria:**

- [ ] Owner, mode, paid status, Price, quantity, amount, and currency are
      verified.
- [ ] Return-first and webhook-first paths share one fulfillment operation.
- [ ] Forged and cross-account Sessions fail.

**Verification:**

- [ ] Paid Session unlocks exactly once.
- [ ] Unpaid and wrong-product Sessions do not unlock.
- [ ] Repeated confirmation is idempotent.

**Dependencies:** T7 and T8

**Files likely touched:** `server/payment-route.js`,
`api/lifetime-confirm.js`, `server/access-store.js`,
`tests/payment-confirm.test.js`

**Estimated scope:** Medium, 4 files

#### T10 - Add lifetime purchase UI

**Description:** Add allowance, purchase, verifying, success, and recovery
states without embedding card fields.

**Acceptance criteria:**

- [ ] Every payment surface says `$5.99 once`, `no subscription`, and `no
      renewal`.
- [ ] Parent/grown-up and device-local progress disclosures are visible.
- [ ] `Not now` preserves Quest state.

**Verification:**

- [ ] Keyboard, mobile, reduced-motion, and large-text checks pass.
- [ ] Stripe-hosted Checkout is the only card-entry surface.
- [ ] No false urgency or defeat-shaming copy is present.

**Dependencies:** T6, T7, and T9

**Files likely touched:** `index.html`, `src/player/lifetime-view.js`,
`src/daylight.css`, `src/main.js`, `tests/e2e/membership.spec.js`

**Estimated scope:** Medium, 5 files

### Checkpoint 2 - Payment path ready

- [ ] Test-mode purchase activates exactly one Clerk account.
- [ ] No Subscription exists.
- [ ] Refund and dispute behavior passes.
- [ ] Enforcement remains disabled publicly.
- [ ] Local gate and local review pass.

### Phase 3 - Echo Atlas

#### T11 - Add pure Atlas projection

**Description:** Derive five regions, twenty nodes, and milestone state from
existing Quest Progress.

**Acceptance criteria:**

- [ ] Completed, current, ahead, milestone, and completed-milestone states are
      correct.
- [ ] Version-1 Quest Progress remains readable.
- [ ] Projection never mutates input.

**Verification:**

- [ ] Fixtures cover Labyrinths 1, 4, 5, 20, and completed Quest.
- [ ] Determinism tests pass.
- [ ] Typecheck passes.

**Dependencies:** T2

**Files likely touched:** `src/game/quest-atlas.js`,
`tests/quest-atlas.test.js`

**Estimated scope:** Small, 2 files

#### T12 - Add accessible Atlas interface

**Description:** Render the pure Atlas state in an accessible desktop/mobile
view.

**Acceptance criteria:**

- [ ] Twenty nodes and five regions are legible.
- [ ] State is not color-only.
- [ ] Open, close, focus return, and timer pause work.

**Verification:**

- [ ] Keyboard and screen-reader labels pass.
- [ ] 390 by 844 mobile and 200-percent text have no hidden actions.
- [ ] Reduced-motion behavior passes.

**Dependencies:** T11

**Files likely touched:** `src/game/quest-atlas-view.js`, `index.html`,
`src/daylight.css`, `tests/e2e/atlas.spec.js`

**Estimated scope:** Medium, 4 files

### Phase 4 - Gate Wardens

#### T13 - Add pure milestone and Gate Warden rules

**Description:** Reserve one existing Warden as the Gate Warden at each
four-Labyrinth milestone.

**Acceptance criteria:**

- [ ] Milestones are exactly 4, 8, 12, 16, and 20.
- [ ] Gate seals only after Echo recovery conditions are met.
- [ ] Correct, wrong, defeat, and victory transitions match existing combat.

**Verification:**

- [ ] Fixed seeds reconstruct identical state.
- [ ] Non-milestone Runs remain behaviorally unchanged.
- [ ] Warden count and score ceiling remain stable.

**Dependencies:** T2

**Files likely touched:** `src/questions/quest-levels.js`,
`src/game/game-session.js`, `tests/quest-levels.test.js`,
`tests/game-session.test.js`

**Estimated scope:** Medium, 4 files

#### T14 - Reuse the Question pipeline

**Description:** Route Gate Warden Challenges through current safe Question,
Hint, Skip, feedback, uniqueness, and fallback behavior.

**Acceptance criteria:**

- [ ] Gate Warden uses band-matched unique Questions.
- [ ] Wrong answer loads a fresh eligible Question.
- [ ] Provider failure uses bundled safe content.

**Verification:**

- [ ] Quest-wide uniqueness tests pass.
- [ ] Forced provider failure completes the Challenge.
- [ ] Timer remains paused throughout.

**Dependencies:** T13

**Files likely touched:** `src/main.js`, `src/game/game-session.js`,
`tests/game-session.test.js`, `tests/question-service.test.js`

**Estimated scope:** Medium, 4 files

#### T15 - Add Gate Warden presentation

**Description:** Make milestone Gate states clear on canvas, in the legend, in
live announcements, and in results.

**Acceptance criteria:**

- [ ] Locked, sealed, and open Gate states are distinguishable.
- [ ] Milestone title and result connect to the Atlas.
- [ ] Presentation is accessible without color or motion.

**Verification:**

- [ ] Desktop and mobile milestone screenshots receive review.
- [ ] Reduced-motion and live-region checks pass.
- [ ] Regular Gate presentation remains unchanged.

**Dependencies:** T12-T14

**Files likely touched:** `src/game/canvas-renderer.js`,
`src/game/quest-atlas-view.js`, `src/daylight.css`, `src/main.js`,
`tests/e2e/atlas.spec.js`

**Estimated scope:** Medium, 5 files

### Checkpoint 3 - Quest feature ready

- [ ] Five milestones are represented in the Atlas.
- [ ] A milestone Run can be escaped and defeated.
- [ ] Every gameplay invariant remains green.
- [ ] Membership state has no effect on combat state.
- [ ] Local gate and visual review pass.

### Phase 5 - Combined launch

#### T16 - Integrate the free-to-Atlas journey

**Description:** Join the access controller, Atlas, results, and lifetime gate
at narrow orchestration points.

**Acceptance criteria:**

- [ ] Perfect free path can reach the Labyrinth 4 Gate Warden.
- [ ] Defeat paths show allowance before the next purchase gate.
- [ ] Verified purchase resumes the exact blocked action.

**Verification:**

- [ ] Guest-to-account-to-three-Runs journey passes.
- [ ] Atlas state survives canceled Checkout.
- [ ] Purchase state never changes deterministic Run output.

**Dependencies:** T10, T12, and T15

**Files likely touched:** `src/main.js`, `src/player/access-controller.js`,
`src/game/quest-atlas-view.js`, `tests/e2e/membership.spec.js`,
`tests/e2e/atlas.spec.js`

**Estimated scope:** Medium, 5 files

#### T17 - Add support, policy, and observability contract

**Description:** Prepare the minimum operational material required for a
one-time payment launch.

**Acceptance criteria:**

- [ ] Refund, dispute, account-deletion, recovery, privacy, and support language
      is approved.
- [ ] Structured events identify access and payment failures without sensitive
      data.
- [ ] Rollback disables enforcement without deleting purchases.

**Verification:**

- [ ] Support runbook handles receipt-based recovery.
- [ ] Logs contain no card data, secrets, raw webhook, or session token.
- [ ] Rollback drill preserves lifetime entitlements.

**Dependencies:** T8-T10

**Files likely touched:** `docs/`, server logging module, relevant tests

**Estimated scope:** Medium, 3-5 files plus external policy review

#### T18 - Complete browser and release proof

**Description:** Prove the combined experience before enforcement becomes
public.

**Acceptance criteria:**

- [ ] Guest, account, allowance, Gate Warden, Atlas, Checkout, restore, refund,
      dispute, and outage journeys pass.
- [ ] Desktop and mobile visual gates pass.
- [ ] Production enforcement remains off until the final release decision.

**Verification:**

- [ ] `npm run check:full`
- [ ] Local diff review has no unresolved real finding.
- [ ] Mandatory CodeRabbit review completes and findings are resolved.
- [ ] Approved live `$5.99` smoke purchase and refund pass.

**Dependencies:** T16 and T17

**Files likely touched:** browser tests, release documentation, no new gameplay
module expected

**Estimated scope:** Medium, 3-5 files plus external launch work

### Checkpoint 4 - Release decision

- [ ] All combined acceptance criteria pass.
- [ ] Product owner approves the final copy and live price.
- [ ] Legal/policy gates are complete.
- [ ] Stripe live Product, Price, keys, and webhook are verified.
- [ ] Enforcement rollback is proven.
- [ ] Public launch receives separate approval.

## 19. Suggested Future PR Packaging

This section describes future Git work only.

### PR 1 - Contracts and access foundation

- T1-T6
- enforcement disabled
- database and access API complete

### PR 2 - One-time payment

- T7-T10
- Stripe test mode only
- enforcement disabled

### PR 3 - Echo Atlas and Gate Wardens

- T11-T15
- gameplay and UI complete

### PR 4 - Combined launch

- T16-T18
- policy and live-payment gates
- enforcement enabled only after approval

Every future PR must use local lint, typecheck, tests, build, browser checks
where applicable, local review, mandatory CodeRabbit review, and merge to
`main`. GitHub Actions remain disabled.

## 20. Dependency Map

```text
T1 contracts
 |
 +--> T2 characterization
 |
 +--> T3 schema --> T4 access store --> T5 access API --> T6 client access
 |                    |
 |                    +-------------------------------------------+
 |
 +--> T7 Checkout --> T9 confirmation --> T10 purchase UI -------+
 |        |                ^                                      |
 |        +--> T8 webhook -+                                      |
 |                                                               |
 +--> T11 Atlas projection --> T12 Atlas UI ---------------------+
 |                                                               |
 +--> T13 Gate rules --> T14 Questions --> T15 presentation -----+
                                                                 |
                                                                 v
                                                       T16 integration
                                                                 |
                                      T17 operations -------------+
                                                                 |
                                                                 v
                                                       T18 release proof
```

Potential parallel work after contracts:

- T3-T6 access path;
- T7-T10 payment path after schema;
- T11-T12 Atlas path;
- T13-T15 Gate Warden path.

Integration remains sequential at T16.

## 21. Effort Estimate

Planning estimate:

| Workstream | Estimate |
|---|---:|
| Contracts and characterization | 1-2 engineering days |
| Access and allowance | 2-3 engineering days |
| One-time payment | 2-3 engineering days |
| Echo Atlas | 1-2 engineering days |
| Gate Wardens | 2-3 engineering days |
| Combined integration and release proof | 2-3 engineering days |
| **Total** | **10-16 engineering days** |

Excluded:

- legal or tax advice;
- Stripe account verification;
- production policy approval;
- CodeRabbit rate-limit waiting;
- Cloud Quest Continuity;
- new artwork or audio beyond current design assets.

This is an estimate, not a delivery promise. The payment raw-body path,
concurrency test, and mobile Atlas layout are the highest uncertainty.

## 22. Complete Acceptance Criteria

### 22.1 Access

- [ ] One Guest demo Run works without Clerk.
- [ ] Guest escape or defeat triggers the account boundary.
- [ ] Three distinct signed-in Run starts succeed.
- [ ] Fourth distinct signed-in Run start is blocked.
- [ ] Same `runId` never consumes twice.
- [ ] Concurrent requests cannot create a fourth free grant.
- [ ] Active lifetime member receives unlimited grants.
- [ ] Existing accounts receive three free Runs at launch.

### 22.2 Payment

- [ ] Checkout total is exactly `$5.99 USD`.
- [ ] Checkout is one-time `payment` mode.
- [ ] No recurring Price or Subscription exists.
- [ ] Success URL alone cannot unlock access.
- [ ] Paid Session activates only its owning Clerk account.
- [ ] Duplicate fulfillment is idempotent.
- [ ] Lifetime member cannot accidentally buy twice.
- [ ] Full refund revokes future Run starts.
- [ ] Dispute and restored-funds paths behave as documented.

### 22.3 Atlas

- [ ] Five regions and twenty nodes render.
- [ ] Current, completed, ahead, milestone, and completed-milestone states are
      correct.
- [ ] Atlas is derived from Quest Progress.
- [ ] Version-1 Quest Progress remains readable.
- [ ] Atlas is keyboard, screen-reader, mobile, reduced-motion, and zoom safe.

### 22.4 Gate Wardens

- [ ] Milestones are exactly 4, 8, 12, 16, and 20.
- [ ] Gate Warden reuses one configured Warden.
- [ ] Correct answer defeats it.
- [ ] Wrong answer costs Vitality and loads a fresh unique Question.
- [ ] Hint and Skip rules remain unchanged.
- [ ] Safe fallback works.
- [ ] Timer remains paused.
- [ ] Warden count and score ceiling remain stable.

### 22.5 Combined behavior

- [ ] A perfect four-Run free path can encounter the first Gate Warden.
- [ ] Defeat does not produce surprise payment messaging.
- [ ] Canceled Checkout preserves Atlas and Quest state.
- [ ] Verified purchase resumes the blocked Run action.
- [ ] Payment state cannot alter deterministic Run output.
- [ ] Lifetime access restores across browsers after sign-in.
- [ ] Device-local Quest disclosure is visible before purchase.

### 22.6 Quality and release

- [ ] Existing Profiles, scores, Records, and Guest state remain readable.
- [ ] No sensitive payment data enters app storage or logs.
- [ ] All local validation passes.
- [ ] Desktop and mobile screenshots pass review.
- [ ] Local review is clean.
- [ ] CodeRabbit review is complete and resolved.
- [ ] Live smoke purchase and refund pass before enforcement.
- [ ] Rollback preserves paid entitlements.

## 23. Success Measures

No numeric targets are invented before baseline data exists.

### 23.1 Funnel events

- Guest demo completed
- account gate shown
- account created after gate
- signed-in Run authorized with remaining count
- first Atlas milestone viewed
- Gate Warden encountered
- lifetime gate shown
- Checkout opened
- Checkout paid, canceled, or failed
- lifetime access restored on another browser
- payment or access verification error
- refund or dispute transition

### 23.2 Product questions

- What percentage of Guest completions become accounts?
- How many accounts use all three free Runs?
- How many free paths reach the first Gate Warden?
- Does seeing the Atlas improve continued Quest play?
- How many exhausted accounts open and complete Checkout?
- How often is a paid player incorrectly blocked?
- Does device-local Quest Progress create refund or support requests?
- Do Gate Wardens improve milestone recognition without increasing confusion?

### 23.3 Owners and review windows

| Measure | Owner role | Review window |
|---|---|---|
| Guest-to-account conversion | Product | Weekly after launch |
| Free allowance completion | Product | Weekly after launch |
| Checkout completion | Product + Engineering | Daily first week, then weekly |
| Paid access errors | Engineering | Live alert and daily first week |
| Gate Warden comprehension | Game Design | First three playtest rounds |
| Atlas accessibility | UI Engineering | Every browser release |
| Refund/support themes | Product + Support | Weekly first month |

Set targets only after baseline collection and privacy review.

## 24. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Paywall feels punitive after defeat | High | Warn before Run start; never tie price copy to failure |
| Paid value feels too small | High | Launch with Atlas/Gate Wardens; Cloud Continuity next |
| Progress does not cross devices | High | Explicit disclosure; prioritize Cloud Quest Continuity |
| Anonymous demo can reset with cleared storage | Medium | Accept limitation; no fingerprinting |
| Client bundle can be modified | Medium | Treat as product gate, not DRM |
| Duplicate Stripe charge | High | Pending purchase reconciliation and idempotency |
| Forged payment success | Critical | Server retrieval, webhook signature, unique payment IDs |
| Refund leaves access active | High | Refund webhook and reconciliation test |
| Atlas crowds mobile gameplay | Medium | Separate overlay, responsive layout, browser proof |
| Gate Warden changes score balance | High | Reclassify existing Warden; keep count stable |
| `src/main.js` grows further | Medium | Narrow controllers and pure projections |
| Payment launches before value | High | Enforcement disabled until combined release |
| Child-facing purchase concern | High | Parent/grown-up copy and policy review |

## 25. Follow-On Roadmap

### P1 - Cloud Quest Continuity

Player outcome:

- lifetime access and Quest Progress both follow the account.

MVP:

- cloud boundary writes;
- local-to-cloud migration;
- conflict recovery;
- no mid-Run cross-device resume.

### P1 - Lantern Journal + Practice

Player outcome:

- reviewed concepts practiced during a Quest become visible and revisitable.

MVP:

- topic metadata;
- mastered/practice-needed projection;
- optional safe Practice Lantern;
- no punishment or score farming.

### P2 - Explorer Access Settings

Player outcome:

- stronger Fog contrast, larger maze marks, and reader-friendly Question text
  are available inside the app.

### P3 - Daily Shared Labyrinth

Player outcome:

- a repeatable shared daily ritual.

Global ranking remains deferred until the fairness contract is strong enough
for competitive claims.

## 26. Official Platform References

Current planning assumptions were checked against:

- [Clerk Billing overview](https://clerk.com/docs/guides/billing/overview)
- [Stripe Checkout one-time payment mode](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Stripe Checkout Sessions](https://docs.stripe.com/payments/checkout-sessions)
- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe webhook verification](https://docs.stripe.com/webhooks)
- [Stripe refunds](https://docs.stripe.com/refunds)
- [Stripe one-time payment-method behavior](https://docs.stripe.com/payments/checkout/save-during-payment)

Provider behavior must be rechecked during future implementation because
payment APIs and product limits can change.

## 27. Documentation-Only Approval Gate

This document authorizes nothing beyond planning.

No application code, configuration, dependency, database schema, Stripe
Product, Stripe Price, webhook, secret, Clerk setting, issue, branch, commit,
push, PR, or deployment may be created until the user explicitly approves
implementation.

Recommended future approval statement:

> Approve the complete Echo Maze plan: one Guest Run, three signed-in free
> Runs, $5.99 USD once for lifetime access through Clerk identity and
> Stripe-hosted Checkout, Echo Atlas with five regions, and Gate Wardens at
> Labyrinths 4, 8, 12, 16, and 20. Begin future implementation at T1.

Until that approval is given, stop at documentation.
