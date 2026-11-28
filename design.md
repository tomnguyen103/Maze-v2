---
stitch-project: 3244739478942983822
stitch-design-system: a5e0a7aba16145f7b5ebd784c8ee5945
stitch-note: 2026-11-27 | readback drift: the asset still holds the retired look's seed | update_design_system returned "invalid argument" twice with a valid schema | next UI task: call create_design_system with the Popup seed and repoint this key
---

# Design - Echo Maze

Echo Maze uses the Popup identity (ADR 0065). The product looks like a pop-up storybook.
Warm paper holds cards, plum ink draws text and every outline, and coral is the one
accent. The Explorer reads the board as a page of paper tiles and sky flaps.
Decoration supports reading and movement. It never competes with the Labyrinth or the
Warden Question.

## Genre and atmosphere

- **Genre**: pop-up storybook on warm paper, with plum ink outlines, meadow tiles, sky
  flaps, and one coral accent.
- **Atmosphere**: a calm reading table, balanced (density 6, variance 5, motion 3).
- **Surfaces**:
  - Landing: one free action, a real board crop on a paper card, and the price line.
  - Play: one reading order. The Readout sits above the board. The Action rail sits
    under it. The Title block sits under the rail. The Chart notes sit beside the board
    on a desktop and under it on a phone.
  - Atlas: a pop-up book with a stamp sheet and a tunnel book.
  - Dialogs: one decision per view on a paper card.
  - Admin and Class: tokens and fonts only, with no Popup art and no flaps (plan D8).

## Palette

Light is the default. Night is a lamp-lit page with the same structure. Every colour is
an `oklch()` token in `src/looks/popup/tokens.css`. Components use no raw hex or rgb
values. The board art in `src/looks/popup/board-art.js` draws canvas paths, and its
colours stay inside that chunk.

| Role | Light | Night | Token |
| :-- | :-- | :-- | :-- |
| Page ground | `oklch(96.6% 0.024 85.8)` | `oklch(20% 0.05 310)` | `--paper` |
| Card, dialog, Question page | `oklch(98.6% 0.014 84.6)` | `oklch(26% 0.055 310)` | `--card` |
| Text, outlines, Land edges | `oklch(30.5% 0.07 310.3)` | `oklch(95% 0.03 86)` | `--ink` |
| Secondary text | `oklch(44.3% 0.058 311.6)` | `oklch(80% 0.04 86)` | `--ink-soft` |
| Passage tiles, with an ink outline | `oklch(73.4% 0.177 137.9)` | same | `--meadow` |
| Fog flaps | `oklch(75.1% 0.141 241.4)` | same | `--sky` |
| Flap fold edge | `oklch(59.6% 0.126 243.2)` | same | `--sky-deep` |
| Danger and Vitality loss marks only | `oklch(68.5% 0.206 32.5)` | same | `--coral` |
| Coral text, short labels only | `oklch(54% 0.166 32.2)` | `oklch(78% 0.14 32)` | `--coral-deep` |
| Echo, Gate light, Readout bookmarks | `oklch(90.1% 0.106 84.7)` | same | `--sun` |
| Book cover art | `oklch(64.6% 0.109 186.2)` | same | `--cover` |
| Cover text | `oklch(42.6% 0.07 186.8)` | `oklch(80% 0.1 186)` | `--cover-deep` |
| Primary pull-tab fill | `oklch(42.6% 0.07 186.8)` | same | `--cover-fill` |
| Clover body | `oklch(84.4% 0.092 2)` | same | `--clover` |
| Clover scarf | `oklch(69.8% 0.117 185.5)` | same | `--scarf` |
| Fangmoor fur | `oklch(26% 0.086 299.6)` | same | `--fur` |
| Focus ring, 3:1 on paper, card, and cover | `oklch(36% 0.15 285)` | `oklch(95% 0.03 86)` | `--focus` |

