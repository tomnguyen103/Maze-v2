# 0048: Serve the Reviewed Question Revision directly

- Status: Accepted
- Date: 2026-10-09
- Supersedes: the model-provider part of ADR 0003

## Context

ADR 0003 let a language model re-emit each reviewed question. The server accepted
the output only when it matched the reviewed card exactly. The model therefore
added no child-facing content. It added latency, a failure mode, a paid hosted
dependency, and a cooldown that hid real outages. Every accepted result equalled
the stored Reviewed Question Revision.

## Decision

1. The question service returns the stored Reviewed Question Revision. It reads
   the published database Revision when a bank is configured and reachable. It
   otherwise reads the bundled deck. Quest II, Gate Warden, focused Deck and
   Capstone Questions always read the bundled deck, as before.
2. The service sends no request to a model provider. The Ollama and Gemini
   paths, the provider selector, the failure cooldown, and the template assertion
   are deleted.
3. `source` is `database` or `bundled`.
4. Deck selection, freshness, Capstone Questions, Echo Lens, and Quest II resolve
   as before for the same seeds.
5. The variables `QUESTION_PROVIDER`, `OLLAMA_*`, and `GEMINI_*` have no effect
   and are removed from code, configuration, and documentation.

## Consequences

- Normal play makes zero outbound model requests. A test asserts this.
- Child-facing text comes only from reviewed content. No model can change it.
- A Challenge stays playable offline and during a database outage.
- The service keeps no per-encounter memory. Selection never read that memory,
  so the same seed and Challenge resolve the same Revision.
- ADR 0003 still governs the rest of its decision. The Run owns only the Warden
  Challenge and the accepted Warden Question.
- A future author-side drafting tool can use a model before review. That tool
  stays outside the play path and needs its own decision.

## Rejected alternatives

- Keep the model behind a flag: the flag keeps a dead path, a paid key, and a
  privacy surface for no gain.
- Cache provider results: the cache existed only to avoid repeat model calls.
