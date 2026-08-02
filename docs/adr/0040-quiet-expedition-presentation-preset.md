# 0040: Compose Quiet Expedition from existing presentation settings

- Status: Accepted
- Date: 2026-08-02

## Context

Trail Compass already supplies a complete nonvisual gameplay path, while
reader-friendly Question text and reduced visual effects are separate Explorer
Access Settings. The current development roadmap names the missing product
slice **Quiet Expedition**: a first-class, low-distraction way to enter and
continue Personal Play across the existing Run, Warden Challenge, Atlas,
Journal, Practice, and recovery surfaces.

Adding a seventh persisted setting would require another server schema and
continuity field even though Quiet Expedition is only a composition of three
existing presentation choices. A hidden inference from screen-reader use would
also violate the explicit opt-in rule in ADR 0031.

## Decision

Quiet Expedition is an explicit preset in Explorer Access Settings. Choosing
the preset previews these existing choices together:

- Trail Compass on;
- reader-friendly Question text on; and
- reduced visual effects on.

The Explorer must still press **Save settings** to keep the preview. The preset
preserves the current contrast, maze-mark, and narration-pace choices and does
not add a new persisted field. The HTML document derives a presentation marker
from the three existing values so the player path can identify the active
composition without creating another source of truth.

Quiet Expedition reuses the existing Run, Trail Compass, Question Narration,
Warden Challenge, Atlas, Journal, Practice, and recovery behavior. It never
changes deterministic state, action legality, timer behavior, score, Vitality,
Run Access, Quest Progress, Journal data, cloud data, export, or deletion.

## Consequences

- The setting remains explicit, reversible, and available to guests without an
  account or network request.
- Signed-in settings continuity stays within the existing six-field contract.
- A user can still tune the three component settings independently.
- Tests must prove the preset is presentation-only and that turning Trail
  Compass off hides its controls rather than leaving stale UI behind.
- A future product that needs a separately remembered Quiet Expedition choice
  must introduce a new versioned Access Settings contract deliberately; this
  decision does not reserve that field.
