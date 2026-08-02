# ADR 0042: Classroom Expedition Debrief Privacy Boundary

## Status

Accepted for P2.2.

## Decision

Classroom Expedition debrief uses two different views:

- Teachers receive a thresholded Classroom-wide objective signal. The existing
  journal projection remains member-scoped for cascade and deletion behavior,
  but the runtime reader groups it by objective and returns a signal only when
  that objective has at least three total responses. Reviewed next-step cards
  are supportive activities keyed to known Learning Objectives; they do not
  label, rank, compare, or diagnose Students.
- Students receive two read-only reflection prompts in their own Expedition
  card after they escape a Labyrinth. Prompts are generated in the browser. No
  response field is stored, exported, or sent to a Teacher endpoint.

The current Learning Journal contract carries Classroom scope, not Expedition
identity. The Teacher UI therefore says Classroom-wide objective signal and
does not imply that an objective count is an answer history for one assignment.
Expedition completion remains the separate aggregate reader from ADR 0022 and
0030.

## Privacy invariants

- No Teacher debrief response contains Student names, provider identifiers,
  ranking, route history, timestamps, prompts, answers, or diagnosis.
- A Classroom objective with fewer than three total responses is hidden.
- Personal Play uses its existing null Classroom scope and never contributes to
  the Classroom projection.
- Membership and forced-RLS checks remain database authority; the UI is not an
  authorization boundary.

## Consequences

P2.2 can ship useful debrief guidance without adding an assignment-specific
answer ledger or persisting sensitive reflection responses. Expedition-specific
objective reporting would require an explicitly reviewed journal-to-Expedition
identity contract and a new privacy review; it is not inferred here.