- **Semantic names**: the shared rules read `--color-*` names. `tokens.css` maps each one
  to a Popup primitive, for example `--color-ink` to `--ink` and `--color-signal` to
  `--coral`.
- **Coral**: the Signal fill marks Danger and Vitality loss only. Coral text uses
  `--coral-deep` on paper. No text sits on coral.
- **Action fill**: the primary pull-tab fills with `--cover-fill` and sets its label in
  `--color-on-fill`. The danger pull-tab fills with `--color-signal-deep`.
- **Sky screens**: three sky bands, light to deep, rank the Readout, the Chart notes, and
  the Atlas bands. Each band keeps ink at 4.5:1.
- **Region Hues**: each Region keeps its hue as the swatch on its Atlas row.
- **Theme**: the Theme Choice applies light, Night, or system. Every `theme-color` meta
  carries the `--color-paper` value of the active theme.
- **Night**: Night redefines `--paper`, `--card`, `--ink`, `--ink-soft`, `--coral-deep`,
  `--cover-deep`, `--focus`, and the soft tints. `--color-on-fill` stays card cream in
  both modes, and `--cover-fill` stays teal.

### Board marks

The board keeps its light role primitives in Night (`--board-paper`, `--board-ink`), so
a tile reads the same in both modes. Each mark names its token in `tokens.css` and the
ground it sits on. Non-text marks reach 3:1 against that ground, or carry an ink outline
when the fill alone does not. Text reaches 4.5:1.

| Mark | Token | Value | Ground |
| :-- | :-- | :-- | :-- |
| Land | `--color-land` | `oklch(60% 0.12 140)` | none |
| Hatch | `--board-hatch` | `oklch(30.5% 0.07 310.3 / 30%)` | Land |
| Coastline | `--color-coastline` | `--board-ink`, `oklch(30.5% 0.07 310.3)` | Passage and Land |
| Passage | `--color-passage` | `--meadow` | Land |
| Fog | `--color-fog` | `--sky` | none (the Fog dot marks the edge) |
| Fog dot | `--board-fog-dot` | `oklch(30.5% 0.07 310.3 / 75%)` | Fog and Passage |
| Memory dot | `--color-fog-dot` | the Fog dot | Remembered Passage |
| Explorer | `--color-board-explorer` | `--clover`, with a 2px ink outline | Passage |
| Explorer ring (fallback mark) | `--color-board-explorer-ring` | `--board-ink` | Passage |
| Warden | `--color-board-warden` | `--fur` | Passage |
| Danger line | `--color-danger-line` | `--coral`, with an ink outline | Passage |
| Pulse range ring | `--color-pulse` | `oklch(45% 0.13 243 / 30%)` | Passage and Land |
| Echo | `--color-board-echo` | `--sun` | Passage |
| Echo number | `--color-board-echo-text` | `--board-ink` | Echo |
| Gate | `--color-board-gate` | `--sun` | Passage |
| Paused cover | `--color-board-cover` | `--card`, with `--cover-deep` ink | none |

No board mark depends on fill colour alone. Each mark has an ink outline and a shape cue.

## Contrast

The settled bars are 7:1 for body and title text, 4.5:1 for other text, and 3:1 for each
mark and control boundary. `tests/popup-contrast.test.js` computes each pair with the
WCAG 2 formula, in light and in Night.

- Text pairs: ink on paper, card, and sun; ink-soft on paper; cover-deep on card and
  paper; coral-deep on paper for short labels only.
- The pairs that fail alone (coral, meadow, sky, and clover on their grounds) pass only
  with an ink outline.
- The coastline pair: the Coastline in board ink reaches 3:1 or more against the Passage
  and against the Land. The coastline marks the land edge. The hatch on the Land is
  texture and carries no contrast duty.
- Non-text parts reach at least 3:1: focus rings, control edges, and the Constellation
  tiles on the night ground.
- At `prefers-contrast: more`, muted ink, soft lines, the hatch, and the board stipple
  take full ink.
- Under `forced-colors: active`, system colours replace the palette and each mark keeps
  its shape.
