# Quest II progression and boundary propagation

## GitHub issue body

Wire the Quest II identity through player progression and every existing
question/offline/cloud boundary.

### Acceptance criteria

- A completed Quest I starts Quest II; incomplete and recovered Quests preserve
  their content pack; completed Quest II starts another Quest II.
- Client question requests carry Quest identity and server parsing/service
  preserve it in cache and reviewed-card selection.
- Offline receipt content sequences resolve the same Quest II card family and
  reject content-pack swaps.
- Cloud Quest reconciliation treats content-pack identity as part of the exact
  Quest identity without a production migration.
- Add failing boundary tests before implementation and record red→green
  receipts in the PR description.

### Blocked by

- #193 Quest II content-pack contract
- #194 Quest II reviewed Warden content

### PR batch

- Batch B: progression, question service, cloud, and offline integration.
