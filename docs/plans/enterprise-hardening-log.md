# Enterprise hardening — execution log

One entry per phase of `docs/plans/enterprise-hardening-plan.md`. Each entry
records the PR, the local gate results, and any deviation from the plan with its
reason.

---

## Phase 1 — Immutable audit log

- **PR**: _pending_
- **Branch**: `feat/audit-log`
- **ADR**: `docs/adr/0013-tamper-evident-audit-log.md`
- **Migration**: `db/migrations/0006_audit_events.sql`

### Delivered

- `audit_events` (hash-chained, append-only) + `audit_chain_head` (one-row
  serialization point).
- `server/audit-store.js` — canonical JSON, row hashing, daily-rotating address
  hash, `appendAudit`, `readChain`, `verifyAuditChain`.
- `server/audit.js` — `recordAudit` wrapper that never throws into a request
  path and counts failures; `createRequestAuditor` request-shaped entry point.
- `scripts/verify-audit-chain.mjs` — batched chain walk, exits 1 on any break.
- Call sites: `profile.update`, `score.submit`, `run_access.decision`,
  `quest_progress.save`, `journal.sync`, `journal.clear`, `lifetime.checkout`,
  `lifetime.confirm`, `lifetime.webhook`, `user.delete`.
- Tests: `tests/audit-store.test.js`, `tests/audit.test.js`,
  `tests/audit-call-sites.test.js`, `tests/audit-store.integration.test.js`, and
  a new case in `tests/migration.test.js`.

### Gate

- `npm run check`: green (lint, typecheck, 418 tests / 7 skipped, build, bundle
  budget all PASS).
- `npm run check:full`: green (105 e2e passed / 5 skipped). One flake on the
  first run — `retries the Cloud Quest choice view after its first chunk fails`,
  a chunk-load timing test — passed on rerun and on a clean full-suite rerun.
  This diff touches no client code.

### Deviations

1. **`recordAudit` takes a request plus an event object**, not the plan's bare
   `(ctx, action, resource, before, after)` at the call site. Routes receive one
   injected `recordAudit(request, event)` so they stay unaware of the address
   salt and of the recorder's failure handling. The plan's five-argument shape
   still exists underneath as `createAuditRecorder().recordAudit`.
2. **A `BEFORE UPDATE OR DELETE` trigger enforces append-only** in addition to
   the plan's `REVOKE`. The revoke alone does not bind the table owner, which is
   the role the app connects as. Consequence: the plan's "manually UPDATE a row
   and watch verification fail" demo needs the trigger disabled first, so
   tamper detection is proven by unit test instead. Reason: enforcement beats
   demo convenience for a log whose whole value is being unfalsifiable.
3. **Explorer Access Settings have no audit call site.** They are device-local
   presentation preferences that never reach the server, so there is no mutating
   endpoint to audit.
4. **New env var**: `AUDIT_IP_SALT`. Unset means `ip_hash` is `NULL` — the audit
   row is still written and the chain is still valid. Documented in `README.md`;
   `.env.example` was deliberately left untouched because it is out of scope for
   this run.
5. **Schema hardened past the plan's sketch.** `prev_hash` / `row_hash` /
   `ip_hash` are `CHAR(64)` with hex CHECKs instead of bare `TEXT`, `actor_role`
   is constrained to the four known roles, and a third index
   `audit_events_action_idx` supports the phase 7 audit viewer's action filter.
   Deliberately *not* constrained: `action` and `resource_type`. Because
   `recordAudit` swallows write errors, a CHECK on the action name would silently
   drop rows for any future action — the exact failure the log exists to prevent.
6. **`run_access.grant` renamed to `run_access.decision`, and audited only under
   enforcement.** With `RUN_ACCESS_ENFORCEMENT_ENABLED=false` the endpoint reads
   current access and grants nothing, so there is nothing to audit. Under
   enforcement both admission and denial are recorded, because the decision
   itself is the durable fact support needs.
7. **`user.delete` targets `player_account`, not `player_profile`.** Account
   deletion removes the whole identity, which is a different resource from the
   Player Profile row that `profile.update` touches.
8. **`npm run verify:audit` added to `package.json`** and documented in
   `README.md`. It sits outside `npm run check` because the local gate must not
   require a database.
9. **New env var**: `AUDIT_TRUST_PROXY`. `x-forwarded-for` is client-controlled
   unless a proxy rewrites it, so it is honoured only when this is `true` (the
   Vercel case). Unset, the socket address is hashed instead.

### CodeRabbit review

Review completed on `f1b0902`. Nine actionable comments plus two nitpicks.
Fixed: `BEFORE TRUNCATE` statement trigger (row triggers never fire on
`TRUNCATE`, so the earlier ADR wording overstated the guarantee); one
`REPEATABLE READ, READ ONLY` snapshot across every verification batch and the
head read; exit code 2 for operational verifier failures so they cannot be
mistaken for tampering; transaction-local `lock_timeout` on the chain-head lock;
`AUDIT_TRUST_PROXY` gate on `x-forwarded-for`; a startup warning when
`AUDIT_IP_SALT` is unset; hot-row `fillfactor` and autovacuum settings on
`audit_chain_head`; direct test coverage for `createRequestAuditor`.

Dismissed with reasons, both recorded in the ADR's "What this does not defend
against" section:

- *Move application runtime access to a non-owner role.* Correct, and it is the
  real fix for owner-level `DROP TRIGGER`. It is a database provisioning change,
  not a code change, and this repo does not own Neon role setup.
- *Anchor chain checkpoints with an externally managed HMAC or signature.* Also
  correct, and also not a code-only change — it needs a sink the database role
  cannot reach, which is what phase 5's observability work introduces. Deferred
  rather than declined.
- *Fail fast when `AUDIT_IP_SALT` is unset.* Declined in favour of one startup
  warning. A missing salt must not take down player services; the audit row and
  the chain are both still valid without an address hash.
