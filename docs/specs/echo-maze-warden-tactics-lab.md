# Warden Tactics Lab - feature specification

Status: ready for implementation, PR batch E  
Parent issue: [#166](https://github.com/tomnguyen103/Maze-v2/issues/166)  
Roadmap: P1.2 Warden Tactics Lab  
Dependency: P1.1 Echo Fossil Atlas merge

## Player problem and intended feeling

The first contact with a Warden asks an Explorer to understand movement rules
while a live Run is already at risk. The Tactics Lab gives the player a calm,
repeatable place to read those rules first. The intended feeling is "I know
what this Warden is trying to do," not "I am being tested before I can play."

## Scope

Add an optional Tactics Lab destination inside the existing Workshop. It offers
four fixed, authored drill cards:

1. **Patrol** - read the ordinary distant movement pattern and the one-action
   response to a valid Explorer action.
2. **Hunt** - read how a Warden closes distance once it is within the existing
   Hunt range.
3. **Intercept** - read how the eligible Warden predicts the Explorer's last
   direction when the existing Intercept conditions are met.
4. **Trail Twists** - walk one fixed scenario for each accepted regional rule:
   Echo Hush, Windways, Echo Bridges, Tide Doors, and Warden Bells.

Every drill uses the production deterministic game boundary and reviewed
Question pipeline. The session is unscored and ephemeral. Leaving or refreshing
the dialog discards its state.

Out of scope: new Warden behavior, new rulesets, adaptive difficulty, hidden
learner assessment, completion streaks, rewards, currencies, Quest progress,
Journal entries, Profile changes, Run Records, cloud storage, Classroom state,
Daily state, answer analytics, generated content, and a second game engine.

## Contract

The pure catalog exposes fixed metadata and an immutable setup for each drill.
The exact scenario may be represented by a known seed plus a bounded scripted
setup, but all state transitions after setup must pass through `createRun` and
`applyAction`.

```json
{
  "version": 1,
  "id": "patrol",
  "title": "Read Patrol",
  "objective": "See how a distant Warden chooses a route.",
  "seed": "TACTICS-PATROL-V1",
  "ruleset": "classic-v1",
  "steps": [
    {
      "prompt": "Choose one legal move, then read the Warden report.",
      "allowedActions": ["move"],
      "successSignal": "The Warden moved one step and remains readable."
    }
  ]
}
```

The catalog is allowlisted. Unknown drill IDs, rulesets, actions, and copy are
rejected. Trail Twist scenarios retain their production ruleset revisions and
never expose hidden map state as a teaching shortcut. The presentation may
explain the observed canonical mode and regional rule, but it cannot change
the engine result.

## Gameplay and privacy invariants

1. All four cards are deterministic across reloads and contain no random
   rotation or player-specific selection.
2. Patrol, Hunt, and Intercept use the existing mode thresholds and movement
   code. Trail Twist examples use the five accepted ADR 0026 revisions.
3. A Challenge, if reached, uses a bundled reviewed Question and the normal
   Hint, Skip, answer, and feedback mechanics; its outcome is discarded with
   the session.
4. The Lab never calls Quest Progress, Quest Continuity, Fossil Collection,
   Journal, Profile, Run Records, Run Replay, score submission, access, Daily,
   Classroom, or offline persistence APIs.
5. The Lab performs no network request and does not write local storage,
   IndexedDB, cookies, or service-worker account state.
6. The Lab exposes no hidden Warden position, Fog-hidden tile, answer key,
   route solution, ability estimate, or learner classification.
7. Closing the Lab returns focus to its Workshop trigger or the last safe
   destination. Keyboard and screen-reader users can choose, run, restart, and
   leave every drill.

## Implementation decisions

| Question | Decision | Source |
| --- | --- | --- |
| Where does it live? | Existing Workshop, with a lazy Tactics Lab dialog | `design.md`; current Workshop route |
| What is authoritative? | Production `createRun`/`applyAction` and existing ruleset revisions | Current Development Roadmap; ADRs 0001, 0026 |
| How many drills? | Four cards; the Trail Twists card contains all five accepted regional rules | P1.2 roadmap; ADR 0026 |
| Does practice persist? | No. Session state is in memory and discarded on close/reload | P1.2 privacy contract; ADRs 0010, 0011 |
| Does it teach Questions? | Only through the existing reviewed Challenge flow when a fixed drill reaches contact | Child-safe Question boundary; ADRs 0003, 0028 |
| Does it change difficulty? | No. No hidden adaptation, profile inference, or gameplay mutation | Roadmap non-negotiable contracts |
| How is content reviewed? | All labels, prompts, signals, and Question fixtures are authored and allowlisted | Child-safe content contract |
| How is it shipped? | Lazy-loaded module and view; current game bundle ceiling remains unchanged | `docs/performance-budget.md`; AGENTS.md |

## Verification plan

- Red-to-green unit tests for catalog allowlisting, deterministic setup,
  production-engine transitions, all five Trail Twist revisions, restart, and
  session disposal.
- Side-effect tests snapshot relevant storage and injected dependencies before
  and after a full drill session; every snapshot remains unchanged.
- Browser tests for Workshop entry, each card, keyboard completion, focus
  return, 320/390/768/1440 layouts, 200-percent text, reduced motion, and the
  Challenge boundary.
- Bundle and full local gates run before push. A local Standards/Spec review,
  Security & Reliability review for the state/persistence boundary, and the
  mandatory CodeRabbit review are required before merge.

## Success measure

Repository proof must show that a player can open the Workshop, choose every
drill, observe the same production Warden/Trail Twist behavior, and return to
Play without any Quest, score, Journal, Profile, persistence, or network state
changing. Numeric comprehension targets remain a future playtest question and
are not invented before a baseline exists.
