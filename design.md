---
stitch-project: 3244739478942983822
stitch-design-system: a5e0a7aba16145f7b5ebd784c8ee5945
---

# Design - Echo Maze

Echo Maze uses the Pilot Chart identity. The product looks like a nautical pilot chart
on white chart paper. Walls are hatched ink, water is blue, every line and every word is
black ink, and magenta marks only the lights. The
Explorer reads the board the way a navigator reads a chart. Decoration supports reading
and movement. It never competes with the Labyrinth or the Warden Question.

## Genre and atmosphere

- **Genre**: pilot chart on white paper with black type, hatched ink walls, blue water,
  and magenta lights.
- **Atmosphere**: calm chart table, balanced (density 6, variance 5, motion 3).
- **Surfaces**:
  - Landing: one free action, a real gameplay crop in a chart frame, and the price line.
  - Play: one reading order. The Readout sits above the board. The Action rail sits
    under it. The Title block sits under the rail. The Chart notes sit beside the board
    on a desktop and under it on a phone.
  - Atlas: ruled Region cards with landmark stamps. The Region Hue shows as a swatch on each card.
  - Dialogs: one decision per view on a solid panel.
  - Admin and Class: solid headers and an underline tab strip.

## Palette

Light is the default. Night keeps the same structure on a dark chart ground.
Every colour is an `oklch()` token in `tokens.css`. Components use no raw hex or rgb
values. The three water screens are literal values in each block, never aliases.

| Role | Light | Night |
| :-- | :-- | :-- |
| Paper | `oklch(99% 0.004 95)` | `oklch(21% 0.03 250)` |
| Stone | `oklch(100% 0 0)` | `oklch(23% 0.012 250)` |
| Ink | `oklch(18% 0.012 250)` | `oklch(95% 0.006 95)` |
| Muted ink | `oklch(38% 0.014 250)` | `oklch(78% 0.01 250)` |
| Signal (lights) | `oklch(70% 0.2 340)` | `oklch(70% 0.2 340)` |
| Signal deep (text) | `oklch(47% 0.22 340)` | `oklch(78% 0.17 340)` |
| Water 1 | `oklch(95.5% 0.022 232)` | `oklch(27% 0.035 232)` |

### Board marks

Each mark names its token in `tokens.css` and the ground it sits on. Non-text marks reach 3:1 against that ground. Text reaches 4.5:1. In the normal modes the Fog fill stays close to the Passage, so the Fog dot carries the known/unknown edge at 3:1 against the Passage. In strong contrast the Fog paints flat with no dot, so the Fog fill itself reaches 3:1 against the Passage.

| Mark | Light | Night | Ground |
| :-- | :-- | :-- | :-- |
| Land | `oklch(99% 0.004 95)` | `oklch(21% 0.03 250)` | none |
| Hatch | `oklch(18% 0.012 250 / 30%)` | `oklch(95% 0.006 95 / 30%)` | Land |
| Coastline | Ink | Ink | Passage and Land |
| Passage (water) | `oklch(95.5% 0.022 232)` | `oklch(32% 0.04 232)` | Land |
| Fog | `oklch(99% 0.004 95)` | `oklch(21% 0.03 250)` | none (the Fog dot marks the edge) |
| Fog dot | `oklch(18% 0.012 250 / 80%)` | `oklch(95% 0.006 95 / 70%)` | Fog and Passage |
| Memory dot | Fog dot | Fog dot | Remembered Passage |
| Explorer | `oklch(46% 0.17 250)` | `oklch(74% 0.13 250)` | Land |
| Explorer ring | Ink | Ink | Passage |
| Warden and Danger line | Ink | Ink | Passage |
| Warden telegraph | Ink | Ink | Passage |
| Pulse range ring | Gate | Signal | Passage |
| Echo | `oklch(52% 0.17 250)` | `oklch(74% 0.13 250)` | Passage |
| Echo number | `oklch(100% 0 0)` | `oklch(18% 0.012 250)` | Echo |
| Gate | `oklch(58% 0.24 340)` | `oklch(70% 0.2 340)` | Passage |
| Signal light on the board | Gate | Signal | Passage |
| Signal light on the arch fill | Gate | `oklch(58% 0.24 340)` | White arch fill |

- **Lights**: the Signal fill carries the Pulse button, the Signal Bell, the Gate marks,
  the active tab underline, the saved mark, the success log dot, the landing trail, and a
  caution. The Pulse label is accent ink. Magenta never fills a text, a panel, or a
  button other than Pulse.
- **Action fill**: the primary button fills with ink and sets its label in paper.
- **Water screens**: three blue screens, light to deep, rank the Readout, the Chart
  notes, and the Atlas bands. Each screen keeps ink and muted ink at 4.5:1.
