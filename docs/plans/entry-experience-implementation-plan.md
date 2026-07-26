# Implementation Plan: Echo Maze Entry Experience

**Planning status at authorship:** Draft for product review

**Implementation status (2026-07-26):** Engineering implementation is complete
through merged PRs #34, #37, #38, and #56. PR #56 supplied the honest
free-account and optional lifetime-access preview plus integrated validation
evidence and is present on remote `main` at `5b378aa`. Its mandatory CodeRabbit
review is resolved: all findings were fixed in `b99aef4`, acknowledged, and all
four review threads are closed; the refill-time post-merge trigger produced no
new actionable finding because the PR was already closed. Route, Guest, Clerk
fallback, responsive, 200% text, reduced-motion, and value-copy behavior is
exercised by
`tests/e2e/entry.spec.js` and the linked unit suites in
[`implementation-coverage.md`](implementation-coverage.md).
**Date:** 2026-07-24  
**Scope:** Introduction landing page, clean gameplay URL, optional Clerk sign-in  
**Implementation authorization:** Not granted by this document

## 1. Outcome

Create a deliberate entry experience for Echo Maze without weakening its
deterministic Labyrinth behavior or requiring an account.

After this work:

- `https://maze-v2-zeta.vercel.app/` presents an introduction and does not
  create or start a Run.
- Normal play occurs at `/play` without exposing Run state in the address bar.
- Parameterized URLs exist only for explicit shared Labyrinth links.
- Guests can always play.
- Clerk sign-in remains optional and is presented using Clerk's maintained
  authentication UI, themed to match Echo Maze.
- Existing device-local Quest Progress and Personal Records remain compatible.

## 2. Problem Statement

The current root page creates a Run during initial module evaluation. Every call
to `startRun()` then writes `seed`, `level`, and `labyrinth` into the current URL
using `history.replaceState()`.

This behavior has useful deterministic replay properties, but it creates three
entry-experience problems:

1. The public root URL immediately becomes an implementation-oriented URL.
2. A visitor enters a live, timed Workbench before choosing to play.
3. The game has no introduction that explains its learning adventure, guest
   option, or optional account benefits.

Production also currently exposes a disabled sign-in state because the Clerk
publishable key is not available to the deployed browser bundle. Authentication
code exists, but the deployment is not ready to make sign-in part of the entry
experience.

## 3. Product Decisions

### 3.1 Recommended decisions

1. **Use a landing page at `/`.**
   - Root is a calm introduction, not an initialized game hidden behind a modal.
   - No Run exists and no timer advances before the player enters the game.

2. **Use `/play` for normal gameplay.**
   - New Quests, continued Quests, retries, and Record replays keep the clean
     `/play` URL.
   - Run metadata moves out of the normal address bar.

3. **Keep parameterized URLs for explicit sharing only.**
   - Example:
     `/play?seed=STONE-VAULT-00&level=maze-master&labyrinth=1`
   - Opening this URL reconstructs the same Labyrinth and difficulty.
   - Internal game actions do not create this URL automatically.

4. **Keep login optional.**
   - Primary action: `Enter the Maze`.
   - Secondary action: `Sign in`.
   - Guest play remains available when Clerk or Neon is unavailable.

5. **Use Clerk's prebuilt SignIn interface.**
   - Use ClerkJS `openSignIn()` for a modal from the landing page.
   - Apply Echo Maze colors, typography, borders, and radius through Clerk's
     supported `appearance` configuration.
   - Do not build or maintain a custom password, verification, OAuth, or
     recovery flow.

6. **Describe account benefits honestly.**
   - Current authenticated benefits: username, Explorer colors, playground
     colors, and Global Scoreboard submissions.
   - Quest Progress remains device-local.
   - Do not claim that sign-in syncs Quest Progress across devices.

### 3.2 Explicit non-goals

- Mandatory authentication
- Cloud-synced Quest Progress
- Changes to Warden behavior, Questions, difficulty, scoring, or Quest rules
- Changes to Personal Record ranking
- New social, multiplayer, achievement, or account systems
- Framework migration to React, Next.js, or another router
- Custom authentication flows
- Redesign of the existing gameplay Workbench

## 4. Route Contract

| Route | Purpose | Expected behavior |
|---|---|---|
| `/` | Public introduction | Render landing page only. Do not create a Run or start timer. |
| `/play` | Normal gameplay | Start or continue current device-local Quest with a clean URL. |
| `/play?seed=...&level=...&labyrinth=...` | Shared Labyrinth | Validate parameters and reconstruct requested Labyrinth. |
| `/?seed=...&level=...&labyrinth=...` | Legacy shared link | Replace with equivalent `/play?...` URL and preserve exact replay behavior. |

