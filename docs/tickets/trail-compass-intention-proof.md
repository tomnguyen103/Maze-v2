# Ticket: prove Practice Intention privacy and release gates

Issue: #181
PR batch: A
Blocked by: #180 (merged)

## Proof contract

The proof must show that the intention remains a transparent picker choice and
does not enter gameplay or identity state.

## Required receipts

- Red receipt for the contract test before implementation.
- Green unit receipt for all intention validation branches.
- Green browser receipt for desktop and mobile, keyboard, reduced motion, and
  200% text.
- Storage comparison before and after cancel and rejected Review/Challenge
  choices.
- Inspection proving no intention value is written to Quest Progress, the Run
  locator, share URL, Access Settings, or Question request.
- Local Standards/Spec and Security & Reliability review result.
- CodeRabbit result or explicit rate-limit waiver on the PR.

## Receipts

- Red: after `npm ci` in the isolated worktree, `npx vitest run
  tests/practice-intention.test.js` failed at import because
  `../src/player/practice-intention.js` did not exist.
- Green contract: the same focused command passed with 4 tests.
- Green local gate: `npm run check` passed with 1424 tests passed and 18
  skipped across 170 Vitest files; build and bundle budgets passed at 29.83 KB
  game JavaScript gzip and 11.96 KB shared CSS gzip.
- Browser: the focused Practice Intention test passed in both desktop and
  mobile projects (2/2), including keyboard focus, reduced motion, 200% text,
  no horizontal overflow, rejected choices, and cancel isolation. The final
  full suite passed 240 tests with 22 skips across desktop and mobile.
- Storage: the browser proof snapshots all localStorage entries before and
  after rejected Review and same-Level Challenge choices, verifies equality,
  verifies Escape closes the picker, and verifies no key containing
  `intention` is written after reopening it.
- Boundary inspection: the intention is passed only into the pure validator;
  accepted Quest Progress, Run locators, share URLs, Access Settings, and
  Question requests retain their existing shapes and write paths.
- Local review: bounded Standards, Spec, Security & Reliability, and
  performance review of the diff found no medium-or-higher findings; the
  validator runs before authorization and the intention has no persistence,
  sharing, account, score, or Question-request path.

CodeRabbit receipt is recorded on the PR before merge.
