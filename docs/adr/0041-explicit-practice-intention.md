# 0041: Keep Practice Intention explicit and transient

- Status: Accepted
- Date: 2026-08-02

## Context

Trail Compass already describes the current revealed path, and the New Quest
picker already exposes reviewed Quest Levels and Learning Decks. The product
needs a legible way for an Explorer to say whether they want to revisit,
explore, or challenge themselves without turning those words into an inferred
learner profile. Automatically changing a Deck, Region, or Level from answers,
mistakes, elapsed time, or reading behavior would violate the roadmap contract.

## Decision

Add a transient **Practice Intention** group to the New Quest picker with three
explicit choices:

- **Review** keeps the current Quest Level and current reviewed Learning Deck;
  the Explorer still confirms those visible choices before starting.
- **Explore** leaves the reviewed Quest Level and Learning Deck open for the
  Explorer to choose explicitly.
- **Challenge** requires the Explorer to choose a Quest Level higher than the
  current Level; no Level or Deck is selected automatically.

The picker uses a fixed neutral default and resets that choice each time it
opens. The intention is not persisted, synced, included in a share link, or
written into Quest Progress, Run identity, score, Question requests, or
analytics. Starting a Quest remains the only state-changing action, and the
existing deterministic Level, Deck, Region, and Run contracts remain the
authority.

## Consequences

- Explorers can name their purpose without being profiled or diagnosed.
- Review and Challenge have honest, testable boundaries instead of vague
  recommendations.
- Explore remains useful when new reviewed Decks or Quest Regions are added,
  because the Explorer chooses them in the existing picker.
- No account migration or new gameplay schema is required.