### 4.1 Navigation behavior

- `Enter the Maze` navigates from `/` to `/play`.
- A returning device with Quest Progress receives `Continue Quest` as the
  primary label, but the destination remains `/play`.
- Browser Back from `/play` returns to `/`.
- Root navigation never silently resumes gameplay.
- Opening a valid shared URL may bypass the landing page.
- Invalid shared parameters fall back to the existing safe normalization rules
  and show a brief player-readable notice rather than failing.

### 4.2 URL behavior inside the game

- Starting a new Quest does not add query parameters.
- Starting the next Labyrinth does not add query parameters.
- Retrying after defeat does not add query parameters.
- Replaying a Personal Record does not add query parameters.
- `Copy Share Link` creates a full URL with `seed`, `level`, and `labyrinth`
  without changing the current address bar.
- Completing a shared Labyrinth and continuing the Quest returns the active URL
  to `/play`.

## 5. Run and Persistence Contract

Removing normal query parameters must not remove current replay guarantees.

### 5.1 Existing state that remains authoritative

- `Quest Progress` continues to own:
  - Quest Level
  - Labyrinth Number
  - completed Labyrinth count
  - used map fingerprints
  - used Question IDs
  - next Question ordinal
- `Run` remains one deterministic Labyrinth attempt.
- `Run Records` remain device-local and keep their existing schema.

### 5.2 New active locator

Introduce a small versioned `Active Run Locator` stored on the device:

```text
{
  version: 1,
  seed: string,
  levelId: QuestLevelId,
  labyrinthNumber: number
}
```

The locator contains only enough information to reconstruct the same
Labyrinth. It does not persist elapsed time, moves, Explorer position, Wardens,
Questions, or score.

This preserves current refresh semantics: refreshing restarts the same seeded
Labyrinth attempt rather than resuming an in-progress frame.

### 5.3 Locator lifecycle

- Save after a valid Run is created.
- Read when `/play` opens without shared parameters.
- Replace when starting a fresh Labyrinth or Quest.
- Clear on defeat so Retry and refresh begin a fresh Quest-unique map at the same Labyrinth Number.
- Replace after a win when Quest Progress advances to the next Labyrinth.
- Ignore and clear malformed or incompatible locator data.
- An explicit shared URL takes precedence for that load.

### 5.4 Determinism invariants

- Same seed, Quest Level, and Labyrinth Number produce the same Labyrinth.
- Shared links do not omit Labyrinth Number.
- Removing automatic URL mutation does not change `createRun()`.
- Quest-wide map and Question uniqueness remain enforced.
- A normal fresh Labyrinth remains different from previously used Quest maps.

## 6. Landing Page Experience

### 6.1 Design direction

Follow the locked design system in `design.md`:

- Genre: playful storybook expedition
- Warm daylight paper
- Deep navy ink
- Electric pear primary actions
- Sea-glass exploration surfaces
- Bricolage Grotesque display type
- Geist body type
- Geist Mono utility labels
- Two-pixel navy outlines
- Existing compact radius system
- Named tokens from `tokens.css`; no raw component colors

Landing page should feel like the threshold to the existing Workbench, not a
separate marketing template.

### 6.2 Page structure

1. **Compact header**
    - Echo Maze wordmark
    - `Sign in` or signed-in Explorer identity

2. **Hero threshold**
   - Title: `Echo Maze`
   - Promise: recover lost Echoes, outsmart Wardens with knowledge, and find
     the Gate
   - Primary CTA:
     - new device: `Enter the Maze`
     - returning device: `Continue Quest`
   - Secondary CTA: `Sign in`
   - One signature visual based on the existing Labyrinth language

3. **Three-step introduction**
   - Recover every Echo.
   - Answer Warden Challenges.
   - Reach the open Gate.

4. **Quest-Level preview**
   - Bright Start
   - Trail Scout
   - Maze Master
   - Explain that each Quest contains twenty increasingly difficult
     Labyrinths.
   - Selection still occurs in the existing Quest Level dialog after entering
     play unless a later approved design moves selection to the landing page.

5. **Account value note**
   - Sign in for a public username, saved color choices, and Global Scoreboard
     entries.
   - State that guest play remains available.

### 6.3 Copy constraints

- Use `Explorer`, `Labyrinth`, `Run`, `Quest`, `Quest Level`, `Echo`, `Gate`,
  and `Warden` according to `CONTEXT.md`.
