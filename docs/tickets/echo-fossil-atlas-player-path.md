# Ticket: Echo Fossil terminal path and Atlas experience

Spec: #159
PR batch: D
Blocked by: #160, #161

## Slice

Create the terminal fossil from the real Personal Quest Run path, render its
stamp/note in the existing Atlas landmark detail, and verify responsive,
keyboard, and reduced-motion behavior without expanding the active gameplay
bundle beyond its budget.

## Acceptance

- Escaped and defeated Personal Labyrinths create one fossil; First Light,
  Daily, and Classroom paths create none.
- Terminal fossil creation precedes the existing Quest boundary queue and does
  not alter score, Journal, Run Record, replay, or Quest Progress semantics.
- Atlas progress announces the fossil count/status; incomplete landmarks do not
  expose fossil details.
- Desktop/mobile, narrow layout, keyboard focus, and reduced-motion checks pass.
- Full local lint, typecheck, test, build, bundle, and browser gates pass.

## Verification receipt

Before implementation, record the observed failing test name and failure line
in the commit body or ticket comment. The first green receipt must be recorded
after the terminal and browser tests pass.

Red receipt (2026-08-02, before implementation):
`tests/terminal-fossil.test.js` failed at line 2 because
`../src/game/terminal-fossil.js` did not exist (`Cannot find module`).

Green receipt (2026-08-02):
`npx vitest run tests/fossil-runtime.test.js tests/terminal-fossil.test.js tests/echo-fossils.test.js tests/quest-atlas.test.js tests/quest-atlas-view.test.js`
passed: 5 files, 31 tests; the Echo Fossil browser acceptance test passed on
the desktop and mobile projects (2 tests).
