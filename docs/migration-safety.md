# Migration safety

## The applied boundary

Migrations `0001` through `0017` are applied to the live database. `0018`
through `0029` are authored and tested but not applied
(`docs/roadmaps/echo-maze-current-status.md`).

**Never edit a migration at or below the boundary.** A file that has already
run somewhere is a historical record, not a source of truth you can revise: the
next environment would build a schema that no existing one has. Fix forward in
a new numbered migration instead, even when the change is a one-word
correction.

Files above the boundary may be edited in place, because no database has seen
them yet.

## Locking

A migration that runs against a live table takes locks, and a lock taken for
longer than a request timeout is an outage.

| Statement | Lock | Safe on a live table? |
|---|---|---|
| `CREATE INDEX` | `SHARE` — blocks writes for the whole build | No |
| `CREATE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | Yes |
| `ALTER TABLE … ADD COLUMN` (nullable, no default) | brief `ACCESS EXCLUSIVE` | Yes |
| `ALTER TABLE … ADD COLUMN … DEFAULT` | brief `ACCESS EXCLUSIVE` (PG 11+) | Yes |
| `ALTER TABLE … ALTER COLUMN … SET DEFAULT` | brief `ACCESS EXCLUSIVE` | Yes |
| `ALTER TABLE … ADD CONSTRAINT … CHECK` | `ACCESS EXCLUSIVE` for a full scan | No |
| `ALTER TABLE … ADD CONSTRAINT … NOT VALID`, then `VALIDATE CONSTRAINT` | brief, then `SHARE UPDATE EXCLUSIVE` | Yes |
| `CREATE UNIQUE INDEX CONCURRENTLY`, then `ADD CONSTRAINT … USING INDEX` | `SHARE UPDATE EXCLUSIVE`, then brief | Yes |

"Brief" still means waiting for every open transaction on the table. A single
long-running read holds the queue behind it, and every statement queued behind
an `ACCESS EXCLUSIVE` request waits too. Set `lock_timeout` so a migration
fails fast instead of stalling the API:

```sql
SET lock_timeout = '3s';
```

## `CONCURRENTLY`

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. A migration
file containing one must not be wrapped in `BEGIN`/`COMMIT`, and `psql -1` must
not be used on it.

It can also fail and leave an **invalid** index behind, which costs write
throughput and serves no read. After any interrupted run:

```sql
SELECT c.relname
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid;
```

Drop what it lists — `DROP INDEX CONCURRENTLY <name>;` — and re-run the
migration.

## Quiescing

When a change genuinely cannot be made online, a documented quiesce window is
the alternative — not doing it live and hoping.

1. Announce the window.
2. Stop the writers. On Vercel that is scaling the deployment down or putting
   the API behind a maintenance response; there is no connection drain to wait
   for beyond in-flight requests.
3. Confirm no open transactions remain on the table:
   ```sql
   SELECT pid, state, query_start, left(query, 80)
   FROM pg_stat_activity
   WHERE datname = current_database() AND state <> 'idle';
   ```
4. Apply the migration with a `lock_timeout` set.
5. Restart the writers and verify `/api/ready`.

Write the window into the migration's header comment: how long it needs, what
must be stopped, and what to check before starting.

## Applying

```bash
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f db/migrations/00NN_name.sql
```

`DATABASE_ADMIN_URL` is the owner role. `DATABASE_URL` is the least-privileged
runtime role and cannot apply migrations — deliberately.

Applying to the live database is an authorized operator action. It is not part
of any automated run in this repository.

## What the applied migrations cost, and what to do about it

The A+ audit filed three migrations as unsafe against a live table
(`DB-01`, `DB-02`, `DB-03`). Two of them are below the applied boundary and
therefore cannot be re-authored — rewriting them would change history for
every environment that has already run them. What follows is the record of
what they do, so an operator restoring or rebuilding a populated database
knows what to expect and can quiesce for it deliberately.

### 0014 — Classroom RLS foundation (`DB-01`, applied)

Three plain `CREATE INDEX` statements (`classroom_memberships_user_idx`,
`cloud_quest_progress_classroom_idx`, `learning_journals_classroom_idx`), each
holding `SHARE` — blocking every write to that table — for the duration of the
build. It also adds a `PRIMARY KEY`, two `UNIQUE` constraints and two foreign
keys, all under `ACCESS EXCLUSIVE`, each scanning the table it constrains.

Against the small tables it ran on originally this is instant. Against a
populated `cloud_quest_progress` or `learning_journals` it is a write outage
for the length of the scan.

**Quiesce:** stop the writers, confirm no open transactions on those three
tables, apply, restart. Expect the outage to scale with the row count, not
with the number of statements.

### 0015 — Classroom authority and writes (`DB-02`, applied)

One `ALTER TABLE score_entries` that adds a column, drops a `UNIQUE`
constraint, adds a `UNIQUE NULLS NOT DISTINCT` constraint, and adds a foreign
key — in a single statement, so all of it under one `ACCESS EXCLUSIVE` lock.
The `UNIQUE` builds an index; the foreign key scans to validate. Followed by a
plain `CREATE INDEX score_entries_classroom_idx`.

`score_entries` is written by every escaped Run and read by the anonymous
Global Scoreboard, so this is the worst of the three to apply hot.

**Quiesce:** required. Stop the writers before applying; do not attempt it
behind live traffic.

### 0019 — score entry ruleset partitions (`DB-03`, not applied)

Above the boundary, so it was re-authored in place rather than documented
around. It now uses a batched, committing backfill instead of one unbounded
`UPDATE`, `NOT VALID` constraints validated separately, a validated
`IS NOT NULL` check so `SET NOT NULL` skips its own scan, and
`CREATE INDEX CONCURRENTLY`. **No quiesce window is needed.**

That difference is the whole point of the boundary: 0019 could be fixed, and
0014 and 0015 can only be planned around.

### 0020, 0022 and 0025 — the same defect, found by the guard

`tests/migration-locking.test.js` derives the live tables from the applied
migrations and fails on any unapplied migration that would scan one under
`ACCESS EXCLUSIVE`. Writing it turned up three more instances of `DB-03`'s
defect, all now corrected in place:

- **0020** — an unbounded `UPDATE` plus two unvalidated `CHECK` constraints on
  `cloud_quest_progress`, in one transaction.
- **0022** — an unbounded `UPDATE` plus two unvalidated `CHECK` constraints on
  `explorer_access_settings`, in one transaction.
- **0025** — an unvalidated `CHECK` on `question_versions`.

The guard scopes itself the same way this document does: a constraint on a
table an *unapplied* migration created validates against nothing, so it is not
flagged. Only tables that already have rows count.

What it does not yet catch: a unique index promoted to a constraint by a route
other than `ADD CONSTRAINT ... USING INDEX`, and `ALTER TYPE` on a column of a
live table. Both would need adding if either pattern appears.
