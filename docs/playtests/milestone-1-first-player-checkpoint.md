# Milestone 1 first-player checkpoint

**Status:** Script ready; moderated sessions not yet run

**Parent spec:** GitHub issue #95

**Human evidence ticket:** GitHub issue #101
**Baseline code:** `1313fc830979958467090bc97b22580969e2910c`

## Decision card

| Field | Contract |
|---|---|
| Baseline source | Moderated first-time use on the locally validated Milestone 1 build |
| Primary outcome | A first-time supervised player completes First Light without an adult taking control and understands the Warden/Vitality rule |
| Counter-metric | Skip to Quest, normal Quest entry, and Campfire Resume remain findable without added first-run overload |
| Provisional target | At least 80% complete without adult control and can explain “correct defeats the Warden; wrong costs Vitality” |
| Review window | After automated Milestone 1 validation and before Milestone 2 production starts |
| Decision threshold | Tune until acceptable; evidence may change presentation and pacing but cannot cancel First Light |

## Privacy boundary

Record behavior, not identity.

- Do not record a name, username, email, school, age, account identifier, face,
  voice, screen video, or photograph.
- Do not copy exact answers, exact routes, Reviewed Question text, or child
  quotes.
- Do not use analytics, third-party session replay, remote observation
  software, or production accounts.
- Give each session only an anonymous ordinal such as `P01`.
- Observer notes describe visible behavior. Interpretation belongs in a
  separate column.
- Delete temporary local browser state after the session.

## Setup

1. Use the locally validated Milestone 1 build in a fresh browser profile.
2. Use no production identity, database, billing, Classroom, or provider
   configuration.
3. Record only the device class, viewport class, input method, and explicitly
   exercised access mode.
4. Begin on Play with no First Light presentation marker.
5. The moderator may explain that this is a game test, but must not explain the
   controls or game rules before the player acts.

## Session script

### Part A — first choice

1. Ask the player to begin.
2. Observe whether they locate **Start First Light** and **Skip to Quest**.
3. If they choose Skip, confirm that Quest Level choice is reachable without a
   warning or penalty, then return and select First Light for the remainder.

### Part B — First Light

1. Observe the first movement without coaching.
2. Observe whether the unavoidable Echo communicates collection and Gate
   purpose.
3. At the Warden Challenge, ask the player to choose normally.
4. After the result, ask them to describe what a correct and wrong answer do.
   Record only whether the two rules were understood, not their exact words.
5. Observe whether Hint is discoverable and understood as optional help.
6. Continue through Gate escape and the Quest Level handoff.
7. On a separate attempt, use wrong answers until defeat and observe whether
   **Retry First Light** is understood without coaching.

### Part C — Campfire Resume

1. Start a normal local Run and complete at least one acknowledged movement.
2. Refresh or close and reopen the page.
3. Observe whether the player understands that the Run is paused.
4. Observe whether Continue and Restart communicate distinct outcomes.
5. Continue and verify that the player recognizes their prior position and
   progress.

## Allowed moderator intervention

Mark the first intervention level reached:

| Level | Meaning |
|---:|---|
| 0 | No help |
| 1 | Repeat the visible instruction without interpretation |
| 2 | Point to the relevant region without naming the action |
| 3 | Name the required action |
| 4 | Take control |

Completion without adult control means levels 0–3. Level 4 fails the primary
outcome for that session.

## Per-session observation

| Field | Allowed value |
|---|---|
| Session | Anonymous ordinal |
| Device | Desktop, tablet, or phone |
| Input | Keyboard, touch, pointer, or screen reader |
| Access mode | Default, Reduced Motion, 200% text, or named assistive technology |
| Start found | Yes or no |
| Skip found | Yes or no |
| First movement help | 0–4 |
| Echo purpose understood | Yes or no |
| Correct-rule understood | Yes or no |
| Wrong-rule understood | Yes or no |
| Hint found | Yes or no |
| Gate completed | Yes or no |
| Retry found | Yes or no |
| Quest handoff found | Yes or no |
| Resume paused understood | Yes or no |
| Continue/Restart distinction understood | Yes or no |
| Adult took control | Yes or no |
| Counter-metric regression | None, first-run overload, skip confusion, Quest-entry confusion, or recovery confusion |

## Observation and interpretation

For each material event, keep the columns separate:

| Observed behavior | Interpretation | Proposed tuning | Recheck needed |
|---|---|---|---|
| Describe only what happened | State why it may have happened | One concrete copy, hierarchy, pacing, or interaction change | Yes or no |

Do not treat an interpretation as evidence until a follow-up observation
supports it.

## Aggregate result

| Measure | Count |
|---|---:|
| Participants | Not yet run |
| Completed without adult control | Not yet run |
| Understood correct-answer rule | Not yet run |
| Understood wrong-answer rule | Not yet run |
| Found Skip to Quest | Not yet run |
| Found Retry First Light | Not yet run |
| Understood Campfire Resume | Not yet run |
| Counter-metric regressions | Not yet run |

## Checkpoint decision

The checkpoint remains open until issue #101 records real moderated evidence.
If the target or counter-metric fails, create concrete tuning work, implement
it, rerun the automated gate, and repeat only the affected moderated passage.
Do not invent results and do not use missing human evidence to cancel a
committed feature.