- A colour mix uses `in oklab`.

## Typography

- **Display**: Chewy (`@fontsource/chewy`). It sets the wordmark and the scene titles.
  Chewy ships one weight, so `font-synthesis-weight: none` keeps the true glyphs.
- **Body and UI**: Andika (`@fontsource/andika`, weights 400 and 700). Body text is 16px
  with a line height of 1.5. Andika also draws the board Echo digits (ADR 0065).
- **Readout numbers**: Andika at 700 weight with tabular figures (`--font-utility`, plan
  D10).
- **Geist Mono**: seed codes and code text only (`--font-code`, plan D9). Monospace never
  labels a control or a section.
- **Section labels**: 12px, 700, uppercase, with wide tracking. A label names a group.
- **Type floor**: 12px minimum for every text. The Grid reference is the one 10px mark,
  and it is board art, not text a reader must read.
- The fonts are local files. The first paint loads the Latin subset only, and the content
  security policy stays `'self'`.

## Shape and spacing

- **Shell**: a 76rem container and a 64px bar with one ink hairline. The wordmark sits
  left, the route name sits as a quiet tab, and the Theme Choice sits right. The shell
  is the same on every route. The header tab strip replaces a Menu disclosure.
- **Button tiers**: the primary pull-tab fills with `--cover-fill`, the secondary
  pull-tab is a card with an ink outline, and tertiary is an underlined text link. One
  size, one weight, 40px minimum height.
- **Pull-tab**: a 2px ink outline, a 4px ink lift, and `--radius-pull-tab` corners. A
  press flattens the lift to 2px. A pull-tab is a tab shape, not a pill.
- **Paper card**: each dialog and the board panel is a card with a 3px ink outline,
  `--radius-dialog` corners, and the `--paper-lift` shadow.
- **Empty state**: a label, a heading, one sentence, one action, and one Signal light.
  Records and Atlas draw the blank ruled page.
- Use the 4-point spacing scale from `tokens.css` (`--space-1` to `--space-16`).
- Touch targets are at least 40px by 40px. Controls keep 8px between them.
- The mobile breakpoint is 768px. On a portrait phone the board fills the width at 768px
  and below. The two-column play layout collapses at 48rem.
- Tags and badges use a 4px radius and a 1px ink border. Class and Admin share the shell
  bar, the ink borders, and the Button tiers.
- `tokens.css` defines no pill radius.
- Headers are solid and opaque. A header has no blur and no translucent fill.
- Dashboard tab strips use an underline.

| Token | Value | Role |
| :-- | :-- | :-- |
| `--radius-pull-tab` | `0.75rem 0.75rem 0.375rem 0.375rem` | Pull-tab button corners |
| `--radius-dialog` | `1.125rem` | Dialog and board panel corners |
| `--paper-lift` | `0 8px 0 var(--ink), 0 18px 30px oklch(30.5% 0.07 310.3 / 22%)` | Hard ink lift and soft shadow under each paper card |

Surface rules live in `src/looks/popup/surface.css`. They take a `:root` prefix, because
that sheet loads before the daylight and game sheets.

## Play screen

- **Readout**: Time, Moves, Echoes, and Vitality, with the Warden mode beside them. Each
  metric hangs as a bookmark: sun, with `--board-ink` text so it stays dark in Night.
  Vitality takes `--color-signal-deep`. The Warden mode row changes its mark, not only
  its colour, for Patrol, Hunt, Intercept, and Lured.
- **Action rail**: Pause, the touch controls, and the Pulse pull-tab. On a phone the rail
  takes a two-column grid: the direction pad left, Pause and Pulse right.
- **Title block**: the Quest Level, the Labyrinth number and stage, the save state, the
  player console, and the seed.
- **Chart notes**: the objective, the adventure log, the map marks legend, and the
  field note as ruled rows.
- **Legend contract**: the Map marks legend lists each mark that the board can draw. Each
  legend entry uses the colour and the shape of its board mark.

