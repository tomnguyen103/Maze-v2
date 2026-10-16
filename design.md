---
stitch-project: 3244739478942983822
---

# Design - Echo Maze

Echo Maze uses the Pilot Chart identity. The product looks like a nautical pilot chart
on white chart paper. Land is buff, water is blue, every line and every word is black
ink, and magenta marks only the lights: Pulse, the Signal Bell, and a caution. The
Explorer reads the board the way a navigator reads a chart. Decoration supports reading
and movement. It never competes with the Labyrinth or the Warden Question.

## Genre and atmosphere

- **Genre**: pilot chart on white paper with black type, buff land, blue water, and
  magenta lights.
- **Atmosphere**: calm chart table, balanced (density 6, variance 5, motion 3).
- **Surfaces**:
  - Landing: one free action, a real gameplay crop in a chart frame, and the price line.
  - Play: one reading order. The Readout sits above the board. The Action rail sits
    under it. The Title block sits under the rail. The Chart notes sit beside the board
    on a desktop and under it on a phone.
  - Atlas: drawn territories with dashed trails and landmark stamps.
  - Dialogs: one decision per view on a solid panel.
  - Admin and Class: solid headers and an underline tab strip.

## Palette

Light is the default. Night keeps the same structure on a dark chart ground.
Every colour is an `oklch()` token in `tokens.css`. Components use no raw hex or rgb
values. The three water screens are literal values in each block, never aliases.

| Role | Light | Night |
| :-- | :-- | :-- |
| Paper | `oklch(99% 0.004 95)` | `oklch(21% 0.012 250)` |
| Stone | `oklch(100% 0 0)` | `oklch(23% 0.012 250)` |
| Ink | `oklch(18% 0.012 250)` | `oklch(95% 0.006 95)` |
| Muted ink | `oklch(38% 0.014 250)` | `oklch(78% 0.01 250)` |
| Signal (lights) | `oklch(70% 0.2 340)` | `oklch(70% 0.2 340)` |
| Signal deep (text) | `oklch(47% 0.22 340)` | `oklch(78% 0.17 340)` |
| Water 1 | `oklch(95.5% 0.022 232)` | `oklch(27% 0.035 232)` |
| Land | `oklch(92% 0.045 85)` | `oklch(36% 0.04 85)` |

- **Lights**: the Signal fill carries the Pulse button, the Signal Bell, and a caution.
  Its label is accent ink. Nothing else is magenta.
- **Action fill**: the primary button fills with ink and sets its label in paper.
- **Water screens**: three blue screens, light to deep, rank the Readout, the Chart
  notes, and the Atlas bands. Each screen keeps ink and muted ink at 4.5:1.
- **Region Hues**: the Atlas territories keep their five hues as restrained washes.
- **Warden and Gate marks**: ink marks. No mark depends on colour alone.
- **Theme**: the Theme Choice applies light, Night, or system. Every `theme-color` meta
  carries the paper colour of the active theme.

## Contrast

- Text pairs reach at least 4.5:1 in light and Night: ink on paper, stone, and the
  water screens; accent ink on Signal; and the Signal deep text on paper.
- Non-text parts reach at least 3:1: focus rings, control edges, walls against
  passages, and the Constellation tiles on the night ground.
- A colour mix uses `in oklab`.

## Typography

- **Display**: Archivo (variable width), 700. It sets the wordmark, the page h1, and the
  dialog headings.
- **Body and UI**: Atkinson Hyperlegible Next, 400 to 700. Body text is 16px with a
  line height of 1.5.
- **Geist Mono**: the Readout numbers, seeds, code, and IDs only. Monospace never
  labels a control or a section.
- **Section labels**: 12px, 700, uppercase, with wide tracking. A label names a group.

## Shape and spacing

- Use the 4-point spacing scale from `tokens.css` (`--space-1` to `--space-16`).
- Touch targets are at least 40px by 40px. Controls keep 8px between them.
- The mobile breakpoint is 768px. On a portrait phone the board fills the width at 768px
  and below. The two-column play layout collapses at 48rem.
- Buttons use a 4px radius. Panels use a 1px ink border and no shadow.
- Headers are solid and opaque. A header has no blur and no translucent fill.
- Dashboard tab strips use an underline. The active tab shows a Signal underline.

## Play screen

- **Readout**: Time, Moves, Echoes, and Vitality in Geist Mono, divided by hairlines,
  with the Warden mode beside them. The Warden mode row changes its mark, not only its
  colour, for Patrol, Hunt, Intercept, and Lured.
- **Action rail**: Pause, the touch controls, and the Pulse light. On a phone the rail
  takes a two-column grid: the direction pad left, Pause and Pulse right.
- **Title block**: the Quest Level, the Labyrinth number and stage, the save state, the
  player console, and the seed.
- **Chart notes**: the objective, the adventure log, the map marks legend, and the
  field note as ruled rows.

## Atlas

- The Atlas draws five territories as inline SVG. Each territory fills with its Region
  Hue wash.
- Dashed trails join the landmarks. Landmark stamps mark each completed Labyrinth.
- Gate flags mark each Gate Warden milestone.
- Any two territory fills differ. Each fill keeps 3:1 against the Atlas ground.
- An unknown Region id draws the neutral wash.

## Labyrinth canvas

- **Passage tiles**: chart paper with an ink hairline.
- **Walls**: a hatched ink wall.
- **Fog**: a stippled fog over unknown tiles.
- **Wardens**: four marks, each with its own silhouette.
  - Patrol: a round mark.
  - Hunt: a pointed mark.
  - Intercept: a chevron.
  - Lured: a ringed mark.
- Maze geometry, rulesets, and `echo-bridges-v1` never change.

## Motion

- The landing trail draws once through `stroke-dashoffset`. No other motion plays on
  the landing.
- A collision recoils the board once for 240ms.
- Under `prefers-reduced-motion: reduce`, every animation runs in 0.01ms.
- No animation changes a layout property.

## Banned

- A cream or ivory tint on the paper.
- Magenta on anything that is not a light.
- Italic accent words.
- Labels that number sections 01, 02, or 03.
- Monospace labels.
- Pill buttons.
- Glass blur.
- Nested cards.
- Drop shadows on panels.
- Pure black (`#000000`).

## Invariants

| ID | Rule |
| :-- | :-- |
| I1 | Theme Choice values and the storage key stay unchanged. |
| I2 | The three bar-colour copies stay equal. |
| I3 | Maze geometry, rulesets, and `echo-bridges-v1` stay unchanged. |
| I4 | Text contrast is at least 4.5:1, and non-text contrast is at least 3:1, in light and Night. |
| I5 | Split sheets import only from the lazy game entry. |
| I6 | Touch targets are at least 40px, body text is 16px, and the mobile breakpoint is 768px. |
| I7 | Monospace appears for the Readout numbers, seeds, code, and IDs only. |

## Canonical export

`tokens.css` is the canonical token export. Every app surface and the dashboards use its
custom properties.