- Use plain, encouraging, kid-friendly language.
- Do not invent player counts, testimonials, awards, or learning claims.
- Do not describe account sign-in as Quest Progress synchronization.

### 6.4 Responsive requirements

- At 390 by 844 CSS pixels:
  - primary CTA is visible without horizontal scrolling;
  - body text remains at least 16px;
  - all controls are at least 44 by 44 CSS pixels;
  - no content causes horizontal overflow.
- At desktop widths:
  - hero remains focused rather than stretching into empty space;
  - signature visual and copy form one clear composition;
  - gameplay density is not copied into the landing page.
- At 200 percent text zoom:
  - content remains readable and actions remain reachable.
- Reduced motion:
  - no required information depends on animation.

## 7. Authentication Experience

### 7.1 Guest state

- `Sign in` opens Clerk's SignIn modal when Clerk is configured.
- If Clerk is unavailable:
  - guest CTA remains fully enabled;
  - sign-in action uses an honest unavailable state;
  - no Clerk setup instructions are shown to public players.

### 7.2 Signed-in state

- Header shows the saved Explorer username when a Player Profile exists.
- New Clerk users still complete the existing required profile step.
- Account/profile control exposes current profile editing and Sign out.
- Signing out returns account UI to Guest without ending or changing the Run.

### 7.3 Clerk appearance

Configure Clerk through supported theme and appearance options:

- font family matching Geist;
- warm paper background;
- deep navy foreground and borders;
- electric pear primary action;
- visible focus treatment;
- compact radius matching Echo Maze;
- readable validation and error states.

Do not target fragile generated Clerk class names when a documented appearance
property is available.

### 7.4 Deployment preflight

Before making Sign in visible as an enabled production action:

- verify Clerk production instance and allowed origins;
- verify `VITE_CLERK_PUBLISHABLE_KEY`;
- verify server-side `CLERK_PUBLISHABLE_KEY`;
- verify server-side `CLERK_SECRET_KEY`;
- verify the existing player API can reach its database;
- verify secrets are present only in Vercel environment configuration;
- verify no secret value enters Git, browser assets, screenshots, or logs.

## 8. Technical Shape

Keep the existing vanilla Vite architecture.

Recommended composition:

- one browser entry coordinator reads `window.location.pathname`;
- `/` initializes only the landing experience;
- `/play` dynamically initializes the existing game;
- game module does not evaluate on the landing route;
- Vercel rewrites `/play` to the Vite entry document without changing the
  visible URL;
- existing `/api/*` routes remain ahead of the SPA fallback;
- no general-purpose router dependency is added.

Likely modules:

```text
src/
  app.js                       route-aware browser entry
  landing/
    landing-controller.js      landing CTA and account presentation
  game/
    active-run-locator.js      versioned Run locator persistence
  player/
    clerk-browser.js           shared Clerk initialization and appearance
  main.js                      gameplay bootstrap and Run orchestration
```

Exact module names may change during implementation if existing boundaries make
a smaller solution clearer. Any change must preserve the contracts in this
document.

## 9. Implementation Tasks

Implementation follows test-first, vertical slices. Each task must leave the
repository buildable.

### Task 1: Lock route and timer behavior with browser tests

**Description:** Add failing Playwright coverage for the new public routes and
entry timing before changing application code.

**Acceptance criteria:**

- [ ] `/` stays exactly `/` after load and does not create or tick a Run.
- [ ] `/play` starts gameplay without automatic Run query parameters.
- [ ] valid `/play?...` and legacy `/?...` shared links hydrate exact metadata.

**Verification:**

- [ ] New tests fail for the expected current behavior before implementation.
- [ ] Existing seeded determinism tests remain unchanged and green where
  applicable.

**Dependencies:** None  
**Files likely touched:** `tests/e2e/game.spec.js`, optionally a focused new
`tests/e2e/entry.spec.js`  
**Estimated scope:** Small

### Task 2: Add Active Run Locator storage

**Description:** Move normal refresh reconstruction metadata from the address
bar into a versioned storage adapter.

**Acceptance criteria:**

- [ ] valid locator data round-trips without changing values;
- [ ] malformed, stale-version, and out-of-range data is rejected safely;
- [ ] locator lifecycle matches Section 5.3.

**Verification:**

- [ ] unit tests cover valid, missing, malformed, and incompatible records;
- [ ] deterministic `createRun()` tests remain green.

**Dependencies:** Task 1  
**Files likely touched:** `src/game/active-run-locator.js`,
`tests/active-run-locator.test.js`  
**Estimated scope:** Small

