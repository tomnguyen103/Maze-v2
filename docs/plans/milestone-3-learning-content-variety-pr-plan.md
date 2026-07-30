# Milestone 3 Learning and Content Variety PR plan

- Parent spec: [#116](https://github.com/tomnguyen103/Maze-v2/issues/116)
- Branch: `feat/milestone-3-learning-content-variety`
- PR batch: **A — one aggregate draft PR**
- Base: `713d742`

## Why one PR

Echo Lens, Lantern Trails, and Learning Decks share the Reviewed Question
Revision contract, Question selection pipeline, Lantern Journal boundary, and
Quest identity. Splitting those coupled changes would create intermediate
branches where saved Quest data or reviewed content has only half of its
required contract.

The projected change stays within one feature subsystem. Tickets remain
separate implementation and commit units; they are not separate PRs.

## Ticket and commit order

| Order | Ticket | Deliverable | Blocked by |
| ---: | --- | --- | --- |
| 1 | [#117](https://github.com/tomnguyen103/Maze-v2/issues/117) | Reviewed revision identity and post-answer Echo Lens | None |
| 2 | [#118](https://github.com/tomnguyen103/Maze-v2/issues/118) | Fixed three-plus-two Lantern Trails in Workshop | #117 |
| 3 | [#119](https://github.com/tomnguyen103/Maze-v2/issues/119) | Four published Deck revisions and coverage gates | #117 |
| 4 | [#120](https://github.com/tomnguyen103/Maze-v2/issues/120) | Deck revision locked into Quest identity | #119 |
| 5 | [#121](https://github.com/tomnguyen103/Maze-v2/issues/121) | Focused Question serving and announced Mixed fallback | #119, #120 |
| 6 | [#122](https://github.com/tomnguyen103/Maze-v2/issues/122) | Integrated release evidence and complete milestone gate | #118, #121 |

Each ticket receives one focused commit after its red-green-refactor loop and
local Standards/Spec pass. The branch stays green between commits.

## Review-event plan

1. Push the branch and open one draft PR after the first green feature commit.
2. Keep the PR draft through all six tickets; pushes spend no CodeRabbit event.
3. Run the complete local and browser gates plus local Standards/Spec review.
4. Flip ready exactly once.
5. Read CodeRabbit findings only after its status reports `Review completed`.
6. Batch all real findings into one fix push and request one re-review only when
   needed.
7. Squash-merge only after CodeRabbit is complete and clean.

## Required aggregate gate

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check:bundle`
- `npm run test:e2e`
- migration, privacy, content-coverage, Quest-version, fallback, and
  side-effect-isolation tests
- Hallmark 58-gate review
- inspected desktop and 390 by 844 mobile screenshots
- local Standards and Spec review
- completed CodeRabbit review with every real finding resolved
