# Echo Postcards — implementation contract

## Problem

Explorers need a safe way to invite another Explorer to try the same
deterministic Quest setup. The invitation must preserve the game's honest
boundaries: the recipient starts a normal Run, while the sender's identity,
performance, and detailed play remain private.

## Player contract

The in-game seed control copies an **Echo Postcard**. A Postcard identifies:

- one seed;
- one Quest Level;
- one Labyrinth Number and its Atlas Region;
- one exact deterministic ruleset revision.

Opening it shows a short recipient-facing notice and enters the existing normal
`/play` Run path. Run Access, guest admission, Question loading, Quest state,
and terminal outcomes remain recipient-local and use the existing contracts.

## Privacy contract

The URL and parsed contract contain no identity, username, Player Profile ID,
score, ranking, route, action log, answer, Question, prompt, timestamp, Run
ID, access token, replay state, or invitation record. The `postcard=1` marker
does not grant access or prove who shared the URL. No server or database change
is required.

## Validation invariants

1. The seed is uppercase, bounded, and matches the existing shared-seed shape.
2. The Quest Level is one of `bright-start`, `trail-scout`, or `maze-master`.
3. The Labyrinth Number is an integer from 1 through 20.
4. `region` and `rules` resolve to the exact ruleset allowed for that
   Labyrinth Number, including Classic Rules for legacy-compatible links.
5. Only `postcard=1` is recognized as a Postcard. Invalid markers never
   become a Postcard contract.
6. Creating a Postcard is pure URL construction; opening one calls the same
   normal Run authorization and initialization path as an ordinary shared
   seed.

## Acceptance criteria

- deterministic creation and parsing tests cover valid, malformed, mismatched,
  and forbidden-field shapes;
- the copied URL contains the six Postcard parameters in stable order and no
  personal or replay fields;
- legacy share links remain unchanged;
- the recipient sees that this is normal play from a seed-only invitation;
- desktop and mobile browser checks cover copy, URL contents, recipient entry,
  keyboard focus, reduced motion, and 200% text where the existing entry suite
  provides those checks;
- the standard local gate remains green and no live migration or production
  configuration is performed.

## Ticket plan and receipts

- Contract module and unit tests: red when the module is absent; green when
  `npm exec vitest run tests/echo-postcard.test.js` passes 1 file and 6 tests
  covering creation, parsing, mismatches, and forbidden fields.
- Entry wiring and recipient notice: red when the Postcard control/marker is
  absent; green when the focused desktop/mobile entry check passes 2 tests and
  the full entry suite passes 43 tests with 5 existing skips.
- Final gate and review: `npm run check` passes lint, typecheck, 1,434 passed
  and 18 skipped across 172 files, build, and bundle budgets. Local review is
  clean; merge remains pending the PR review protocol.
