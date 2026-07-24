# Echo Maze

Echo Maze is a kid-friendly text adventure inside a deterministic browser maze.
Choose a Quest Level, recover its Echoes, and answer learning questions when a
Warden blocks the path. A correct answer defeats that Warden. A wrong answer
costs one Vitality and, if the Run remains active, offers a fresh question.

The original project is preserved at
[tomnguyen103/Maze](https://github.com/tomnguyen103/Maze).

## Play

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
- Use the seed to replay or share the exact same Labyrinth.
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

Copy `.env.example` to `.env.local` to override the local provider or model.
The browser never receives provider credentials.

## Deploy

Production defaults to Gemini 3.5 Flash-Lite when `GEMINI_API_KEY` is set. The
Express server owns the key, rate-limits and caches requests, and validates
structured model output. Child-facing output must match a reviewed curriculum
card exactly; changed or unsafe output falls back to the bundled deck.

```bash
npm run build
npm start
```

Set these server-side environment variables on the host:

```text
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

## Validate

GitHub Actions are intentionally disabled. The complete gate runs locally:

```bash
npm run check:full
```

This runs ESLint, strict JavaScript type checking, Vitest unit tests, the Vite
production build, and Playwright tests on desktop and mobile browser profiles.
The tracked pre-push hook runs the core gate before every push.

## Architecture

- `src/game/game-session.js` contains deterministic generation and pure rules.
- `src/questions/` contains Quest Levels and the deterministic fallback deck.
- `server/question-service.js` selects Ollama locally or Gemini in production,
  requests reviewed structured output, caches it, validates child safety, and
  applies the fallback.
- `src/game/canvas-renderer.js` projects run state onto the Canvas.
- `src/main.js` connects keyboard, touch, swipe, HUD, dialog, and timing.
- `src/game/audio.js` and `src/game/storage.js` isolate optional browser APIs.
- `tokens.css` and `src/daylight.css` contain the active visual system.

Game-rule decisions live under `docs/adr/`, including deterministic Warden
behavior and the boundary between generated questions and deterministic runs.
