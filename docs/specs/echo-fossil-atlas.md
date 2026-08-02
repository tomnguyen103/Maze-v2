# Echo Fossil Atlas ? feature specification

Status: ready for implementation, PR batch D  
Roadmap: P1.1 Echo Fossil Atlas  
Dependency: P0.2 Offline Run Continuity merge

## Player problem and intended feeling

After an Explorer escapes or is defeated, the Atlas should preserve a small,
readable memory of what happened. The intended feeling is ?my journey mattered,?
not ?the game is grading me? or ?I earned a new resource.?

## Scope

For the active Personal Quest, create one reviewed Echo Fossil for each terminal
Labyrinth outcome. Show the fossil stamp and note on that Atlas landmark. Keep
the data local for guests and account-scoped for signed-in Explorers. Sync the
normalized collection only at the existing Labyrinth boundary and include it in
export and deletion verification.

Out of scope: Classroom Play fossils, historical Quest archives, currencies,
inventory, rewards, answer history, route playback, hidden adaptation, score
changes, live Run synchronization, and generated content.

## Contract

```json
{
  "version": 1,
  "fossilId": "fossil_<uuid>",
  "questId": "quest_<opaque-id>",
  "labyrinthNumber": 4,
  "atlasRegionId": "foundation",
  "regionMotif": "Lantern moss and quiet stone",
  "journeyState": "gate-milestone",
  "wardenOutcome": "escaped-the-wardens",
  "fieldNoteId": "foundation-escaped-v1",
  "fieldNote": "The first Gate Warden yields to a steady trail.",
  "visualStampId": "foundation-lantern-mark"
}
```

`journeyState`, `wardenOutcome`, `fieldNoteId`, `fieldNote`, and
`visualStampId` are allowlisted reviewed values derived from the region,
Labyrinth Number, and terminal outcome. No browser-supplied copy is trusted.
The collection is limited to 40 fossils per Quest and the same `fossilId` is
idempotent.

## Acceptance criteria

1. A terminal Personal Labyrinth creates exactly one normalized fossil for an
   escape or defeat, while First Light and Daily runs create none.
2. The fossil catalog covers all five Atlas Regions, both terminal outcomes,
   ordinary Labyrinths, Gate Warden milestones, and the final Quest state.
3. Reopening the Atlas shows a fossil stamp and reviewed note only on the
   matching completed landmark; incomplete landmarks never expose a fossil.
4. Projection and rendering never mutate Quest Progress, Journal, Run Record,
   Run Replay, score, Run Access, or hidden maze state.
5. Falsified or malformed fossil payloads are rejected locally and server-side;
   accepted payloads contain no prompt, selected option, Question ID, route,
   timer, Vitality, score, or ability field.
6. Guest and account fossil storage are isolated. Selecting an account can
   migrate guest fossils once, and sign-out prevents the next identity from
   reading the prior account's collection.
7. A terminal boundary queues the fossil collection with Quest Continuity. A
   retry is idempotent; cloud conflict unions distinct fossil IDs and never
   silently replaces Quest Progress.
8. Export contains the normalized Fossil Collection, and account deletion
   verifies its removal. A storage or network failure leaves play usable and
   gives an honest Atlas status.
9. Unit, route/store, migration, export/deletion, desktop/mobile, keyboard,
   and reduced-motion checks pass, with the game bundle remaining within its
   current budget.

## Implementation decisions

| Question | Decision | Source |
| --- | --- | --- |
| What is remembered? | Reviewed coarse terminal outcome, not learning or route detail | P1 roadmap; ADRs 0010, 0027, 0028 |
| Where does it live? | Current Quest Fossil Collection projected into Atlas | CONTEXT; ADR 0008; ADR 0039 |
| How is content authored? | Bundled allowlisted catalog with immutable payload text | Child-safe reviewed-content contract |
| When does cloud write happen? | Existing Labyrinth terminal boundary only | ADR 0009; current Quest continuity controller |
| How are conflicts handled? | Union by fossil ID; Quest Progress keeps its existing conflict rules | Existing continuity pattern |
| What blocks play? | Nothing; persistence failures are visible but non-blocking | Design system and existing local-storage behavior |

## Verification plan

- Red-to-green unit tests for catalog normalization, projection, lifecycle,
  account isolation, and boundary queue behavior.
- Route/store/migration tests for allowlisting, idempotence, tenant binding,
  export, and deletion verification.
- Browser tests for an escaped and defeated landmark, reload, account switch,
  keyboard selection, narrow layout, and reduced motion.
