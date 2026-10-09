---
title: Region theme overrode the ivory passage token
category: frontend
trigger: "Labyrinth passages render mint instead of ivory"
---

# Region theme overrode the ivory passage token

## Problem

The Field Journal canvas must draw passages in ivory. The first Region drew them mint.

## What did not work

The US-08.1 test read `tokens.css` alone and found the ivory `--color-passage` value. The test passed while the page showed mint.

## Root cause

`[LOGIC/BOUNDARY]` `src/game/region-theme.css` set `--color-passage` on the Region scope. The scope rule beat the `:root` token. A test that reads one file cannot see an override in another file.

## Fix

Delete the rule and the `--color-tile-*` tokens. The Region theme now sets only the Region Hue values. A test asserts that `region-theme.css` never sets `--color-passage`.

## Prevention

Test a token against every stylesheet that can set it, not only the file that defines it.
