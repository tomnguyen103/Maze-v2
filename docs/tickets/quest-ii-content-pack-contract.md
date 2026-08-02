# Quest II content-pack contract

## GitHub issue body

Implement the Quest II content-pack contract from
`docs/specs/echo-maze-quest-ii-living-regions.md` and ADR 0045.

### Acceptance criteria

- Add a stable Quest II namespace to the existing opaque `questId` contract.
- Infer the content pack from Quest identity without breaking existing Quest I,
  legacy, cloud, share, replay, or offline validators.
- Define exactly five Quest II region records mapped to the existing Trail
  Twist revisions.
- Define twenty stable storylet slots with the four-beat pacing sequence per
  region. Storylet records must include their gameplay tie and child-safe copy.
- Keep the maze engine and Run ruleset boundary unchanged.
- Add contract tests before implementation and record the red→green receipt in
  the PR description.

### Blocked by

- None.

### PR batch

- Batch A: Quest II content contract and catalog foundation.
