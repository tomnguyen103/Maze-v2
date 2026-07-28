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
| Explorer Access Settings | `explorer_access_settings` | four presentation-only booleans + optimistic revision |
| Classroom Memberships | `classroom_memberships` | Clerk membership id, Classroom id, and Teacher/Student role |

Guests keep Explorer Access Settings only on their device. Signed-in Explorers
sync the same four presentation-only choices to their profile. They never enter
Run, Quest, score, Question, or shared-link state.

## Export (`GET /api/me/export`)

- Auth required; metered at 2/hour (`export.self` budget); audited as
  `export.self`.
- Returns a versioned envelope conforming to the checked-in contract
  `shared/export-schema.json` (structurally pinned by unit test — the schema
  file itself documents per-section constraints for external consumers):
  `{ "schema": "echo-maze-export/2", "generated_at": …, "data": { … } }`,
  served with `Content-Disposition: attachment`.
- Every query binds the requesting user id — the builder cannot return
  another Explorer's rows. Classroom Memberships and Personal/Class Play
  Quest Progress and Lantern Journals are included; the snapshot selects each
  database-authoritative Classroom context in turn.
- The admin variant, `GET /api/admin/users/:id/export`, reuses the same builder
  under the `export:any` permission, audited as `export.admin` with the target
  Explorer as the resource. Admin-only: a moderator holds `users:read` but not
  `export:any` and gets 403. Unmetered: the grant is a trusted role and every
  call leaves an audit row naming actor and target. Worth revisiting when phase
  7 adds more routes that read another Explorer's rows — today this is the only
  one, so a stolen admin session is the threat the audit trail is there for.

## Deletion

Clerk account deletion (webhook `user.deleted`, or the operational tool
`scripts/delete-user-data.mjs`) removes the whole identity;
`deleted_user_tombstones` keeps only a SHA-256 hash so a re-delivered webhook
stays idempotent. Deletion then export yields empty sections — the export
endpoint deliberately does not error for a deleted or empty account.
The deletion transaction explicitly removes and verifies the signed-in
Explorer Access Settings and Classroom Membership records.
Removing one Classroom Membership also removes that Explorer's Quest Progress
and Lantern Journal for that Classroom; Personal Play remains.

## Retention

- Webhook inbox payloads are cleared on successful processing;
  `npm run webhooks:prune` bounds how long a dead delivery can hold one.
- Rate-limit counters are dead weight after their window;
  `npm run prune:rate-limits` clears them.
- Audit rows are append-only by design (tamper-evident chain, ADR 0013) and
  store a daily-rotating address hash, never a raw address.
- A daily HMAC over the audit chain position is stored in a separately
  credentialed S3-compatible Object Lock bucket. The checkpoint contains only
  schema/version metadata, time, maximum audit id, row hash, and signature; its
  compliance retention period is deployment-configured.
- The Lantern Journal is clearable by the Explorer in-game at any time.
