# Echo Maze Quiet Expedition

Status: ready for implementation, PR batch H
Roadmap: Current Development Roadmap P1.4
Parent issue: [#176](https://github.com/tomnguyen103/Maze-v2/issues/176)

## Player problem and intended feeling

Trail Compass, reader-friendly Questions, reduced effects, Read Aloud, Atlas,
Journal, Practice, and recovery already exist, but a player who needs a calm
nonvisual path has to discover and combine those pieces one at a time. Quiet
Expedition should make that choice legible: “I can take the whole expedition at
my pace, with the same rules and no hidden state.”

## Scope

Ship one explicit Quiet Expedition preset inside Explorer Access Settings and
make the active Personal Play path identify the composition clearly. The
preset combines existing presentation settings; it does not add a second game
engine, a new gameplay mode, a new persisted field, or a new account boundary.

The implementation must preserve these existing routes and states:

- keyboard movement, Pulse, Echo recovery, Gate travel, and every Trail Twist;
- normal and Gate Warden Challenges with visible Question text, Hint, Skip,
  feedback, and optional reviewed Echo Lens;
- Atlas, Journal, Practice, and Run Record entry points;
- same-device Campfire recovery and offline/reconnect status surfaces; and
- explicit local Read Aloud controls with an honest text-only fallback.

## Non-goals

- no automatic screen-reader detection or automatic speech;
- no hidden learner profile, adaptive difficulty, diagnosis, mastery score, or
  answer transcript;
- no new cloud, Journal, export, deletion, or offline payload;
- no changes to Run rules, timer, score, Vitality, access, Question order, or
  Quest uniqueness;
- no production migration, billing, enforcement, or external service setup.

## Contract

1. The preset previews `trailCompassEnabled: true`,
   `readerFriendlyQuestions: true`, and `reducedEffects: true`.
2. It preserves `highContrast`, `largeMarks`, and `narrationPace` from the
   current form.
3. Previewing does not write storage or call the server; Save remains the
   explicit commit action.
4. The document exposes a derived Quiet Expedition presentation marker only
   when all three component settings are enabled.
5. Trail Compass controls have an accessible Quiet Expedition heading and
   explanation while active; they remain hidden when Trail Compass is off.
6. Every state announcement remains concise and derived from the same
   canonical Run/view data used by visual play. Fog-hidden entities never enter
   text, tones, or narration.
7. Turning Trail Compass off immediately removes its controls and derived
   marker; no stale controller or announcement remains.
8. The existing six-field Access Settings record, server sync, export, and
   deletion contracts remain unchanged.

## Implementation decisions

| Question | Decision | Source |
| --- | --- | --- |
| Is Quiet Expedition a new game mode? | No; it is a presentation preset over the existing Run | ADR 0040; roadmap P1.4 |
| Which settings compose it? | Trail Compass, reader-friendly Questions, and reduced effects | ADR 0040; ADR 0031 |
| Does it add a persisted field? | No; derive the marker from the existing six-field record | ADR 0040 |
| What content may be spoken? | Only currently visible reviewed text through local browser voices | ADR 0032 |
| What changes in the engine? | Nothing; `createRun` and `applyAction` remain authoritative | CONTEXT; roadmap contracts |
| How is completion proved? | Pure preset tests plus desktop/mobile keyboard journeys through Run, Challenge, Atlas, Journal, Practice, and recovery | roadmap Definition of Done |

## Acceptance criteria

- Settings shows an explicit Quiet Expedition action with truthful copy.
- The preset keeps the current contrast, mark-size, and narration-pace choices
  while previewing exactly the three component settings.
- Saving the preset updates the existing local/account settings path only;
  reloading yields the existing six-field record with no new field.
- Active Play exposes a readable Quiet Expedition status and Trail Compass
  controls without requiring Canvas focus.
- A desktop and mobile keyboard journey can move, Pulse, enter and resolve a
  Warden Challenge, open Atlas and Journal, and use Practice without changing
  deterministic or durable gameplay state beyond the ordinary actions.
- Recovery and unavailable narration states remain honest, focusable, and
  usable in the same presentation composition.
- No hidden entity, answer, selected choice, route, timer, or profile data is
  added to a status, storage, network request, Journal, cloud record, export,
  or deletion payload.
- Lint, typecheck, unit tests, build, bundle budget, desktop/mobile browser
  checks, local review, and CodeRabbit pass before merge.
