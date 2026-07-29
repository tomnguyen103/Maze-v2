# 0031: Sync new Explorer Access Settings without making them gameplay state

- Status: Accepted
- Date: 2026-07-29

## Context

ADR 0020 synchronizes exactly four presentation-only Explorer Access Settings.
Trail Compass is a complete nonvisual gameplay path, and narration pace is an
access need rather than device content. Forcing an Explorer to restore either
choice on every device would weaken the accessibility contract. Automatically
inferring screen-reader use is neither reliable nor respectful of player
choice, while installed speech voices are not portable between devices.

## Decision

Trail Compass remains opt-in and defaults Off. Every Run and the Explorer Access
Settings surface provide a clear **Use Trail Compass** action; the app does not
attempt screen-reader detection.

The next versioned Explorer Access Settings record adds:

- `trailCompassEnabled`, a boolean defaulting to Off; and
- `narrationPace`, a bounded choice of Standard, Slower, or Faster, defaulting
  to Standard.

Guests retain both choices only in their device-local record. Signed-in
Explorers retain them in the same revisioned server record and local cache used
by ADR 0020. Existing four-field records migrate deterministically to those
defaults, and Reset restores both defaults.

Directional tones are not a separate synchronized preference. They require an
explicit Listen action and remain governed by the existing Sound control.
Accessible text remains available regardless of Sound.

An Explorer's selected local narration voice remains device-local because
installed voices and identifiers differ by device. If that voice disappears,
Question Narration may select another suitable local voice but never a remote
voice. There is no preference that automatically reads all content.

This ADR supersedes ADR 0020 only where it fixes the record to exactly four
fields. Trail Compass enablement and narration pace remain presentation state
and never enter Run, Quest, score, shared-link, Question, or deterministic
gameplay state.

## Consequences

- Explorers explicitly choose the nonvisual surface without being profiled.
- Signed-in Explorers keep critical access choices across devices without
  treating device-specific voice inventory as portable account data.
- Guests incur no account or network requirement.
- The settings schema, validation, database constraint, tests, and export
  representation require a versioned migration.
- A stale or failed cloud save keeps the last local presentation active under
  ADR 0020's existing conflict behavior.
