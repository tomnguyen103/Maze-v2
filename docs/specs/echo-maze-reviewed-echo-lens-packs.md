# Reviewed Echo Lens explanation packs - feature specification

Status: ready for implementation, PR batch F  
Parent issue: [#170](https://github.com/tomnguyen103/Maze-v2/issues/170)  
Roadmap: P1.3 reviewed Echo Lens explanation packs  
Dependency: P1.1 Echo Fossil Atlas merge

## Player problem and intended feeling

An Explorer can receive a short Question explanation, but the existing visual
Lens is present for only one bundled revision and is not consistently available
after a Lantern Trail answer. The player should feel "I can see why this works,
then try it again safely," never "the game is grading how I learn."

## Scope

Publish a small, explicitly reviewed Echo Lens pack tied to exact immutable
Question revisions. The pack covers the six existing visual primitive kinds:

- number line;
- array;
- fraction bar;
- word highlighting;
- pattern;
- simple diagram.

Expose the same optional Lens after committed feedback in a live Challenge and
after a Lantern Trail answer. Keep the existing renderer lazy and provide the
same ordered reasoning text to assistive technology. Add a deterministic
coverage/publish check so a Lens cannot be launched without an exact revision
and a valid child-safe visual model.

Out of scope: generated explanations, generic objective explanations, new
Question content beyond the reviewed pack, pre-answer help, answer transcript
storage, mastery scores, adaptation, remote narration, Classroom analytics,
cloud Lens storage, or a replacement rendering system.

## Contract

Each published entry is keyed by the exact reviewed content identity and is
validated by `normalizeEchoLens` before it reaches the Question contract.
Editing any Question wording, choices, answer, Hint, explanation, or metadata
creates a new revision; the prior Lens never follows the edit implicitly.

```json
{
  "version": 1,
  "reviewedRevisionId": "bundled:bright-foundation-0:<digest>",
  "kind": "array",
  "title": "See equal groups",
  "reasoning": "Three rows of two make six.",
  "steps": ["Count the rows.", "Count each row.", "Combine the groups."],
  "visual": { "rows": 3, "columns": 2, "filled": 6 }
}
```

The implementation may continue to derive the bundled content key from the
reviewed question digest, but it must prove the resulting `reviewedRevisionId`
and Lens remain paired. A Question with no published entry returns no Lens and
does not receive a generic substitute.

## Invariants

1. A Lens is never rendered before the answer is committed in a live Warden
   Challenge; Question Hint remains the only pre-answer help.
2. A Lantern Trail keeps its fixed Question order and three-required/up-to-two-
   optional contract. Lens visibility changes feedback presentation only.
3. Lens content is authored, allowlisted, bounded, kid-safe, and free of URLs,
   personal-data prompts, generated text, or answer-choice duplication.
4. The visual model and its text alternative describe the same reviewed
   reasoning. Screen-reader output does not rely on `aria-hidden` visuals alone.
5. Lens state is ephemeral in the view. No prompt, choices, selected option,
   timing, or answer transcript is added to Journal, cloud, storage, or export.
6. The renderer remains a lazy chunk; the active gameplay bundle and all current
   performance budgets remain within their existing ceilings.

## Implementation decisions

| Question | Decision | Source |
| --- | --- | --- |
| Which content ships? | One explicit pack across all six supported primitive kinds | P1.3 roadmap; existing validator |
| What binds it? | Exact immutable Reviewed Question Revision | ADR 0028 |
| When is it visible? | After committed feedback or outside live Challenge, including Lantern Trail feedback | ADR 0028; roadmap 9.5 |
| What happens when content is missing? | Truthful no-Lens state; never generic or generated copy | ADR 0028 |
| Does Practice adapt? | No. Lens does not alter the fixed Lantern Trail sequence | Roadmap 9.5; ADR 0029 |
| Where is it stored? | Bundled reviewed content only; no child answer history | ADRs 0010, 0028 |
| What is the publish gate? | Exact revision binding, primitive normalization, child-safety checks, and coverage report | Existing `echo-lens.js`; content contract |

## Verification plan

- Unit tests cover all six primitive kinds, exact revision binding, changed
  Question rejection, unsupported-revision no-op behavior, and child-safe
  normalization.
- Practice view tests prove Lens visibility after answer, fixed sequence
  continuity, focus, and no Journal/Run side effects.
- Browser tests cover live correct/wrong feedback, Practice feedback, keyboard
  dismissal, desktop/mobile, 200% text, reduced motion, and no pre-answer Lens.
- Coverage evidence records the exact launched revisions and the unsupported
  count; it does not imply every bundled Question has a Lens.
- Full local gate, local review, Security & Reliability review of the content
  boundary, autoreview, and mandatory CodeRabbit review are required before
  merge.
