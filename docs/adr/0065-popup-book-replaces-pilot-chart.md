# 0065: Popup book replaces Pilot Chart

- Status: Accepted
- Date: 2026-11-27

## Context

The owner mandate of 2026-11-26 authorises a rebuild of the interface. The plan in `docs/plans/2026-11-27-popup-ui-implementation.md` records the decisions D1 to D15. ADR 0064 put the Popup look behind the flag `VITE_LOOK` until slice R9 removed the flag. This ADR records the identity decision, so slice R9 changed code only.

## Decision

1. Every surface takes the Popup identity: a pop-up storybook. Warm paper holds cards, plum ink draws text and every outline, and coral is the one accent. The palette lives in `src/looks/popup/tokens.css` and in `design.md` section "Popup look".
2. Chewy draws the wordmark and the scene titles. Andika draws all other text, and the board Echo digits too (plan D9).
3. Geist Mono shows only for seed codes and code text (plan D9). Every Readout number uses Andika with tabular figures at 700 weight (plan D10).
4. Popup took effect in slice R9. Popup is the only look.
5. Supersedes ADR 0051.
6. The theme storage key, the Theme Choice values, the maze geometry, and the rulesets stay unchanged. Night stays as a lamp-lit page.

## Consequences

- Slice R9 deleted the items of ADR 0064 item 7: the flag, the alias, the bar-colour plugin, and the Pilot Chart files.
- `GLOSSARY.md` replaces the Pilot Chart term with the Popup term (plan D15).
- ADR 0066 supersedes ADR 0052 for the board.
- ADR 0051 and ADR 0052 stay as history. Their status lines name the superseding ADR.
