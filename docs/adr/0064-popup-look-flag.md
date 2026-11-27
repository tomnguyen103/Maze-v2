# 0064: Popup Look Flag

- Status: Accepted
- Date: 2026-11-27

## Context

The owner mandate of 2026-11-26 authorises a rebuild of the interface as the Popup look. The Pilot Chart look ships today. The rebuild runs over several slices, and each slice must merge to main with the Pilot look unchanged for players.

## Decision

1. A build-time flag `VITE_LOOK` selects the look. The values are `pilot` (default) and `popup`. Any other value fails the build with a message that names both looks.
2. The alias `@look` points to `src/looks/<look>/`. Each look folder holds `tokens.css`, `fonts.js`, and `surface.css`. The shared sheet `src/daylight.css` imports the tokens and the surface from the alias. `src/app.js` imports the fonts from the alias.
3. The default build is byte-equal to the build before the flag, except for the entry source map, which embeds the edited `src/app.js` text. A SHA-256 manifest of `dist` proves it.
4. The Popup build writes to `dist-look-popup`, so `dist` stays Pilot. `scripts/check-bundle-budget.mjs` measures every budget row in either look.
5. The browser bar colours follow the look. In the Popup build, a Vite plugin reads the `--color-paper` literals from each tokens file. It swaps the Pilot literals for the Popup literals in the `theme-color` meta tags, in `theme-boot.js`, and in `THEME_COLORS` of `src/player/theme.js`. The Pilot sources stay unchanged.
6. The Popup token file maps every Pilot variable name to a Popup value, so the shared rules keep working. Slices R1 and later restyle each surface.
7. At slice R9, the flag, the alias, the plugin, and the Pilot files are removed.

## Consequences

- Two looks coexist until R9. Each push runs the Pilot gate. The Popup leg runs `npm run build:popup` and `npm run check:bundle:popup`.
- `src/game/canvas-renderer.js` keeps its Pilot fallback palette until slice R2 reads the Popup palette.
- A test reads each tokens file by path, so a moved token file needs a test edit.
