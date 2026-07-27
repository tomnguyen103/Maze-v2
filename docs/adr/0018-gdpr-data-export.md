# 0018 — Explicit-column personal data export

- Status: accepted
- Date: 2026-07-27
- Phase: enterprise hardening, phase 6

## Context

Deletion has existed since the Clerk webhook work
(`server/user-deletion-store.js`); this phase completes the data-rights pair
with a self-service export. Constraints: the Vercel Hobby function ceiling is
spent (no `api/me-export.js` file), and the product's privacy posture is data
minimisation for a child audience.

## Decision

- **`server/data-export.js` names every exported column explicitly** instead
  of `SELECT *`: an export must never grow a column just because a migration
  added one. Deliberately excluded: `idempotency_key` (client dedup token,
  not player data). `user_roles` and `score_entries` are included beyond the
  plan's list because the acceptance criterion is "every user-owned table
  represented".
- **Every query binds the requesting user id**, so the builder is structurally
  unable to leak another Explorer's rows; a deleted account yields empty
  sections, not an error.
- **`GET /api/me/export`** dispatches inside the player API behind Clerk
  auth, metered by the phase 3 `export.self` budget (2/hour), audited as
  `export.self` with the audit write sequenced *before* the body is sent, so
  a served export always has its audit attempt behind it. The recorder keeps
  phase 1's never-throw contract: a failed audit write is logged and counted
  rather than blocking the export.
- **Vercel routing** rewrites `/api/me/export` onto the `profile` function
  with a validated `_meRoute` parameter (the `api/admin.js` discipline).
- **`shared/export-schema.json`** is the checked-in contract; the unit test
  asserts the builder's sections and the schema's required sections are the
  same set, so they cannot drift apart silently.

## Consequences

- Explorer Access Settings do not appear in the export: they are
  device-local and never reach the server. Documented in the schema and
  `docs/data-privacy.md` rather than faked with an empty section.
- The export contains Stripe identifiers (session, payment intent, price).
  They are the account holder's own transaction references; no card data
  exists anywhere to leak.
- Phase 7's admin export reuses `buildUserExport` unchanged under
  `export:any` / `export.admin`.
