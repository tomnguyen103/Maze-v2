# 0045: Version Quest content through authored content packs

- Status: Accepted
- Date: 2026-08-02

## Context

Quest II: Living Regions adds a second authored content programme without
changing the deterministic maze engine, Warden rules, paid-access boundary,
or the existing Quest progress and offline-continuity contracts. The existing
Quest identity is already carried by `questId` through local progress, cloud
boundaries, Run records, and signed offline receipts. Adding a separate
database column or a second Run engine would create another identity seam for
the same player-visible Quest.

Quest II must provide five region arcs, four Labyrinth beats per region,
reviewed Warden content, deliberate escalation, Quest-wide uniqueness, and
authored storylets tied to gameplay. Child-facing content must remain static
and reviewed; providers may not invent new questions or story text.

## Decision

1. A Quest content pack is selected by the versioned namespace of the existing
   opaque `questId`. Existing `quest_*` and legacy IDs remain Quest I. Quest II
   IDs use the `quest_ii_*` namespace and continue to satisfy the current
   progress, cloud, share, and offline receipt validators.
2. `createRun` and `applyAction` remain the only maze simulation boundary.
   Quest II reuses the current five difficulty bands, region Trail Twists,
   Warden combat, Hint/Skip economy, and Run ruleset revisions.
3. The Quest II content catalog is a local, reviewed module. It owns region
   arc metadata, the twenty storylets, pacing stages, and the reviewed Warden
   question cards. The question service selects this catalog before external
   providers or database fallback when the request belongs to Quest II.
4. Every Quest II Labyrinth uses one authored storylet beat: `arrival`,
   `variation`, `escalation`, or `gate`. The beat is selected from the region
   and Labyrinth number, and its text is rendered through the existing story
   log/Atlas presentation surfaces.
5. A completed Quest I starts the next normal Quest as Quest II. An incomplete
   or recovered Quest preserves its existing content-pack namespace. After
   Quest II is complete, starting another Quest begins another Quest II rather
   than silently returning to Quest I.
6. Quest-wide uniqueness is enforced by the existing progress ledger plus
   tests over the complete Quest II catalog. The tests require unique question
   IDs and reviewed revision IDs across all levels, regions, Labyrinths, and
   challenge kinds; they do not expose answers, raw routes, or hidden ability
   scores.

## Consequences

- Existing Quest I progress remains readable without migration.
- Cloud and offline boundaries remain bound to the exact Quest ID; no new
  production migration or live billing action is needed.
- The content catalog carries more authored data, but gameplay code stays
  within the current engine and ruleset contracts.
- Difficulty tuning remains a playtest concern. Any unvalidated pacing target
  is recorded as `[PLACEHOLDER]` until desktop/mobile playtests provide
  evidence.
- Quest II can be reviewed as content and player-path batches independently,
  while the roadmap item is only considered complete after both batches land
  and the full local/browser acceptance gate is green.

## Rejected alternatives

- A new `content_pack` database column: unnecessary schema and migration risk
  when the existing opaque Quest identity already scopes all relevant data.
- A second maze engine or regional rules mode: duplicates the deterministic
  contract and makes replay/offline compatibility harder to prove.
- Runtime AI-authored questions or storylets: conflicts with the roadmap's
  reviewed-content and child-safety boundary.
