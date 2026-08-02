# 0043: Aggregate-only Class Expedition Constellation

- Status: Accepted
- Date: 2026-08-02

## Context

The current development roadmap permits a Class Constellation only when it
reuses the Daily aggregate model and passes a separate privacy review. Class
Play is intentionally online-only. Its server contract records only the
terminal status of each assigned Classroom Run Grant; it does not submit a
trusted Run Action Log to the Classroom routes. Persisting a route here would
create a second replay and privacy boundary for a feature that does not need
one.

## Decision

Class Constellation is a Teacher-only projection of the four assigned
Labyrinth milestones in one Class Expedition. It uses the existing terminal
Grant aggregate as its source and never accepts, stores, or returns a route,
action, answer, prompt, timestamp, Run ID, Student identity, or provider
identifier.

The reader applies the Daily model's privacy thresholds:

- fewer than 20 distinct Students with at least one escaped assigned
  Labyrinth -> `Paths are still forming`;
- fewer than 5 distinct escaped Students at a milestone -> that milestone is
  suppressed; and
- visible milestones are reduced to Quiet, Glowing, or Bright relative bands,
  never exact counts or percentages.

The view is scoped by the existing transaction-local Explorer and Classroom
settings and requires Teacher Membership for the selected Classroom and
Expedition. It is not public, is not visible to Students, and is not a replay
or a child-level progress map. Existing Grant rows remain the only personal
source and retain their existing Membership/account-deletion cascades. No
historical Class Constellation archive is created.

## Privacy review record

The reconstruction question is answered by construction: the projection has
at most four fixed milestone labels and a band per visible milestone. It has
no ordered positions, timing, action sequence, answer, or per-Student
association, so two cohorts with the same thresholded milestone counts have
the same output even when their Student identities and routes differ.

The boundary tests cover 19/20 cohort publication, 4/5 milestone
suppression, relative-band output, Teacher-only access, cross-Classroom
isolation, and a serialized-output scan for identity, route, answer, prompt,
timestamp, rank, and diagnosis fields. A live migration application and
production configuration remain external release actions.

## Consequences

- Teachers get a small shared milestone artifact without a child-level map or
  route replay.
- A small Class remains honestly in a forming state.
- The view can be derived from existing terminal Grant data without another
  personal retention table or a second deterministic engine.
- The projection does not show every completed milestone until its own
  threshold is met, so it is intentionally incomplete for uneven cohorts.
