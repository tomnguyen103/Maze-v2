# Quest II reviewed Warden content

## GitHub issue body

Add the static, reviewed Quest II Warden catalog described by
`docs/specs/echo-maze-quest-ii-living-regions.md`.

### Acceptance criteria

- Provide reviewed ordinary and Gate Warden cards for every Quest Level and
  difficulty band used by Quest II.
- Cards pass the existing question normalization and reviewed-revision
  contracts and contain no free-form AI-authored child-facing content.
- Question selection is content-pack aware and uses Quest II cards before
  provider/database fallback.
- Prove deliberate escalation through authored difficulty metadata and tests.
- Prove Quest-wide uniqueness for question IDs and reviewed revision IDs.
- Add content-coverage tests before implementation and record the red→green
  receipt in the PR description.

### Blocked by

- Quest II content-pack contract (Batch A foundation).

### PR batch

- Batch A: reviewed question catalog and coverage proof.
