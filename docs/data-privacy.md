# Data privacy — deletion, export, retention

Echo Maze is built for children, so the posture is COPPA-minded data
minimisation: store as little as possible, keep it no longer than needed, and
give the account holder both halves of their data rights.

## What the server stores per Explorer

| Section | Table | Notes |
|---|---|---|
| Player Profile | `players` | username + cosmetic palettes only |
| Score Entries | `score_entries` | bounded Run facts, server-recalculated |
| Run Access | `player_access`, `run_access_grants` | free-run counter, membership state, Run Grants |
| Lifetime Membership | `lifetime_purchases` | Stripe identifiers only — no card data ever |
| Quest Continuity | `cloud_quest_progress` | boundary-synced Quest Progress |
| Lantern Journal | `learning_journals` | privacy-minimized outcomes (no prompts, no answers) |
| Role | `user_roles` | absence means `player` |

Explorer Access Settings are device-local presentation preferences and never
reach the server, so they cannot appear in a server-side export.

## Export (`GET /api/me/export`)

- Auth required; metered at 2/hour (`export.self` budget); audited as
  `export.self`.
- Returns a versioned envelope conforming to the checked-in contract
  `shared/export-schema.json` (structurally pinned by unit test — the schema
  file itself documents per-section constraints for external consumers):
  `{ "schema": "echo-maze-export/1", "generated_at": …, "data": { … } }`,
  served with `Content-Disposition: attachment`.
- Every query binds the requesting user id — the builder cannot return
  another Explorer's rows.
- The phase 7 admin variant reuses the same builder under the `export:any`
  permission, audited as `export.admin`.

## Deletion

Clerk account deletion (webhook `user.deleted`, or the operational tool
`scripts/delete-user-data.mjs`) removes the whole identity;
`deleted_user_tombstones` keeps only a SHA-256 hash so a re-delivered webhook
stays idempotent. Deletion then export yields empty sections — the export
endpoint deliberately does not error for a deleted or empty account.

## Retention

- Webhook inbox payloads are cleared on successful processing;
  `npm run webhooks:prune` bounds how long a dead delivery can hold one.
- Rate-limit counters are dead weight after their window;
  `npm run prune:rate-limits` clears them.
- Audit rows are append-only by design (tamper-evident chain, ADR 0013) and
  store a daily-rotating address hash, never a raw address.
- The Lantern Journal is clearable by the Explorer in-game at any time.
