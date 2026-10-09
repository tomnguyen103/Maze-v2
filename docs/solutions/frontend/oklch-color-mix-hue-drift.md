---
title: color-mix in oklch drifts toward pink when one side is white
category: frontend
trigger: "every tinted tile renders pink"
---

# color-mix in oklch drifts toward pink when one side is white

## Problem

A tile mixed its region hue with the white panel colour. All five tiles came
out pink.

## What did not work

`color-mix(in oklch, var(--island) 14%, var(--color-stone))` with
`--color-stone: oklch(100% 0 0)`.

## Root cause

White has no hue, so its hue is 0. The oklch mix interpolates the hue angle
toward 0, which is pink, for every input hue.

## Fix

Mix in `oklab`, which has no hue angle. Every `color-mix` in `src/daylight.css`
uses it. Use `oklch` only when both sides carry a real hue.