## Atlas

The Echo Atlas is a pop-up book (`src/looks/popup/atlas.css`).

- The map view is a stamp sheet. Each Atlas Region is one row with an index tab, four
  landmark stamps, and a Region Sigil seal.
- Each of the five Atlas node states has one stamp form: completed, current, ahead,
  milestone (a sealed envelope), and completed milestone (a pressed wax seal).
- The open Region sits in a tunnel book of three stacked paper layers.
- On a phone, the cover is a thin edge, each index tab sits on the top edge of its row,
  and the list view shows two stamps per row.
- Fossil, sigil, and state tags are 4px-radius tags with an ink outline. They are not
  pills.
- The territory SVG stays in the markup but is not displayed (`display: none`). Its
  fills stay at 3:1, so it is safe to show again. Any two territory fills differ.
- An unknown Region id draws the neutral wash.

## Labyrinth canvas

- **Passages**: meadow paper tiles on Land that is a darker hedge. The board paints all
  Passages as one meadow fill and draws no outline per tile.
- **Land**: the Land colour with a hatch of 1px ink lines at 45 degrees. The hatch pitch
  is 4px, set in integer device pixels. The hatch is drawn inside each merged wall run.
- **Coastline**: one ink edge where a Passage meets Land (ADR 0066).
- **Fog**: a tile has one of three states.
  - Unknown: the sky Fog fill with a dot stipple from an 8 by 8 pattern tile.
  - Remembered: the Passage or the Land as charted, plus one Memory dot at the tile centre.
    A remembered tile shows no Echo, no Gate, no Warden, no telegraph, and no Danger line.
  - In sight: the Passage or the Land with no dot.
  The Memory dot, not a tint, separates a remembered tile from a tile in sight. The Fog
  layer clips to the known tiles and draws the chart layer inside them.
- **Echo number**: the number draws at 12px or more. On a tile below 24px the board draws
  the plain Echo mark, and the Readout carries the number.
- **Explorer**: the Explorer Figure picked on this device, Clover by default, with an ink
  outline. Run Replay and Echo Postcard draw the picked figure, and Class Play draws
  Clover (plan D14).
- **Wardens**: Fangmoor, the wolf. The eye glow and the eye look show the Mode. A Mode
  badge keeps a shape cue, so the Mode never rests on colour alone: round for Patrol,
  Hunt, and Intercept, each with its own glyph, and a rounded square for Lured. At Bright
  Start Fangmoor shows a closed jaw and a softer eye glow (plan D5).
- **Danger line**: a dotted coral ring around a Warden, under its body.
- **Art fallback**: the figures load as one lazy art chunk. Until the chunk loads, or if
  it fails, the board draws the shape marks: the Explorer ring, and one Warden
  silhouette per Mode (Patrol round, Hunt pointed, Intercept chevron, Lured ringed).
  These marks meet the mark contract, so the Run plays the same.
- **Pulse range ring**: one ring at the Pulse radius around the Explorer. It shows the
  tiles that the Pulse reveals.
- **Paused cover**: a paused board has a full card cover with the deep cover ink. No tile
  shows under the PAUSED band.
- **Forced colours**: under `forced-colors: active` each mark keeps its shape and takes a
  system colour, and the art chunk draws flat with no glow.
- **Tile rule at 375px**: a size 15 board scrolls inside its frame, so a tile is never
  below 24px. The frame follows the Explorer, and a swipe stays a Move.
- The geometry and the rules of a generation 1 revision never change. The geometry and
  the rules of a generation 2 revision freeze at its release.

## Chart devices

Each device keeps its name as the name of what the part does (ADR 0066, plan D15). Only
the form is Popup.

- **Neatline**: a ruled page edge around the board with one 2px tick per tile line, so
  size + 1 ticks per side. The Grid reference sits outside the frame at 10px.
- **Narrow frame**: on a board below 420px the frame keeps a 12px gutter on the top and
  the left. Each tick stays. The Grid reference labels each second tile.
