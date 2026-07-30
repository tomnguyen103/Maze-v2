# Class Expedition License cost model

- Status: documented for Milestone 4; **no USD list price is proposed**
- Scope: one non-recurring Class Expedition License (30 non-recyclable
  assigned seats, four Classroom Run Grants per Student) and one-time 5-seat
  capacity extensions
- Authority: ADR 0030. Live billing remains separately unauthorized; every
  flow in this repository runs in Stripe TEST MODE only.

## What the price must cover

### 1. Payment fees

- Stripe's published standard card fee at the time of writing is
  2.9% + $0.30 per successful charge (US accounts). A low-priced License is
  therefore fee-dominated: at $5.00 the fee is ~8.9%; at $20.00 it is ~4.4%.
- Extensions are five-seat micro-purchases; the $0.30 fixed component argues
  against pricing an extension below a few dollars.
- Full refunds do not return Stripe's fixed fee, so pre-first-seat refunds
  (the only automatic refund class per ADR 0030) carry a small real cost per
  event.

### 2. Database and verification cost

- Per Expedition the durable footprint is bounded and small: one
  `class_expeditions` row, one to a few `class_expedition_licenses` rows, at
  most `30 + 5×extensions` seat rows, and at most four Grant rows per Student
  (~120–160 rows per fully used base License). At Neon/Vercel Postgres
  list rates this is fractions of a cent per Expedition-month.
- Grant issuance and aggregate reads ride the existing pooled serverless
  functions; the marginal compute is negligible against the existing free
  Question/progress traffic of the same Students playing Personal Runs.
- Class Play is not replay-verified (Verified Daily is a separate contract),
  so no per-Run replay compute is attributable to a License today. If a
  future contract adds class replay verification, its measured cost must be
  added here before any price change.

### 3. Support and refund burden

- Purchases are sponsor-initiated and non-recurring: the expected support
  surface is refund-eligibility questions, seat-count questions, and dispute
  handling. The repository surfaces `baseRefundEligible` and
  `extensionRefundEligibleCount` to make support decisions mechanical.
- Disputes never interrupt Class Play (ADR 0030), so each dispute is a pure
  operator cost: the price must absorb an assumed low single-digit dispute
  percentage rather than pushing consequences onto Students.
- Refund policy is enforced operationally: the system records any Stripe
  refund event, but support must only issue refunds while the eligibility
  flags allow it.

### 4. School purchasing friction

- Stripe Checkout supports card payment only in this design. Schools that
  require purchase orders or invoicing cannot complete a card checkout; that
  friction bounds the realistic sponsor audience to teachers and small
  programs unless invoicing is added later.
- In this milestone the purchase route requires Teacher Classroom Membership.
  A non-member "school sponsor" purchase (ADR 0030 allows one) would need a
  support-assisted flow and is deliberately deferred; its handling cost
  belongs in this model when designed.
- Price sensitivity for teacher-out-of-pocket purchases is high; a
  fee-efficient price and a paid-by-school path pull in opposite directions.
  Choosing the point on that curve is a product-owner decision.

## Deliberate non-decisions

- **No USD amount is proposed anywhere in code, copy, or this document.**
  The Stripe test checkout takes its amount from the environment-configured
  test Prices (`STRIPE_EXPEDITION_PRICE_ID`,
  `STRIPE_EXPEDITION_EXTENSION_PRICE_ID`); the ledger stores whatever the
  test checkout charged and constrains only `amount > 0` and `usd`.
- A later list-price change never alters an already purchased Expedition
  (ADR 0030), so the first real price should be set conservatively.

## Preconditions for proposing a price (all must hold)

1. This cost model is reviewed by the product owner.
2. The complete Stripe test-mode flow — purchase, extension, refund,
   dispute — passes, as exercised by the Milestone 4 test suite.
3. Live billing receives separate explicit authorization; nothing in this
   milestone activates it.
