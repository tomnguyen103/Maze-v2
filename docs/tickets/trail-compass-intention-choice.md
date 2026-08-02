# Ticket: expose the Trail Compass Practice Intention choice

Issue: #181
PR batch: A
Blocked by: #180 (merged)

## Scope

Add the transient Review/Explore/Challenge radio group to the New Quest picker,
validate it before authorization, and keep the existing Level/Deck/Run
contracts unchanged.

## Acceptance criteria

- The group is semantic, keyboard reachable, mobile-readable, and announces its
  selected state and validation status.
- Explore is the neutral default and every picker open resets the choice.
- Review requires the current Level and current reviewed Deck.
- Explore accepts any published Level and Deck the Explorer explicitly selects.
- Challenge requires a higher selected Level than the current Level.
- Cancel and rejected selections do not write Quest Progress, Run locators,
  account settings, or share URLs.
- Unit and desktop/mobile browser proof is recorded in the proof ticket.

## Red-to-green receipt

Before implementation, add the contract test and run the focused Vitest command.
Record the observed failure here before changing the implementation.

Receipt (red, 2026-08-02): `npx vitest run tests/practice-intention.test.js`
failed during suite import with `Error: Cannot find module
'../src/player/practice-intention.js' imported from
'.../tests/practice-intention.test.js'`. The locked dependencies were installed
in the isolated worktree first; this is the intended missing-module failure.

## Verification

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:bundle
npm run test:e2e
```
