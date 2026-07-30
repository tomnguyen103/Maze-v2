# Milestone 4 Classroom and Accessibility PR plan

- Parent spec: [#124](https://github.com/tomnguyen103/Maze-v2/issues/124)
- Branch: `feat/milestone-4-classroom-accessibility`
- PR batch: **A — one aggregate draft PR**
- Base: `11ee3fc`

## Why one PR

Class Expeditions, Trail Compass, and Question Narration share the Classroom
route family, the six-field Explorer Access Settings record, the migration
ordering, and the release-evidence gate. The Classroom tickets are one coupled
expand of the forced-RLS tenancy substrate; the accessibility tickets share one
Access Settings schema advance. Intermediate PRs would strand half of a
versioned settings record or an unfunded assignment contract. CodeRabbit is
under an adaptive Fair Usage limit, so review events are batched to one
ready-flip and at most one re-review round.

## Ticket and commit order

| Order | Ticket | Deliverable | Blocked by |
| ---: | --- | --- | --- |
| 1 | [#125](https://github.com/tomnguyen103/Maze-v2/issues/125) | Class Expedition data contract and forced-RLS proof | None |
| 2 | [#126](https://github.com/tomnguyen103/Maze-v2/issues/126) | Teacher assigns, closes, reopens a Class Expedition | #125 |
| 3 | [#127](https://github.com/tomnguyen103/Maze-v2/issues/127) | License and capacity in Stripe test mode + cost model | #126 |
| 4 | [#128](https://github.com/tomnguyen103/Maze-v2/issues/128) | Student Class Play through Classroom Run Grants | #126, #127 |
| 5 | [#129](https://github.com/tomnguyen103/Maze-v2/issues/129) | Aggregate-only Teacher Expedition progress | #128 |
| 6 | [#130](https://github.com/tomnguyen103/Maze-v2/issues/130) | Trail Compass and six-field Access Settings | None |
| 7 | [#131](https://github.com/tomnguyen103/Maze-v2/issues/131) | Question Narration with local Read Aloud | #130 |
| 8 | [#132](https://github.com/tomnguyen103/Maze-v2/issues/132) | Integrated release evidence and milestone gate | all above |

Each ticket receives one focused commit after its red-green-refactor loop.
The branch stays green between commits.

## Review-event plan

1. Push the branch and open one draft PR after the first green feature commit.
2. Keep the PR draft through all eight tickets; pushes spend no CodeRabbit event.
3. Run the complete local and browser gates plus local Standards, Spec, and
   Security-and-Reliability review.
4. Confirm headroom with the free `@coderabbitai rate limit` query, then flip
   ready exactly once.
5. Read CodeRabbit findings only after its status reports `Review completed`.
6. Batch all real findings into one fix push and request one re-review only
   when needed.
7. Squash-merge only after CodeRabbit is complete and clean.

## Required aggregate gate

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check:bundle`
- `npm run test:e2e`
- migration text, forced-RLS isolation, seat/Grant idempotency, Stripe
  test-mode, fail-close, Compass parity and leak, narration voice-boundary,
  and Access Settings migration tests
- Hallmark 58-gate review
- inspected desktop and 390 by 844 mobile screenshots
  (`RECORD_MILESTONE_4_SCREENSHOTS`)
- recorded manual assistive-technology review
- local Standards, Spec, and Security-and-Reliability review
- completed CodeRabbit review with every real finding resolved