- **Region Hues**: each Region keeps its hue as the swatch on its Atlas card.
- **Warden marks**: ink marks. **Gate marks**: Signal lights. No mark depends on colour
  alone.
- **Theme**: the Theme Choice applies light, Night, or system. Every `theme-color` meta
  carries the paper colour of the active theme.

## Contrast

- Text pairs reach at least 4.5:1 in light and Night: ink on paper, stone, and the
  water screens; accent ink on Signal; and the Signal deep text on paper.
- Non-text parts reach at least 3:1: focus rings, control edges, the Coastline against
  the Passage and the Land, and the Constellation tiles on the night ground.
- The coastline pair: the Coastline in ink reaches 3:1 or more against the Passage and
  against the Land, in light and Night. The coastline marks the land edge. The hatch on
  the Land is texture and carries no contrast duty.
- A colour mix uses `in oklab`.

## Typography

- **Display**: Archivo (variable width), 700. It sets the wordmark, the page h1, and the
  dialog headings.
- **Body and UI**: Atkinson Hyperlegible Next, 400 to 700. Body text is 16px with a
  line height of 1.5.
- **Geist Mono**: the Readout numbers, seeds, code, and IDs only. Monospace never
  labels a control or a section.
- **Section labels**: 12px, 700, uppercase, with wide tracking. A label names a group.
- **Type floor**: 12px minimum for every text. Display tracking has two tokens:
  `-0.02em` above 1.5rem and `0` below. The Grid reference is the one 10px mark and it
  is board art, not text a reader must read.

## Shape and spacing

- **Shell**: a 76rem container and a 64px bar with one ink hairline. The wordmark sits
  left, the route name sits as a quiet tab, and the Theme Choice sits right. The shell
  is the same on every route. The header tab strip replaces a Menu disclosure.
- **Button tiers**: primary fills with ink, secondary outlines in ink, and tertiary is an
  underlined text link. One size, one weight, 40px minimum height.
- **Empty state**: a label, a heading, one sentence, one action, and one Signal light.
  Records and Atlas draw the blank ruled page.
- Use the 4-point spacing scale from `tokens.css` (`--space-1` to `--space-16`).
- Touch targets are at least 40px by 40px. Controls keep 8px between them.
- The mobile breakpoint is 768px. On a portrait phone the board fills the width at 768px
  and below. The two-column play layout collapses at 48rem.
- Buttons use a 4px radius. Panels use a 1px ink border and no shadow.
- Tags and badges use a 4px radius and a 1px ink border. Class and Admin share the shell
  bar, the ink borders, and the Button tiers.
- `tokens.css` defines no pill radius and no drop-shadow token.
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
- **Legend contract**: the Map marks legend lists each mark that the board can draw. Each
  legend entry uses the colour and the shape of its board mark.

## Atlas

- The Atlas shows the Region Hue as the swatch on each Region card. The territory SVG
  stays in the markup but is not displayed (`display: none`), because the polygons read
  as clip-art. The SVG keeps `xMidYMid meet` and its fills stay at 3:1, so it is safe to
  show again.
- The status strip and the toolbar are ruled rows above the map. The pressed toggle fills
  with ink.
- Landmarks are Stamps: a circled number, dashed when ahead, filled with ink when
  complete, and outlined when current. A Gate Warden milestone fills with Signal deep.
- Fossil, sigil, and state tags are 4px-radius tags with an ink outline. They are not pills.
- At 58rem and below the map shows first. The landmark detail is a bottom sheet pinned
  inside the dialog, and its height is at most 16rem or 32dvh.
- Any two territory fills differ. Each fill keeps 3:1 against the Atlas ground.
- An unknown Region id draws the neutral wash.

## Labyrinth canvas

- **Passages**: water passages. Passage tiles fill with the Passage water colour and
  merge into one water shape on hatched land.
- **Land**: the Land colour with a hatch of 1px ink lines at 45 degrees. The hatch pitch
  is 4px, set in integer device pixels. The hatch is drawn inside each merged wall run. Land has no tile outline.
- **Coastline**: one ink line where water meets land.
- **Fog**: a tile has one of three states.
  - Unknown: the Fog fill with 4 to 6% stipple coverage from an 8 by 8 pattern tile.
  - Remembered: the Passage or the Land as charted, plus one Memory dot at the tile centre.
    A remembered tile shows no Echo, no Gate, no Warden, no telegraph, and no Danger line.
  - In sight: the Passage or the Land with no dot.
  The Memory dot, not a tint, separates a remembered tile from a tile in sight.