- **Grid reference**: column letters and row numbers that name a tile. It uses
  `--font-utility`, so the board shows no monospace.
- **Title block**: a corner block with two rules. The level and ruleset set in body type.
  The seed and date share one caption line.
- **Scale bar**: the Quest Level ladder on the landing.
- **Ruled ledger**: one 1px ink rule per row, tabular numbers, and a running head per
  band. Records seeds set in Geist Mono. The Journal and Replay pages use the same rows.
- **Stamps**: a stamp per completed Labyrinth. It is filled when complete and dashed when
  ahead.
- **Compass rose**: one, on the landing only.

## Dialog anatomy

- The scrim is `--color-overlay`. The panel is a paper card: a 3px ink outline,
  `--radius-dialog` corners, the `--paper-lift` shadow, and a card fill.
- The header band holds the title in Chewy and one 2.5rem close square.
- The footer is sticky and holds one primary pull-tab.
- Two widths: 36rem and 44rem. Under 768px a dialog is a full-height sheet, and the sheet
  drops the card outline and the lift.
- A load state is an ink skeleton.

## Motion

Popup adds four paper motions in `src/looks/popup/motion.js`. Each one plays once, uses
`ease-out`, never delays the next input, and removes its own element at the end.

| Motion | Trigger | Duration | Easing | Property |
| :-- | :-- | :-- | :-- | :-- |
| Flap ripple | Pulse action | 300ms | `ease-out` | ring transform and opacity |
| Gate pop-up | Gate opens | 240ms | `ease-out` | paper tab `scaleY` and opacity |
| Paper confetti | `escaped` event | 300ms | `ease-out` | 12 pieces, transform and opacity |
| Ceremony pop-up | Sigil Ceremony result | 300ms | `ease-out` | panel `perspective(600px) rotateX(60deg)` to none |

- The motion loads as one lazy chunk. The play screen is complete without it.
- Under `prefers-reduced-motion: reduce` or the reduced effects Access Setting, the game
  does not load the motion chunk, and every CSS animation runs in 0.01ms.
- No animation changes a layout property.

## Banned

- A texture image on the paper. The paper is the token fill only.
- Coral on anything that is not Danger or Vitality loss, and text on coral.
- A glow on any mark or panel, except the Fangmoor eyes and the Gate light. Each glow is
  off under reduced effects, high contrast, and forced colours.
- A soft grey card shadow. A card is flat or lifted with `--paper-lift`, never between.
- Italic accent words.
- Labels that number sections 01, 02, or 03.
- Monospace labels.
- Headline eyebrows and middle-dot meta strings.
- Unicode glyphs or emoji as icons. Icons are drawn marks.
- Pill buttons and pill tags.
- Gradient washes. Fills are flat.
- Glass blur.
- Nested cards.
- Pure black (`#000000`).

## Invariants

| ID | Rule |
| :-- | :-- |
| I1 | Theme Choice values and the storage key stay unchanged. |
| I2 | The three bar-colour copies stay equal: the `theme-color` meta tags, `public/theme-boot.js`, and `THEME_COLORS` in `src/player/theme.js`. Each one equals the `--color-paper` value of its theme. |
| I3 | Each generation 1 revision stays unchanged, and `windways-v1` stays for replay (ADR 0053). Each generation 2 revision (ADR 0054) freezes at slice Z1 of `docs/plans/2026-11-26-premium-rebuild.md`. |
| I4 | Text contrast is at least 4.5:1, and non-text contrast is at least 3:1, in light and Night. |
| I5 | Split sheets import only from the lazy game entry. |
| I6 | Touch targets are at least 40px, body text is 16px, and the mobile breakpoint is 768px. |
| I7 | Monospace appears for seed codes and code text only. The board shows no monospace, and every Readout number uses tabular Andika (plan D9 and D10). |

## Canonical export

`src/looks/popup/tokens.css` is the canonical token export. Every app surface and the
dashboards use its custom properties.
