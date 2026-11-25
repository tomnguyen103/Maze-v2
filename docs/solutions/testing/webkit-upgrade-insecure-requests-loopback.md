---
title: WebKit e2e fails because the preview sends upgrade-insecure-requests
category: testing
date: 2026-11-25
---

# WebKit e2e fails because the preview sends upgrade-insecure-requests

## Symptom

The Playwright suite passes in Chromium. In WebKit and on the iPhone project,
almost every test fails. Each subresource request goes to
`https://127.0.0.1:4173/...` and fails with "SSL connect error".

## Root cause

`vite preview` runs with `NODE_ENV=production`. The security headers middleware
then sent `upgrade-insecure-requests` and HSTS on every response, also over plain
HTTP. Chromium and Firefox exempt loopback from the upgrade. WebKit does not.

## Fix

`createSecurityHeadersMiddleware` in `server/security-headers.js` picks the header
set per request. The HTTPS-only headers go out only when the socket is encrypted or
`X-Forwarded-Proto` is `https`. Vercel serves static headers from `vercel.json`,
which this change does not touch.

## Prevention

Run the e2e suite in WebKit before a merge that changes response headers.
`tests/security-headers.test.js` checks the plain HTTP and the TLS proxy cases.
