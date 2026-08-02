# Echo Maze: Trail Compass Practice Intention

Status: ready for implementation
Issue: #181
Dependency: #180 (merged)
PR batch: A — one PR for the complete feature

## Player problem and intended feeling

Trail Compass gives an Explorer a clear nonvisual route through the current
Labyrinth, but the New Quest picker does not let them name the kind of practice
they want. The intended feeling is agency: “I choose what I am here to practice,”
without the app guessing what the Explorer knows.

## Contract

The New Quest picker presents exactly three Practice Intentions:

| Intention | Meaning | Start boundary |
| --- | --- | --- |
| Review | Revisit the current Quest Level and selected reviewed Learning Deck. | The visible Level and Deck must remain the current choices. |
| Explore | Try a different reviewed Deck, Level, or Region by choosing it. | Any visible published Level and Deck choice is allowed. |
| Challenge | Opt into harder reviewed content. | The visible Level must be higher than the current Level. |

The intention is transient picker state. It is never inferred from answers,
mistakes, timing, reading behavior, device features, account identity, or
Question history. It is never stored in Quest Progress, Run identity, shared
links, cloud Access Settings, score, exports, or analytics.

## UX and accessibility

- A semantic radio group is labelled “Choose a Practice Intention”.
- Each radio has a child-safe label and explanatory copy.
- The group states that Level and Learning Deck remain explicit choices.
- The current validation message is exposed through a status region and remains
  truthful when Challenge has no higher Level available.
- The group and all Level/Deck controls work with keyboard, mobile layout,
  reduced motion, and 200% text.
- Canceling the picker leaves Quest Progress, active Run, and local storage
  unchanged.

## Gameplay invariants

- A valid choice cannot mutate the deterministic Run engine or Question order.
- Review rejects a different Level or Deck before authorization or persistence.
- Challenge rejects the current or lower Level before authorization or
  persistence.
- Explore accepts the existing published Level and Deck choices.
- No intention value enters the Run locator, share URL, Quest Progress, or
  Question request.

## Implementation decisions

| Question | Decision | Source |
| --- | --- | --- |
| Where does the choice live? | New Quest picker beside the existing Level and Deck choices. | Roadmap P2.1 and current player path |
| Does it persist? | No; reset to neutral Explore on each picker open. | ADR 0041 privacy and no-profile boundary |
| Does it auto-select content? | No; the Explorer confirms every Level and Deck choice. | Roadmap “The player chooses” |
| How is Challenge verified? | The selected Quest Level number must exceed the current Level number. | Existing Quest Level contract |
| What is the neutral default? | Explore, because it makes no assumption about a new or returning Explorer. | Autopilot seam decision; ADR 0041 |

## Definition of done

- Unit tests cover the closed intention catalog and Review/Explore/Challenge
  validation, including invalid values and highest-Level Challenge.
- Browser tests cover all choices, Review and Challenge rejection, Explore
  success, cancel isolation, desktop/mobile keyboard, reduced motion, and 200%
  text.
- Local lint, typecheck, Vitest, build, bundle, browser, local review, and
  CodeRabbit gates pass.

