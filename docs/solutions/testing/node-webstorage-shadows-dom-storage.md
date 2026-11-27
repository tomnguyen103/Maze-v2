# Node 25+ global localStorage shadows the DOM test environment

## Symptom

On Node 26, 21 happy-dom tests fail with `TypeError: Cannot read properties of undefined (reading 'setItem')`. The same tests pass on Node 22.

## Root cause

Node 25 turns Web Storage on by default. Without `--localstorage-file`, the Node global `localStorage` is `undefined`, and it wins over the Storage that happy-dom installs.

## Fix

`vite.config.mjs` passes `execArgv: ["--no-experimental-webstorage"]` to the Vitest workers. The flag exists from Node 22.4, so the `22.x` engine still accepts it.

## Prevention

A test machine on a newer Node than `engines` runs the full gate once before work starts.
