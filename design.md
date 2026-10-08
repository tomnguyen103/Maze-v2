---
stitch-project: 754643373869195468
---

# Design - Echo Maze

A locked design system for Echo Maze and its operational dashboard.
Tactile exploration and cockpit precision carry every surface; decoration stays
secondary to reading, movement, telemetry, and Warden Challenges.

## Genre & Atmosphere

- **Genre**: Playful storybook expedition meets modern tactile field-guide cockpit.
- **Atmosphere**: Daily App Balanced (Density 6, Variance 6, Motion 5).
- **Macrostructure family**:
  - App Workbench: Telemetry status deck supports the central fluid Labyrinth playfield.
  - Operations Dashboard: Responsive command cockpit, fluid KPI metric tiles, sticky table views.
  - Dialogs: Focused encounter. One decision per view with no competing actions.
  - Records: Compact field notes. Outcomes remain scannable on narrow screens.

## Theme & Surfaces

Two surfaces, one identity. Warm daylight is the default; night is the same
expedition after dark, lit by deep midnight stone rather than a second design.

**Daylight**
- **Paper**: warm daylight canvas (`oklch(97% 0.018 96)`)
- **Stone**: elevated neutral surfaces (`oklch(99% 0.008 96)`)
- **Ink**: deep charcoal navy (`oklch(20% 0.035 255)`)
- **Lines**: subtle architectural boundaries (`oklch(29% 0.04 252)` and `--color-line-soft`)
- **Signature Accent**: electric pear (`oklch(84% 0.18 108)`). The iconic mark that never shifts.
- **Exploration**: sea-glass cyan (`oklch(61% 0.17 205)`)
- **Danger / Warden**: coral red (`oklch(58% 0.22 24)`)
- **Success / Gate**: leaf green (`oklch(54% 0.14 155)`)

**Night**
- **Paper**: deep midnight navy (`oklch(19% 0.035 255)`) — daylight Ink becomes the surface
- **Stone**: elevated dark panel (`oklch(24% 0.035 255)`)
- **Ink**: warm daylight text (`oklch(95% 0.012 96)`)
- **Signature Accent**: electric pear, unchanged. It is the signature and does not move.
- **Exploration, Danger, Success**: adjusted lightness clearing AA contrast on midnight navy.

Persisted preference via `:root[data-theme="dark"]` and system `prefers-color-scheme`.
All colors flow through `tokens.css`. Raw hex/rgb values in components are forbidden.

## Typography Architecture

- **Display**: Bricolage Grotesque Variable, upright 700–780. Tight tracking (-0.025em to -0.03em).
- **Body**: Geist Variable, 450–700. Clean humanist legibility with line-height 1.5–1.6x. Minimum 16px in decision dialogs.
- **Utility & Data**: Geist Mono Variable, 600–700. Tabular numerals (`font-variant-numeric: tabular-nums`) across all metrics, scores, time, coordinates, and seeds.

## Spacing & Component Geometry

- 4-point spacing scale from `tokens.css` (`--space-1` through `--space-16`).
- Minimum tap targets: 44px by 44px with >= 8px separation between interactive controls.
- Radii: Compact, crisp corner radius system (`--radius-sm: 0.3rem`, `--radius-md: 0.6rem`, `--radius-lg: 0.9rem`, `--radius-pill: 999px`).
- Tactile feedback: Buttons feature active transform press (`transform: translateY(2px)` or `scale(0.98)`).
- Elevation: Crisp, non-blurry borders paired with subtle, grounded offsets (`--shadow-panel`). Zero neon halos.

## Layout Principles & Responsive Strategy

- **Workbench**: Fluid, full-width viewport utilization (`max-w-[1920px]`). Centered arena canvas flanked by telemetry metrics and tactile controls.
- **Dashboard**: Sticky navigation header with breadcrumb hierarchy, horizontal scrolling rail on mobile, fluid grid KPI cards, and full-width data tables with horizontal scroll overflow safety.
- **Responsive Guarantee**: Clean rendering without horizontal document scroll across all 15 edge viewports (2560x1080 ultrawide to 280x653 narrow foldable, landscape mobile, and 250% zoom).

## Hallmark Anti-Slop & Craft Invariants

- **Banned**: AI purple/blue neon glows, generic radial spotlights, 4px thick 1-sided borders.
- **Banned**: Eyebrows/kickers floating directly above section headings.
- **Banned**: Cliché 3-equal-card horizontal feature grids without functional differentiation.
- **Banned**: Nested cards inside cards.
- **Banned**: Pure black (`#000000`) or unstyled raw browser defaults.
- **Banned**: Animating layout dimensions (`width`, `height`, `margin`, `padding`).

## Canonical Export

`tokens.css` is the canonical design token export. All app surfaces and admin views consume its custom properties.
