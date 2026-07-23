# Echo Maze

Echo Maze turns the original browser maze into a bright, deterministic tactical
game. Recover three Echoes, read the Wardens' changing behavior, and reach the
Gate.

The original project is preserved at
[tomnguyen103/Maze](https://github.com/tomnguyen103/Maze). Its gameplay files,
`public/index.html` and `server.js`, remain unchanged in this repository. The
new experience is an additive Vite application at the repository root.

## Play

- Move with Arrow keys or WASD.
- Press Q or Space to release a limited Pulse and reveal nearby stone.
- On touch devices, use the direction controls or swipe across the Labyrinth.
- Recover every Echo before entering the Gate.
- Wardens move after each valid action. They Patrol objectives, Hunt nearby
  Explorers, and Intercept predictable movement.
- Use the seed to replay or share the exact same Labyrinth.
- Completed escapes are ranked in local Run Records by time, then moves.
- Sound is optional and never starts without player input.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

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
- `src/game/canvas-renderer.js` projects run state onto the Canvas.
- `src/main.js` connects keyboard, touch, swipe, HUD, dialog, and timing.
- `src/game/audio.js` and `src/game/storage.js` isolate optional browser APIs.
- `tokens.css` and `src/daylight.css` contain the active visual system.

The Warden behavior decision is documented in
`docs/adr/0001-readable-deterministic-warden-modes.md`.