- **Echo number**: the number draws at 12px or more. On a tile below 24px the board draws
  the plain Echo mark, and the Readout carries the number.
- **Position fix**: the Explorer reads as a ringed mark, not a glowing disc.
- **Danger line**: a dotted ink line around a Warden. Red never marks the board.
- **Wardens**: four marks, each with its own silhouette.
  - Patrol: a round mark.
  - Hunt: a pointed mark.
  - Intercept: a chevron.
  - Lured: a square outline. It shares no shape with the Explorer ring.
- **Warden telegraph**: a dashed ink arrow from a Warden to the tile of its next Move.
  The dash is 4px on and 3px off. The arrow head is solid. The telegraph draws for a
  Warden in sight only.
- **Pulse range ring**: one Signal ring at the Pulse radius, 1.5px wide, around the
  Explorer. It shows the tiles that the Pulse reveals.
- **Paused cover**: a paused board has a full cover in the Fog fill. No tile shows under
  the PAUSED band.
- **Forced colours**: under `forced-colors: active` each mark keeps its shape and takes a
  system colour.
- **Tile rule at 375px**: a size 15 board scrolls inside its frame, so a tile is never
  below 24px. The frame follows the Explorer, and a swipe stays a Move.
- The geometry and the rules of a generation 1 revision never change. The geometry and
  the rules of a generation 2 revision freeze at its release.

## Chart devices

- **Neatline**: 1px ink around the board with one 2px tick per tile line, so size + 1 ticks per side. The Grid reference
  sits outside the frame in 10px Geist Mono.
- **Narrow frame**: on a board below 420px the frame keeps a 12px gutter on the top and
  the left. Each tick stays. The Grid reference labels each second tile.
- **Grid reference**: column letters and row numbers that name a tile.
- **Title block**: a corner block with two rules. The Labyrinth number sets in Archivo.
  The level and ruleset set in body type. The seed and date share one caption line.
- **Scale bar**: the Quest Level ladder on the landing.
- **Ruled ledger**: one 1px ink rule per row, tabular numbers, and a running head per
  band. Records seeds and counts set in Geist Mono. The Journal and Replay pages use the
  same rows.
- **Stamps**: a circled number per completed Labyrinth. It is filled when complete and
  dashed when ahead. A Signal flag marks a Gate Warden.
- **Compass rose**: one, on the landing only.

## Dialog anatomy

- The scrim is 55% ink. The panel has a 1px ink border, a 4px radius, no shadow, and a
  paper fill.
- The header band holds the title in Archivo, a Geist Mono reference at right, and one
  2.5rem close square.
- The footer is sticky and holds one primary action.
- Two widths: 36rem and 44rem. Under 768px a dialog is a full-height sheet.
- A load state is an ink skeleton. A Signal dot is the only selected mark.

## Motion

- The landing trail draws once through `stroke-dashoffset`. No other motion plays on
  the landing.
- Board motion is feedback for one action. Each motion plays once, uses `ease-out`,
  and never delays the next input.

| Motion | Duration | Property | Reduced-motion form |
| :-- | :-- | :-- | :-- |
| Explorer Move | 120ms | mark position | the mark jumps to the tile |
| Warden Move | 160ms | mark position | the mark jumps to the tile |
| Fog reveal | 200ms | Fog opacity | the tile shows at once |
| Echo collect | 200ms | mark scale and opacity | the mark disappears at once |
| Pulse range ring | 300ms | ring radius and opacity | a static ring for one action |
| Contact recoil | 240ms | board transform | the Readout Vitality cell inverts for one action |
| Gate open | 300ms | Signal light opacity | the light shows at once |

- Board motion loads as one lazy chunk. The play screen is complete without it.
- Under `prefers-reduced-motion: reduce`, the game does not load the motion chunk and
  every CSS animation runs in 0.01ms.
- No animation changes a layout property.

## Banned

- A cream or ivory tint on the paper.
- Magenta on anything that is not a light.
- Italic accent words.
- Labels that number sections 01, 02, or 03.
- Monospace labels, except the Grid reference.
- Signal-soft panel fills.
- Glows on any mark or panel.
- Rounded wall tiles.
- Red on the board.
- Headline eyebrows and middle-dot meta strings.
- Unicode glyphs as icons.
- Pill buttons and pill tags.
- Glass blur.
- Nested cards.
- Drop shadows on the play screen panels.
- Pure black (`#000000`).

## Popup look (under the look flag)

The Popup look replaces Pilot Chart at slice R9 of `docs/plans/2026-11-27-popup-ui-implementation.md`. Until then both looks ship from one source tree. `VITE_LOOK` selects the look at build time (ADR 0064). Each section above describes Pilot Chart and stays in force for the `pilot` look.

