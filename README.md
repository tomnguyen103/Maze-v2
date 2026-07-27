# Echo Maze

Echo Maze is a kid-friendly text adventure inside a deterministic browser maze.
Choose a Quest Level, recover its Echoes, and answer learning questions when a
Warden blocks the path. A correct answer defeats that Warden. A wrong answer
costs one Vitality and, if the Run remains active, offers a fresh question.

The original project is preserved at
[tomnguyen103/Maze](https://github.com/tomnguyen103/Maze).

## Play

- Visit `/` for the public introduction. It never starts a Run automatically.
- Select `Enter the Maze` (or `Continue Quest`) to play at `/play` with a clean URL.
- Move with Arrow keys or WASD.
- Press Q or Space to release a limited Pulse and reveal nearby stone.
- On touch devices, use the direction controls or swipe across the Labyrinth.
- Choose Bright Start, Trail Scout, or Maze Master. Each Quest Level changes
  the maze, resources, Warden count, and question difficulty.
- Recover every Echo before entering the Gate.
- Open `Atlas` to inspect the five-region, twenty-Labyrinth Echo Atlas. It is
  derived from Quest Progress, pauses the Run while open, and restores one
  cosmetic region Sigil after each fourth Labyrinth.
- Signed-in Quest Progress syncs only at Labyrinth boundaries. Offline changes
  retry safely, same-Quest history merges monotonically, and different Quests
  require an explicit keep-local or use-cloud choice. Active Runs stay local.
- Open `Journal` to review bounded learning outcomes by objective, clear them
  separately, or try a different reviewed Practice Question. Practice never
  changes the active Run, access, score, Vitality, timer, or Quest Progress.
- Explorer Access Settings can strengthen Fog contrast, enlarge maze marks,
  use reader-friendly Question text, and reduce effects. Preview, Save, Cancel,
  and Reset change presentation only.
- Daily Shared Labyrinth offers one deterministic casual maze per UTC date.
  Its Personal Best, share link, rollover, and expiry behavior remain separate
  from Quest, Atlas, Run Access, Records, and global scores.
- Wardens move after each valid action. They Patrol objectives, Hunt nearby
  Explorers, and Intercept predictable movement.
- Meeting a Warden pauses the timer. Answer correctly to defeat it; answer
  incorrectly to lose one Vitality and, if Vitality remains, try a new question.
  Each defeated Warden awards one Pulse and 100 score.
- Labyrinths 4, 8, 12, 16, and 20 reserve one configured Warden as a Gate
  Warden. Recovering every Echo opens the Gate but leaves it sealed; answer the
  normal paused Warden challenge to break the seal, then step through. The
  configured Warden count, score ceiling, Hint, Skip, Vitality, fallback, and
  Quest-wide Question uniqueness rules stay unchanged.
- One complete Guest Run is available before account creation. Signed-in
  Explorers receive three server-authorized free Run starts. They can also
  claim a unique username, choose Explorer and playground colors, and submit
  escaped runs to the Global Scoreboard.
- Signed-in Quest Progress saves to the account after a new Quest choice and
  each escaped or defeated Labyrinth. Active position, timer, Question, and
  Warden state never enter the cloud. Offline play keeps a local retry and
  resumes syncing when the connection returns.
- Same-Quest progress from two browsers merges completed boundaries and
  Quest-wide map/Question uniqueness. Different Quests show both levels and
  boundaries and wait for an explicit choice.
- After the three signed-in starts, Lifetime Membership unlocks future Runs
  for `$5.99 USD` once. It is not a subscription, never renews, and never
  changes Warden difficulty, Vitality, score, or rewards.
- Global scores award 100 per Warden, 50 per Echo, and 500 for escaping. Only
  each Explorer’s best escaped run appears in the top ten.
- Use `Copy Share Link` to copy the exact seed, Quest Level, and Labyrinth
  Number without changing the normal `/play` URL. Refreshing `/play` restarts
  the same active Labyrinth from its device-local locator.
- Open `Daily` for one casual Trail Scout Labyrinth shared by UTC date. Daily
  links contain only that public date, expire at `00:00 UTC`, and offer the
  current maze when old. Daily Questions always come from the bundled reviewed
  deck; completion and Personal Best stay in separate device-local storage.
  Daily play never consumes Run Access or changes Quest Progress, the Echo
  Atlas, Run Records, cosmetics, or the Global Scoreboard.
- Escapes and defeats persist in local Run Records. Escapes rank first by time,
  then moves; defeats rank by Echo progress. Run Records remain device-local.
- Open `Settings` to preview and save device-local stronger Fog contrast,
  larger maze marks, reader-friendly Question text, or reduced visual effects.
  These settings never alter Labyrinth geometry, timing, Questions, score, or
  Quest Progress, and the operating-system reduced-motion preference is always
  respected.
- Signing out stops Cloud Quest requests but leaves the current local Quest on
  that device. Account deletion must remove the Clerk-keyed cloud row; it
  cannot erase local storage on another signed-out device.
- New run guarantees a different seed and Labyrinth layout.
- Sound is optional and never starts without player input.

## Run locally

Requires Node.js 22 or newer. Local development defaults to Ollama with
`mistral:latest`:

```bash
npm install
ollama pull mistral:latest
npm run dev
```

The Ollama CLI may also be installed separately; if Ollama or the model is not
available, the game automatically uses its bundled question deck. Open
`http://localhost:3000`.

For `npm run dev`, copy `.env.example` to `.env.local` to configure Clerk and
Neon. `npm start` reads environment variables supplied by the shell or hosting
platform instead. The browser receives only `VITE_CLERK_PUBLISHABLE_KEY`;
server secrets and database credentials stay server-side.

## Deploy

Production defaults to Gemini 3.5 Flash-Lite when `GEMINI_API_KEY` is set. The
Express server owns the key, rate-limits and caches requests, and validates
structured model output. Child-facing output must match a reviewed curriculum
card exactly; changed or unsafe output falls back to the bundled deck.

```bash
npm run build
npm start
```

For Vercel, connect the Neon project and apply the migrations in order:

1. `db/migrations/0001_players_and_scores.sql`
2. `db/migrations/0002_run_access.sql`
3. `db/migrations/0003_lifetime_membership.sql`
4. `db/migrations/0004_cloud_quest_progress.sql`
5. `db/migrations/0005_lantern_journal.sql`
6. `db/migrations/0006_audit_events.sql`

Then set:

```text
DATABASE_URL=your-neon-pooled-connection-string
VITE_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
CLERK_WEBHOOK_SIGNING_SECRET=your-clerk-webhook-signing-secret
RUN_ACCESS_ENFORCEMENT_ENABLED=false
STRIPE_SECRET_KEY=your-stripe-test-secret-key
STRIPE_PRICE_ID=your-599-usd-one-time-test-price-id
STRIPE_WEBHOOK_SECRET=your-stripe-test-webhook-secret
ECHO_MAZE_APP_ORIGIN=https://your-app.example
AUDIT_IP_SALT=your-random-audit-address-salt
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

### Operations scripts

```bash
npm run verify:audit    # recompute the audit_events hash chain; exits 1 on any break
```

It needs `DATABASE_URL`, and optionally `AUDIT_IP_SALT` — the salt for the
daily-rotating address hash stored on audit rows. Leaving `AUDIT_IP_SALT` unset
stores no address at all; audit rows and chain verification still work.
`verify:audit` sits outside `npm run check` because the local gate must not
require a database.

The included `vercel.json` serves the Vite entry document for direct `/play`
visits and refreshes; API functions remain at `/api/*`. The game remains
playable in Guest mode when Clerk or Neon is unavailable. Guest runs continue
to use the unchanged local Records tab. Configure all Clerk variables and the
database before presenting production sign-in as available.

Configure a Clerk `user.deleted` webhook at `/api/clerk-webhook`. Its verified
handler transactionally removes profile, score, access, purchase, Run-grant,
Cloud Quest, and Lantern Journal rows for that Clerk identity. Before removal,
it stores only a SHA-256 deletion tombstone—not the raw Clerk identity—and
serializes account-creating writes so an in-flight request cannot recreate
deleted data. A missing or invalid webhook secret fails closed; it never
accepts an unsigned deletion request.

The browser reads the server-owned rollback state before admission; there is no
client flag that can bypass it. `RUN_ACCESS_ENFORCEMENT_ENABLED=true` becomes
effective only when the complete Stripe **test-mode** configuration is valid,
so a partial payment setup cannot strand signed-in players. Production remains
`false` until the production release checklist is approved. Hosted database
URLs are normalized to `sslmode=verify-full`.

Lifetime Checkout accepts no browser price, amount, currency, quantity, owner,
or redirect fields. Direct return confirmation and signed raw-body webhooks
both activate the same PostgreSQL entitlement. Ordinary Run admission reads
PostgreSQL and does not call Stripe. See
[`docs/lifetime-membership-operations.md`](docs/lifetime-membership-operations.md)
for test setup, webhook events, refund/dispute recovery, support, and rollback.

## Validate

GitHub Actions are intentionally disabled. The complete gate runs locally:

```bash
npm run check:full
```

This runs ESLint, strict JavaScript type checking, Vitest unit tests, the Vite
production build, bundle budgets, and Playwright tests on desktop and mobile
browser profiles. The tracked pre-push hook runs the core gate before every
push.

## Architecture

- `src/game/game-session.js` contains deterministic generation and pure rules.
- `src/game/daily-labyrinth.js` owns the UTC-date Daily contract, bundled
  Question order, expiry rule, and separate privacy-minimized Personal Best.
- `src/game/quest-atlas.js` derives Atlas regions, nodes, milestone states, and
  cosmetic Sigils from version-1 Quest Progress without a second progress
  store; `src/game/quest-atlas-view.js` owns its accessible presentation.
- `src/questions/` contains Quest Levels and the deterministic fallback deck.
- `server/question-service.js` selects Ollama locally or Gemini in production,
  requests reviewed structured output, caches it, validates child safety, and
  applies the fallback.
- `src/game/canvas-renderer.js` projects run state onto the Canvas.
- `src/main.js` connects keyboard, touch, swipe, HUD, dialog, and timing.
- `src/player/` owns Clerk session state, profile colors, score submission, and
  the Global Scoreboard client. Its Quest continuity controller keeps an
  offline boundary queue and resolves optimistic cloud revisions.
- `server/player-*.js` validate profiles and escaped runs, compute scores, and
  read or write Neon without exposing Clerk IDs.
- `server/run-access-*.js` owns row-locked, idempotent Run admission; the
  browser keeps its stable opaque Run id in the active locator.
- `server/lifetime-*.js` and `server/stripe-lifetime.js` own fixed-price
  Checkout verification, replay-safe webhooks, and durable entitlement state.
- `src/game/quest-continuity.js`, `src/player/quest-continuity-controller.js`,
  and `server/quest-progress-*.js` own boundary-only cloud continuity and
  explicit conflict recovery.
- `src/learning/` and `server/learning-journal-*.js` own privacy-minimized
  Journal events, continuity, projection, and reviewed Practice.
- `src/player/access-settings*.js` owns versioned presentation-only settings.
- `server/clerk-webhook-route.js` verifies Clerk account-deletion events before
  `server/user-deletion-store.js` removes all Clerk-keyed player data.
- `src/game/audio.js` and `src/game/storage.js` isolate optional browser APIs.
- `src/player/access-settings.js` owns the versioned, device-local
  presentation contract; `src/player/access-settings-view.js` owns preview,
  save, cancel, and canonical reset behavior.
- `tokens.css` and `src/daylight.css` contain the active visual system.

Game-rule decisions live under `docs/adr/`, including deterministic Warden
behavior and the boundary between generated questions and deterministic runs.
