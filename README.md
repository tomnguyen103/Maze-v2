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
- Wardens move after each valid action. They Patrol objectives, Hunt nearby
  Explorers, and Intercept predictable movement.
- Meeting a Warden pauses the timer. Answer correctly to defeat it; answer
  incorrectly to lose one Vitality and, if Vitality remains, try a new question.
  Each defeated Warden awards one Pulse and 100 score.
- One complete Guest Run is available before account creation. Signed-in
  Explorers can claim a unique username, choose Explorer and playground
  colors, and submit escaped runs to the Global Scoreboard.
- Global scores award 100 per Warden, 50 per Echo, and 500 for escaping. Only
  each Explorer’s best escaped run appears in the top ten.
- Use `Copy Share Link` to copy the exact seed, Quest Level, and Labyrinth
  Number without changing the normal `/play` URL. Refreshing `/play` restarts
  the same active Labyrinth from its device-local locator.
- Escapes and defeats persist in local Run Records. Escapes rank first by time,
  then moves; defeats rank by Echo progress.
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

Then set:

```text
DATABASE_URL=your-neon-pooled-connection-string
VITE_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
RUN_ACCESS_ENFORCEMENT_ENABLED=false
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

The included `vercel.json` serves the Vite entry document for direct `/play`
visits and refreshes; API functions remain at `/api/*`. The game remains
playable in Guest mode when Clerk or Neon is unavailable. Guest runs continue
to use the unchanged local Records tab. Configure all three Clerk variables and
the database before presenting production sign-in as available.

The additive Run Access ledger is ready for exactly three signed-in free starts,
but the server-owned enforcement flag stays `false` until the Lifetime Membership purchase
and recovery slice is deployed and the production release checklist is
approved. The browser reads this server-owned rollback state before admission;
there is no client flag that can bypass it. Hosted database URLs are normalized
to `sslmode=verify-full`.

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
- `src/questions/` contains Quest Levels and the deterministic fallback deck.
- `server/question-service.js` selects Ollama locally or Gemini in production,
  requests reviewed structured output, caches it, validates child safety, and
  applies the fallback.
- `src/game/canvas-renderer.js` projects run state onto the Canvas.
- `src/main.js` connects keyboard, touch, swipe, HUD, dialog, and timing.
- `src/player/` owns Clerk session state, profile colors, score submission, and
  the Global Scoreboard client.
- `server/player-*.js` validate profiles and escaped runs, compute scores, and
  read or write Neon without exposing Clerk IDs.
- `server/run-access-*.js` owns row-locked, idempotent Run admission; the
  browser keeps its stable opaque Run id in the active locator.
- `src/game/audio.js` and `src/game/storage.js` isolate optional browser APIs.
- `tokens.css` and `src/daylight.css` contain the active visual system.

Game-rule decisions live under `docs/adr/`, including deterministic Warden
behavior and the boundary between generated questions and deterministic runs.
