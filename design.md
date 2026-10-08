---
stitch-project: 3244739478942983822
---

# Design - Echo Maze

A modern, high-precision tactical design system for Echo Maze and its operational dashboard,
inspired by the WebGemma interface philosophy (https://web-gemma.vercel.app/).
Clean geometry, floating translucent controls, high-contrast typography, and tactile feedback
carry every surface; decoration stays strictly secondary to reading, movement, telemetry,
and Warden Challenges.

## Genre & Atmosphere

- **Genre**: Playful storybook expedition meets modern tactile WebGemma cockpit.
- **Atmosphere**: Daily App Balanced (Density 6, Variance 6, Motion 5).
- **Macrostructure family**:
  - App Workbench: Floating translucent command pill header, telemetry status deck, fluid central Labyrinth radar.
  - Operations Dashboard: Responsive command cockpit, fluid KPI metric tiles, sticky data tables.
  - Dialogs: Focused encounter. One decision per view with frosted glass backdrop and protected keyboard focus.
  - Records & Replays: Compact field notes and tactical replay timelines scannable across all viewports.

## Theme & Surfaces

Two surfaces, one identity. Warm daylight is the default; night is the deep midnight exploration canvas.

**Daylight**
- **Paper**: warm daylight canvas (`oklch(97% 0.018 96)`)
- **Stone**: elevated neutral surfaces (`oklch(99% 0.008 96)`)
- **Ink**: deep charcoal navy (`oklch(20% 0.035 255)`)
- **Lines**: subtle architectural boundaries (`oklch(29% 0.04 252)` and `--color-line-soft`)
- **Signature Accent**: electric pear (`oklch(84% 0.18 108)`). The iconic brand mark that never shifts.
- **Tactical Cyan**: WebGemma sky accent (`oklch(72% 0.16 220)`) for active segmented pills and focus states.
- **Exploration**: sea-glass cyan (`oklch(61% 0.17 205)`)
- **Danger / Warden**: coral red (`oklch(58% 0.22 24)`)
- **Success / Gate**: leaf green (`oklch(54% 0.14 155)`)
- **Glass Panel**: translucent paper (`oklch(99% 0.008 96 / 85%)`) with 16px backdrop blur.

**Night**
- **Paper**: deep midnight navy (`oklch(19% 0.035 255)`) — daylight Ink becomes the surface
- **Stone**: elevated dark panel (`oklch(24% 0.035 255)`)
- **Ink**: warm daylight text (`oklch(95% 0.012 96)`)
- **Signature Accent**: electric pear, unchanged. It is the signature and does not move.
- **Tactical Cyan**: vibrant electric cyan (`oklch(76% 0.16 218)`)
- **Exploration, Danger, Success**: adjusted lightness clearing AA contrast on midnight navy.
- **Glass Panel**: translucent midnight (`oklch(22% 0.035 255 / 82%)`) with 16px backdrop blur.

Persisted preference via `:root[data-theme="dark"]` and system `prefers-color-scheme`.
All colors flow through `tokens.css`. Raw hex/rgb values in components are forbidden.

## Typography Architecture

- **Display**: Bricolage Grotesque Variable, upright 700–780. Tight tracking (-0.025em to -0.03em). Headline clamp capped at 5.5rem.
- **Body**: Geist Variable, 450–700. Clean humanist legibility with line-height 1.5–1.6x. Minimum 16px in decision dialogs.
- **Utility & Data**: Geist Mono Variable, 600–700. Tabular numerals (`font-variant-numeric: tabular-nums`) across all metrics, scores, time, coordinates, and seeds.

## Spacing & Component Geometry

- 4-point spacing scale from `tokens.css` (`--space-1` through `--space-16`).
- Minimum tap targets: 44px by 44px with >= 8px separation between interactive controls.
- Radii: Compact, crisp corner radius system (`--radius-sm: 0.375rem`, `--radius-md: 0.625rem`, `--radius-lg: 1rem`, `--radius-pill: 9999px`).
- Tactile feedback: Buttons feature active transform press (`transform: translateY(2px)` or `scale(0.98)`).
- Elevation: Crisp, non-blurry borders paired with subtle, grounded offsets (`--shadow-panel`, `--shadow-glass`). Zero neon halos.

## Canvas Game Rendering Architecture

The central Labyrinth canvas is a high-precision tactical radar grid rendered via 2D Canvas:
- **Architectural Masonry**: Labyrinth walls render as clean, modern architectural blocks with subtle inner chamfer framing, removing retro cartoon hatch marks.
- **Tactical Coordinate Grid**: Subtle coordinate grid underlay inspired by WebGemma navigation canvas.
- **Exploration Radar Fog**: Unrevealed tiles present a calm, muted exploration field with micro-dot grid alignment.
- **Illuminated Explorer**: Tactical beacon with an outer ambient pulse ring, an obsidian core disc with signal accent rim, directional movement arrow, and radiant core.
- **Crystalline Echo Shards**: Multifaceted crystalline diamonds with luminous internal facets and high-contrast centered numerals.
- **Sentinel Wardens**: Sleek geometric sentinel drones featuring distinct tactical state visors:
  - `patrol`: Steady circular optical sensor sweep.
  - `hunt`: Sharp dual alert visors.
  - `intercept`: Tactical horizontal bracket visor.
  - `lured`: Concentric acoustic disturbance resonance rings.
- **Gate Portals**: Vaulted architectural portals with threshold energy filaments, transitioning from locked iron to energetic signal green, or Warden coral red when sealed.

## Operations Dashboard Architecture

The operations cockpit provides staff with dense, clean telemetry:
- **Command Cockpit**: Sticky floating navigation header with clear route breadcrumbs and status indicators.
- **Responsive Nav Rail**: Clean horizontal scrolling rail on mobile, vertical sidebar on desktop with subtle pill badges.
- **KPI Metric Tiles**: High-contrast neutral cards with bold tabular figures, subtle borders, and dedicated hero accent.
- **Data Grids**: Full-width responsive tables with horizontal scroll overflow protection, crisp line dividers, and alternating hover feedback.

## Hallmark Anti-Slop & Craft Invariants

- **Banned**: AI purple/blue neon glows, generic radial spotlights, 4px thick 1-sided borders.
- **Banned**: Eyebrows/kickers floating directly above section headings.
- **Banned**: Cliché 3-equal-card horizontal feature grids without functional differentiation.
- **Banned**: Nested cards inside cards.
- **Banned**: Pure black (`#000000`) or unstyled raw browser defaults.
- **Banned**: Animating layout dimensions (`width`, `height`, `margin`, `padding`).

## Canonical Export

`tokens.css` is the canonical design token export. All app surfaces and admin views consume its custom properties.