### Task 3: Separate route bootstrap from gameplay initialization

**Description:** Prevent game module evaluation at `/`, initialize it only at
`/play`, and add the Vercel deep-link rewrite.

**Acceptance criteria:**

- [ ] landing route creates no Run and starts no animation timer;
- [ ] gameplay route initializes existing controls and Quest behavior;
- [ ] `/api/*` behavior is unchanged;
- [ ] direct navigation and browser refresh work at `/play`.

**Verification:**

- [ ] route tests from Task 1 pass;
- [ ] local production build serves both routes;
- [ ] Vercel preview deep links do not return 404.

**Dependencies:** Task 2  
**Files likely touched:** `index.html`, `src/app.js`, `src/main.js`,
`vite.config.mjs`, `vercel.json`  
**Estimated scope:** Medium

### Checkpoint A: Routing foundation

- [ ] root URL remains clean;
- [ ] no timer starts on landing;
- [ ] shared and legacy seeded links remain deterministic;
- [ ] unit tests, focused browser tests, typecheck, and build pass;
- [ ] human review before landing-page visual implementation.

### Task 4: Build landing page vertical slice

**Description:** Add the approved landing structure and connect guest/continue
navigation to `/play`.

**Acceptance criteria:**

- [ ] content and hierarchy match Section 6;
- [ ] CTA label reflects whether device-local Quest Progress exists;
- [ ] guest entry works without Clerk;
- [ ] no gameplay rule or Workbench layout changes.

**Verification:**

- [ ] desktop and 390 by 844 landing screenshots reviewed;
- [ ] keyboard tab order and focus states checked;
- [ ] no horizontal overflow.

**Dependencies:** Checkpoint A  
**Files likely touched:** `index.html`, `src/landing/landing-controller.js`,
`src/daylight.css`, `tokens.css` only if an approved semantic token is missing  
**Estimated scope:** Medium

### Task 5: Make shared links explicit

**Description:** Stop mutating the current URL during ordinary `startRun()`
calls and make sharing an explicit copy action.

**Acceptance criteria:**

- [ ] ordinary gameplay URL remains `/play`;
- [ ] copied share link contains normalized seed, Quest Level, and Labyrinth
  Number;
- [ ] opening copied link reconstructs the same Labyrinth;
- [ ] Record replay remains deterministic without changing current URL.

**Verification:**

- [ ] browser tests cover copy, open, refresh, next Labyrinth, Retry, New Quest,
  and Record replay;
- [ ] clipboard feedback names a share link rather than only a seed.

**Dependencies:** Task 3  
**Files likely touched:** `src/main.js`, `index.html`,
`tests/e2e/game.spec.js`  
**Estimated scope:** Medium

### Task 6: Enable themed optional Clerk sign-in

**Description:** Share one Clerk browser initializer between landing and game,
theme the maintained Clerk interface, and preserve existing Player Profile
behavior.

**Acceptance criteria:**

- [ ] configured Clerk opens SignIn from landing;
- [ ] unconfigured Clerk never blocks guest play;
- [ ] signed-in user reaches existing profile creation/editing;
- [ ] Sign out returns Guest state without altering current Run;
- [ ] public copy never exposes deployment setup instructions.

**Verification:**

- [ ] local configured and unconfigured states tested;
- [ ] server rejects unauthenticated profile writes as before;
- [ ] no Clerk secret appears in built assets.

**Dependencies:** Task 4  
**Files likely touched:** `src/player/clerk-browser.js`,
`src/player/player-controller.js`, `src/landing/landing-controller.js`,
`tests/player-client.test.js`, focused browser tests  
**Estimated scope:** Medium

### Checkpoint B: Complete entry flow

- [ ] guest can land, understand the game, choose to enter, and play;
- [ ] configured user can sign in, complete profile, and play;
- [ ] unconfigured authentication degrades honestly;
- [ ] normal gameplay and shared-link URLs follow Section 4;
- [ ] human review of desktop and mobile entry flow.

### Task 7: Accessibility and responsive verification

**Description:** Close presentation and interaction gaps found during browser
review without redesigning the Workbench.

**Acceptance criteria:**

- [ ] landmarks and heading order distinguish landing from gameplay;
- [ ] focus moves predictably after SignIn closes and after route navigation;
- [ ] all landing actions meet target-size and contrast requirements;
- [ ] 200 percent text and reduced-motion checks pass.

**Verification:**

- [ ] desktop and mobile gameplay checks pass;
- [ ] Playwright reflow tests cover landing and `/play`;
- [ ] Hallmark slop review reports no unresolved applicable failures.

