---
stitch-project: 3244739478942983822
---

# Design - Echo Maze

Echo Maze is a bright, playful journey. The player walks a Labyrinth of small islands,
lights Echoes, and outwits friendly Wardens. The look follows the WebGemma journey
reference (https://web-gemma.vercel.app/): sky-tinted grid paper, soft pastel colour
fields, floating islands joined by rope bridges, and white panels with clear type.
Decoration supports reading, movement, and Warden Challenges. It never competes with them.

## Genre and atmosphere

- **Genre**: storybook journey map with a calm study-desk workbench.
- **Atmosphere**: daily app, balanced (density 6, variance 6, motion 4).
- **Surfaces**:
  - Landing: one journey hero on grid paper with an island-path illustration.
  - Game workbench: header, tinted card rail, the Labyrinth in a white panel, and a quiet adventure log.
  - Echo Atlas: a journey map. Each Atlas Region is an island in its own hue.
  - Dialogs: one decision per view in a white panel.
  - Dashboard and Classroom: tinted metric cards, white table panels, and a pill section strip.

## Theme and surfaces

Light is the default. Night keeps the same hues on a deep night-blue ground.

**Light**
- **Paper**: sky-tinted paper (`oklch(98.5% 0.008 230)`) with a 24px grid-paper pattern (`--color-paper-grid`).
- **Stone**: white panel (`oklch(100% 0 0)`) with a 1px slate border (`--color-line-soft`).
- **Ink**: slate ink (`oklch(27% 0.035 257)`). Muted ink is slate-500.
- **Primary (sky)**: `oklch(68.5% 0.169 237)`. Deep sky (`oklch(50% 0.15 242)`) carries text on paper.
- **Pastel fields**: sky, mint, pear, and lilac blobs on the landing and the Atlas only.
- **Region hues**: Mosslight Grove mint, Windcall Ridge sky, Sunspan Crossing amber,
  Tideglass Reach indigo, Bellroot Summit pink.
- **Tinted card**: the hue at 9% on the background, 44% on the border, and a soft hue shadow (`--region-*`).
- **Warden**: coral (`oklch(58% 0.2 24)`). **Gate**: leaf green (`oklch(54% 0.14 155)`).

**Night**
- **Paper**: night blue (`oklch(16% 0.03 262)`). The header is glass at 85% with a blur.
- **Stone**: raised night panel (`oklch(21% 0.03 262)`).
- **Ink**: cool white (`oklch(96% 0.01 240)`).
- Cards keep their hue tints. Every text pair clears WCAG AA.

The saved choice sits in `:root[data-theme]`; "system" follows `prefers-color-scheme`.
The header theme button cycles light, dark, and system. All colours flow through
`tokens.css`. Components use no raw hex or rgb values.

## Typography

- **Display**: Bricolage Grotesque Variable, 700. Only the wordmark and the page h1.
- **Body and UI**: Geist Variable, 400 to 650. Body text is 16px with line height 1.5.
- **Numbers**: Geist Mono Variable with tabular numerals for scores, time, seeds, and metrics.
- **Section labels**: 12px, 600, uppercase, wide tracking, slate-500. A label names a group.
  A label never floats above a heading as an eyebrow.

## Shape and spacing

- 4-point spacing scale from `tokens.css` (`--space-1` to `--space-16`).
- Buttons 8px radius. Pill containers and tab strips 12px. Cards and panels 16px.
- Touch targets are at least 44px by 44px with 8px between controls.
- Panels are white with a 1px border and a soft shadow. A card never sits inside a card.
- The primary action is solid sky with white text. A press moves it down 1px.

## Labyrinth canvas

The Labyrinth draws a small island world on a 2D canvas. Geometry and rules never change.
- **Known tiles**: soft rounded island tiles in the region hue.
- **Walls**: raised pastel blocks with a lighter top edge.
- **Fog**: plain paper with a faint grid.
- **Explorer**: a white disc with a sky ring and a small flag.
- **Echo**: a soft lantern dot with its pair number.
- **Trail Twists** (gates, Tide Doors, Windways, Echo Bridges, Signal Bells): flat, friendly
  glyphs. Bridges use a rope-plank pattern.
- **Wardens**: round, friendly creatures. Each mode keeps a distinct mark:
  Patrol has calm eyes, Hunt has narrowed eyes, Intercept has a side dash, and Lured has
  sound rings.

## Dashboard

- A header with the page title, the wordmark, and a pill section strip.
- Metric cards in region hues with tabular numbers.
- White table panels that scroll sideways on narrow screens.

## Hallmark craft rules

- **Banned**: neon glows and generic radial spotlights.
- **Banned**: eyebrows or kickers above section headings.
- **Banned**: grids of three equal cards with no functional difference.
- **Banned**: nested cards.
- **Banned**: pure black (`#000000`) and raw browser defaults.
- **Banned**: animated layout properties (`width`, `height`, `margin`, `padding`).

## Canonical export

`tokens.css` is the canonical token export. Every app surface and the dashboard use its
custom properties.
