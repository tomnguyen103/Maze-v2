# Echo Maze

Echo Maze turns the original browser maze into a deterministic, atmospheric
exploration game. Recover three Echoes, avoid the moving Wardens, and carry the
light back to the Gate.

The original project is preserved at
[tomnguyen103/Maze](https://github.com/tomnguyen103/Maze). Its gameplay files,
`public/index.html` and `server.js`, remain unchanged in this repository. The
new experience is an additive Vite application at the repository root.

## Play

- Move with Arrow keys or WASD.
- Press Q or Space to release a limited Pulse and reveal nearby stone.
- On touch devices, use the direction controls or swipe across the Labyrinth.
- Recover every Echo before entering the Gate.
- Wardens move after each valid action. Contact costs Vitality.
- Use the seed to replay or share the exact same Labyrinth.
- Sound is optional and never starts without player input.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
- `tokens.css` and `src/styles.css` contain the visual system.

The architecture decision and original-code pressure points are documented in
`docs/architecture-recon.html`.