**Dependencies:** Tasks 5 and 6  
**Files likely touched:** landing markup/style, focused E2E tests  
**Estimated scope:** Small

### Task 8: Release verification and documentation

**Description:** Verify production configuration and update truthful user-facing
documentation.

**Acceptance criteria:**

- [ ] README documents `/`, `/play`, shared links, guest mode, and account
  benefits;
- [ ] Vercel preview validates route refresh and Clerk callback behavior;
- [ ] production environment contains required public/server variables without
  exposing values;
- [ ] no obsolete root-query instructions remain.

**Verification:**

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] required Playwright desktop and mobile checks
- [ ] local diff review
- [ ] CodeRabbit review completed and findings resolved before merge

**Dependencies:** Task 7  
**Files likely touched:** `README.md`, `.env.example`, test documentation if
needed  
**Estimated scope:** Small

## 10. Acceptance Test Matrix

| Scenario | Expected result |
|---|---|
| First visit to `/` | Landing appears; URL stays `/`; no Run timer exists. |
| Returning guest visits `/` | Landing offers `Continue Quest`; no automatic play. |
| Guest selects Enter/Continue | `/play` loads with no query parameters. |
| Refresh on `/play` | Same active Labyrinth metadata reconstructs from locator. |
| New Quest | URL remains `/play`; new Quest behavior is unchanged. |
| Next Labyrinth | URL remains `/play`; progression and uniqueness remain intact. |
| Defeat and Retry | URL remains `/play`; Retry starts a fresh Quest-unique map at the same Labyrinth Number. |
| Personal Record replay | Exact recorded difficulty and seed load; URL remains `/play`. |
| Copy Share Link | Clipboard receives complete parameterized `/play` URL. |
| Open copied link | Same seed, Quest Level, Labyrinth Number, and Labyrinth load. |
| Open old root query link | Browser normalizes to `/play?...`; replay remains exact. |
| Clerk absent | Guest entry works; sign-in unavailable state is honest. |
| Clerk configured | SignIn opens with Echo Maze theme. |
| First Clerk login | Existing required username/profile flow opens. |
| Sign out during Run | Run remains unchanged; account UI becomes Guest. |
| Mobile 390 by 844 | No horizontal overflow; CTA and controls remain reachable. |
| 200 percent text | Content remains readable and operable. |

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Removing query mutation breaks deterministic refresh | High | Add Active Run Locator tests before changing `startRun()`. |
| `/play` returns 404 on direct Vercel navigation | High | Add explicit Vercel SPA rewrite and verify preview refresh. |
| Catch-all rewrite shadows `/api/*` | High | Keep API routing ahead of fallback and test question/player APIs. |
| Shared links lose Labyrinth difficulty | High | Require and test `labyrinth` in copied link and hydration. |
| Landing initializes game indirectly | Medium | Dynamic game import only on `/play`; assert no timer at `/`. |
| Clerk theme relies on unstable selectors | Medium | Use documented `appearance` properties and themes. |
| Sign-in copy overpromises persistence | Medium | Name only profile, colors, and Global Scoreboard benefits. |
| New landing drifts from locked design | Medium | Reuse `tokens.css`, typography, borders, radius, and vocabulary. |
| Legacy shared URLs stop working | Medium | Add root-query compatibility normalization. |
| Account outage blocks entry | High | Keep guest CTA independent from Clerk initialization. |

## 12. Approval Questions

Implementation should not begin until these choices are approved:

1. **Recommended:** Keep login optional, with `Enter the Maze` as primary CTA?
2. Use a Clerk SignIn modal from landing, or create a dedicated `/sign-in`
   route containing Clerk's mounted SignIn component?
3. Keep Quest Level selection in the existing game dialog, or move the three
   Quest Level choices onto the landing page?
4. Use `/play` as the gameplay route?
5. Rename `Copy Seed` to `Copy Share Link`, while still displaying the seed?
6. Should `Top 10` appear in the landing header, or remain gameplay-only?

## 13. Definition of Done

Work is complete only when:

- every approved acceptance criterion passes;
- normal root and gameplay URLs remain clean;
- shared and legacy URLs preserve exact deterministic replay;
- guest play works without account infrastructure;
- optional Clerk sign-in works in production with truthful copy;
- landing and gameplay pass desktop, mobile, accessibility, and local gates;
- local review and mandatory CodeRabbit review are resolved;
- PR is merged to `main`;
- production deployment is checked at `/`, `/play`, and one shared link.

