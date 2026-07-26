# 0008: Derive Echo Atlas and Gate Warden milestones from Quest Progress

## Status

Accepted

## Context

A Quest already contains twenty increasingly difficult, Quest-unique
Labyrinths across five Difficulty Bands. Quest Progress owns the Labyrinth
Number and completion history while each seeded Run remains one deterministic
attempt.

The approved product contract needs a visible five-region expedition and a
climax at every fourth Labyrinth without adding another progress source,
another combat system, or paid power.

## Decision

- Echo Atlas is a pure projection of Quest Progress: five Atlas Regions,
  twenty nodes, and derived cosmetic sigils.
- Atlas code may read Quest Progress but cannot mutate or separately persist
  Quest completion.
- Labyrinths 4, 8, 12, 16, and 20 are the only Gate Warden milestones.
- A milestone reserves one already configured Warden; total Warden count and
  Run Score ceiling do not increase.
- After every Echo is recovered, the milestone Gate becomes open but sealed.
  Entering it starts a normal paused Warden Challenge against the Gate Warden.
- One correct answer defeats the Gate Warden. A wrong answer costs Vitality and
  loads a fresh Quest-eligible Question while the Run remains active.
- Existing Hint, Question Skip, safe fallback, Question uniqueness, timer,
  defeat, score, and Pulse rules apply without exception.
- Access, identity, payment, and network state cannot alter milestone
  classification or Gate Warden transitions.
- Atlas and Gate states use text or shape in addition to color and remain
  operable with keyboard, reduced motion, large text, and narrow screens.

## Consequences

- Shared links and Run Record replay reproduce the same milestone rule from
  seed, Quest Level, and Labyrinth Number.
- No Atlas migration or reward inventory is required.
- A defeated milestone Run leaves its sigil incomplete.
- Starting a new Quest intentionally clears derived Atlas completion with Quest
  Progress.
- Payment cannot make a Gate Warden easier or change its reward.
