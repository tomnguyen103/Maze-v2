# Test-only revenue boundary

Tag: [LOGIC/BOUNDARY]

## Problem

Stripe test-mode and live-mode objects are separate. A test payment that reaches a
live deployment grants Lifetime access. Before ADR 0047, a stored purchase did not
record its mode, so the mode could not be checked later.

## Boundary

- One deployment runs one Billing Mode. An unset `ECHO_MAZE_BILLING_MODE` means test.
  `server/lifetime-config.js:137-149` refuses a secret key whose prefix does not match
  the mode. It refuses live outside production and without an HTTPS origin.
- Live mode sets Class Expedition billing to null. `server/lifetime-config.js:170`
  never opens an Expedition Session in live mode.
- `server/class-expedition-billing.js:143` refuses a Session whose `livemode` is true.
- `server/lifetime-domain.js:32` returns `mode_mismatch` when the Checkout `livemode`
  differs from the Billing Mode.
- `server/stripe-lifetime.js:102-103` refuses a PaymentIntent whose `livemode` differs.
- `server/lifetime-service.js:216-218` ignores a webhook event of the other mode.
- `db/migrations/0031_billing_mode.sql:2-3` leaves old rows with a NULL mode. Such a row
  grants nothing. Lines 44-47 key the open-purchase index on the mode, with NULL
  counted as `unclassified`.
- `server/lifetime-store.js:46-49` reads open purchases for one mode only.
- `server/admin-store.js:136` counts conversions from live rows only.
- `scripts/classify-lifetime-purchases.mjs:60-94` writes a mode only when the Session
  and the PaymentIntent agree and name each other. An abandoned Checkout has no
  PaymentIntent, so its Session decides when Stripe reports no payment.
- `scripts/classify-lifetime-purchases.mjs:189-199` copies the verified mode onto the
  player projection in the same transaction.
- `server/lifetime-store.js:481-492` counts a NULL-mode row only when it carries a
  Stripe object or a paid status.
- `server/lifetime-store.js:280-285` and `:405-409` let a live event replace a test
  projection and never let a test event replace a live one.
- `server/player-api.js:396-399` counts unclassified rows in live store mode only.
- `server/health-route.js:113-114` marks Stripe failed while unclassified rows exist.

## Verification

Each reference above was read at this commit. Line numbers drift after edits. Re-check
them when you change these files.

## Rule

Every seam that moves money or grants access checks the mode. The seams are Checkout,
PaymentIntent, webhook, store query, and readiness. A new seam checks `livemode`
against the Billing Mode too. Class Expedition billing stays test-only. Do not add a
live Expedition path without a new ADR.
