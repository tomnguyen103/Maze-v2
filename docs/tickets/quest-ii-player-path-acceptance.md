# Quest II player path and grey-box acceptance

## GitHub issue body

Expose the Quest II region arcs through the existing player surfaces and prove
the grey-box pacing contract.

### Acceptance criteria

- Story log and Atlas identify the active Quest II pack, region, Labyrinth, and
  pacing beat with responsive, keyboard-operable presentation.
- Storylets render at their gameplay-tied boundary and do not expose answers,
  raw routes, or hidden scores.
- Desktop and mobile browser tests cover the Quest II player path and keyboard
  controls.
- A deterministic acceptance fixture verifies all five regions, four beats per
  region, content coverage, and Quest-wide uniqueness.
- Run the full local gate and record browser/manual review evidence.

### Blocked by

- #195 Quest II progression and boundary propagation

### PR batch

- Batch B: player presentation and end-to-end acceptance.
