---
title: Coastline contrast and the integer device-pixel pattern tile
category: frontend
trigger: "board hatch shimmers or the coastline fades against land or water"
---

# Coastline contrast on the Popup board

ADR 0067 replaced the ADR 0066 forms that this note described: the hatch, the edge walk,
and the Fog dot pattern. The board has no pattern tile now.

## What stays true

- Only the Coastline carries the Land boundary contrast. It is the ink outline of each
  Land card, and it holds 3:1 against a Passage and the Fog. The Land lip is texture.
- A stroke or a fill that must stay sharp snaps to whole device pixels. A fractional
  device ratio puts lines on half pixels, so the lines blur and move between paints.

## Where the rules live

- Forms and tokens: `docs/adr/0067-popup-board-paper-forms.md` and `design.md`
  (Labyrinth canvas).
- Contrast pairs: `tests/popup-contrast.test.js` and the pair matrix in
  `tests/canvas-renderer.test.js`.
- Check a new board colour against the Passage and the Fog at 3:1 in light, Night, each
  palette mode, and strong contrast.