Popup is a pop-up storybook. Warm paper holds cards. Plum ink draws text and every outline. Coral is the one accent.

The Popup token file is `src/looks/popup/tokens.css`. It gives every Pilot variable name a Popup value, so each existing rule keeps working. It adds the primitives in this table. Each colour is `oklch()`.

| Token | Value | Role |
| :-- | :-- | :-- |
| `--paper` | `oklch(96.6% 0.024 85.8)` | Page ground |
| `--card` | `oklch(98.6% 0.014 84.6)` | Card, dialog, Question page |
| `--ink` | `oklch(30.5% 0.07 310.3)` | Text, outlines, Land edges |
| `--ink-soft` | `oklch(44.3% 0.058 311.6)` | Secondary text |
| `--meadow` | `oklch(73.4% 0.177 137.9)` | Passage tiles, with an ink outline |
| `--sky` | `oklch(75.1% 0.141 241.4)` | Fog flaps |
| `--sky-deep` | `oklch(59.6% 0.126 243.2)` | Flap fold edge |
| `--coral` | `oklch(68.5% 0.206 32.5)` | Danger and Vitality loss marks only |
| `--coral-deep` | `oklch(55.9% 0.166 32.2)` | Coral text on paper, short labels only |
| `--sun` | `oklch(90.1% 0.106 84.7)` | Echo, Gate light, Readout ribbons |
| `--cover` | `oklch(64.6% 0.109 186.2)` | Book cover art |
| `--cover-deep` | `oklch(42.6% 0.07 186.8)` | Cover text in light mode |
| `--cover-fill` | `oklch(42.6% 0.07 186.8)` | Primary pull-tab fill in both modes |
| `--clover` | `oklch(84.4% 0.092 2)` | Clover body |
| `--scarf` | `oklch(69.8% 0.117 185.5)` | Clover scarf |
| `--fur` | `oklch(26% 0.086 299.6)` | Fangmoor fur |
| `--focus` | `oklch(36% 0.15 285)` | Focus ring, 3:1 on paper, card, and cover |

Night is a lamp-lit page. The page is deep plum (`oklch(20% 0.05 310)`), the card is a lighter plum, and the ink is cream (`oklch(95% 0.03 86)`). Night redefines `--paper`, `--card`, `--ink`, `--ink-soft`, `--coral-deep`, `--cover-deep`, `--focus`, and the soft tints. The board keeps its light role primitives (`--board-paper`, `--board-ink`), so a tile reads the same in both modes. `--color-on-fill` stays card cream in both modes, and `--cover-fill` stays teal.

The settled contrast bars are 7:1 for body and title text, 4.5:1 for other text, and 3:1 for each mark and control boundary. `tests/popup-contrast.test.js` computes each pair with the WCAG 2 formula, in light and in Night. The pairs that fail alone (coral, meadow, sky, and clover on their grounds) pass only with an ink outline. No board mark depends on fill colour alone.

At `prefers-contrast: more`, muted ink, soft lines, and board stipple take full ink. Under `forced-colors: active`, system colours replace the palette and each mark keeps its shape.

The fonts are local files. Chewy (`@fontsource/chewy`) draws the wordmark, scene titles, and board Echo digits. Andika (`@fontsource/andika`, weights 400 and 700) draws body text. Geist Mono stays for seed codes and Run ids. The first paint loads the Latin subset only, and the content security policy stays `'self'`.

Popup keeps the Pilot radius, spacing, and motion tokens until slice R1 sets the tile, dialog, and pull-tab radius tokens and the single paper-lift token.

## Invariants

| ID | Rule |
| :-- | :-- |
| I1 | Theme Choice values and the storage key stay unchanged. |
| I2 | The three bar-colour copies stay equal. |
| I3 | Each generation 1 revision stays unchanged, and `windways-v1` stays for replay (ADR 0053). Each generation 2 revision (ADR 0054) freezes at slice Z1 of `docs/plans/2026-11-26-premium-rebuild.md`. |
| I4 | Text contrast is at least 4.5:1, and non-text contrast is at least 3:1, in light and Night. |
| I5 | Split sheets import only from the lazy game entry. |
| I6 | Touch targets are at least 40px, body text is 16px, and the mobile breakpoint is 768px. |
| I7 | Monospace appears for the Readout numbers, seeds, code, and IDs only. The Grid reference is the one board exception. |

## Canonical export

`src/looks/<look>/tokens.css` is the canonical token export of each look. Every app surface and the dashboards use its
custom properties.
