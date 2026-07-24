# 0003: Keep generated Questions outside the deterministic Run

## Status

Accepted

## Context

Echo Maze must replay the same seeded Labyrinth, while Warden Questions may come
from a local or hosted language model. Model output, latency, and availability
are not deterministic.

## Decision

The Run state owns only the Warden Challenge and the accepted Warden Question.
A separate question module requests structured output from local Ollama during
development and Gemini 3.5 Flash-Lite in production. Every response is validated
before it enters the Run. For child safety, model output must reproduce a
reviewed Quest-Level question template exactly; the model cannot introduce new
child-facing wording or facts. Gemini's strict safety filters provide an
additional hosted boundary. A bundled Quest-Level deck replaces unavailable,
timed-out, changed, malformed, or unsafe model output.

## Consequences

- Movement, Warden tactics, and seeded Labyrinth generation remain deterministic.
- Replaying a seed reproduces both the Labyrinth and reviewed Question sequence.
- Question providers can change without changing the Run interface.
- Every Warden Challenge remains playable without network access or a model.
