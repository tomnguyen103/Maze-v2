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
