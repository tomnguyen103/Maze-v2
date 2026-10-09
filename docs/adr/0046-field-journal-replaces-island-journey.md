# 0046: Replace the island Journey with the Field Journal identity

- Status: Accepted
- Date: 2026-10-08

## Context

The Journey identity uses sky-tinted grid paper, pastel blobs, islands joined by rope
bridges, and white panels. It reads as a generic pastel game page. Parents and teachers
judge the product at the first visit, at the $5.99 price. They see no distinct and
trustworthy identity. The Atlas, the Labyrinth board, and the Warden Question share the
same generic look.

## Decision

1. The Field Journal identity replaces the Journey identity on every surface. It uses
   warm ivory paper, charcoal ink, and lantern amber actions.
2. The Atlas draws five territories with dashed trails and landmark stamps. The
   Labyrinth board draws ivory passage tiles, hatched walls, and stippled fog.
3. `design.md` is the locked design system. `GLOSSARY.md` defines Field Journal and no
   longer defines Journey.
4. The product name stays Echo Maze. Game rules, maze geometry, billing, and copy density
   do not change.

## Consequences

- Presentation changes on the Atlas, the board, the dialogs, and the dashboards. No game
  rule, storage format, or API changes.
- The Theme Choice and the browser bar colour stay in sync through three copies. A test
  locks the copies.
- The Stitch project keeps its id. Its design system is replaced by a Field Journal
  design system built from `design.md`.
- The same programme retires the island and blob tokens.

## Rejected alternatives

- A palette swap only: the Atlas, the board, and the shell need a distinct composition.
- A new product name: Decision D1 keeps the Echo Maze name.
- A new Stitch project: the existing project is reconciled instead.
- A new font pair: Bricolage Grotesque and Geist already meet the plan.
