---
stitch-project: 3244739478942983822
---

# Design - Echo Maze

Echo Maze uses the Field Journal identity. The product looks like a field atlas drawn on
ivory paper. The Explorer charts a route through an unknown region. Decoration supports
reading and movement. It never competes with the Labyrinth or the Warden Question.

## Genre and atmosphere

- **Genre**: field-journal atlas on ivory paper with charcoal ink and lantern amber.
- **Atmosphere**: calm study desk, balanced (density 6, variance 6, motion 4).
- **Surfaces**:
  - Landing: one free action, a real gameplay crop, and the price line.
  - Play: the Labyrinth board fills the width on a phone. Controls sit below it.
  - Atlas: drawn territories with dashed trails and landmark stamps.
  - Dialogs: one decision per view on a solid panel.
  - Admin and Class: solid headers and an underline tab strip.

## Palette

Light is the default. Night keeps the same structure on a warm charcoal ground.
Every colour is an `oklch()` token in `tokens.css`. Components use no raw hex or rgb values.

| Role | Light | Night |
| :-- | :-- | :-- |
| Ground | `oklch(97.5% 0.012 85)` | `oklch(19% 0.012 65)` |
| Panel | `oklch(99% 0.006 85)` | `oklch(23% 0.012 65)` |
| Ink | `oklch(24% 0.015 60)` | `oklch(94% 0.012 85)` |
| Muted ink | `oklch(42% 0.02 60)` | `oklch(76% 0.015 80)` |
| Action fill | `oklch(78% 0.15 75)` | `oklch(78% 0.15 75)` |
| Action label | `oklch(20% 0.03 60)` | `oklch(20% 0.03 60)` |
| Amber text and focus | `oklch(47% 0.11 65)` | `oklch(82% 0.13 80)` |

- **Region Hues**: Mosslight mint, Windcall sky, Sunspan amber, Tideglass indigo, and
  Bellroot pink. Each hue appears as a restrained wash only.
- **Action edge**: the action fill is pale on the light ground. A charcoal hairline border
  carries the edge to 3:1.
- **Warden and Gate marks**: charcoal ink marks. No mark depends on colour alone.
- **Theme**: the Theme Choice applies light, Night, or system. Every `theme-color` meta
  carries the paper colour of the active theme.

## Contrast

- Text pairs reach at least 4.5:1. Measured values: ink on ground 15.3:1, muted ink on
  ground 7.9:1, action label on action fill 8.9:1, amber text on ground 6.5:1, Night ink on
  ground 15.5:1, and Night amber text on ground 10.5:1.
- Non-text parts reach at least 3:1. Non-text parts include focus rings, control edges,
  and walls against passages.
- A colour mix with a white or hueless side uses `in oklab`.

## Typography

- **Display**: Bricolage Grotesque, 700. It sets the wordmark and the page h1 only.
- **Body and UI**: Geist, 400 to 650. Body text is 16px with a line height of 1.5.
- **Geist Mono**: seeds, code, and IDs only. Monospace never labels a control or a section.
- **Section labels**: 12px, 600, uppercase, with wide tracking. A label names a group.

## Shape and spacing

- Use the 4-point spacing scale from `tokens.css` (`--space-1` to `--space-16`).
- Touch targets are at least 40px by 40px. Controls keep 8px between them.
- The mobile breakpoint is 768px. On a portrait phone the board fills the width at 768px and below. The three-column play layout needs about 58rem, so the shared sheet keeps its single-column collapse at 58rem.
- Buttons use an 8px radius. Cards and panels use a 16px radius.
- Headers are solid and opaque. A header has no blur and no translucent fill.
- Dashboard tab strips use an underline. The active tab shows an amber underline.

## Atlas

- The Atlas draws five territories as inline SVG. Each territory fills with its Region Hue wash.
- Dashed trails join the landmarks. Landmark stamps mark each completed Labyrinth.
- Gate flags mark each Gate Warden milestone.
- Any two territory fills differ. Each fill keeps 3:1 against the Atlas ground.
- An unknown Region id draws the neutral wash.

## Labyrinth canvas

- **Passage tiles**: ivory paper with an ink hairline.
- **Walls**: a hatched charcoal wall.
- **Fog**: a stippled fog over unknown tiles.
- **Wardens**: four marks, each with its own silhouette.
  - Patrol: a round mark.
  - Hunt: a pointed mark.
  - Intercept: a chevron.
  - Lured: a ringed mark.
- Maze geometry, rulesets, and `echo-bridges-v1` never change.

## Motion

- The landing trail draws once through `stroke-dashoffset`. No other motion plays on the landing.
- Under `prefers-reduced-motion: reduce`, the trail shows fully drawn with no animation.
- No animation changes a layout property.

## Banned

- A cream-looking tinted ground beyond the adopted ivory.
- Italic accent words.
- Labels that number sections 01, 02, or 03.
- Monospace labels.
- Pill buttons.
- Glass blur.
- Nested cards.
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
| I7 | Monospace appears for seeds, code, and IDs only. |

## Canonical export

`tokens.css` is the canonical token export. Every app surface and the dashboards use its
custom properties.
