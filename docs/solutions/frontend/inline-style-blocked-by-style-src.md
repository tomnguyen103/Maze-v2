---
title: Inline style attribute in injected SVG breaks the strict CSP
category: frontend
trigger: "territory fills turn black when the server runs without a Clerk host"
---

# Inline style attribute in injected SVG breaks the strict CSP

## Problem

The Atlas set `style="fill: ..."` on each territory path. Vercel allows `'unsafe-inline'`, so the page looked correct there.

## What did not work

The unit test read the `style` attribute from the markup string. The test passed, because no browser enforced the policy.

## Root cause

`[SCHEMA/TOOL]` `server/security-headers.js` sends `style-src 'self'` unless a Clerk host is configured. That policy blocks inline style attributes, including attributes that arrive through `innerHTML`. A blocked path falls back to the SVG default black fill.

## Fix

The markup carries a `data-region` attribute. The CSS holds one fill rule per Region. A test fails on any `style=` in the Atlas markup.

## Prevention

Style injected markup with classes or data attributes. Never write a `style` attribute into HTML that JavaScript builds.
