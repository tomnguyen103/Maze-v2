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
- Call sites: `profile.update`, `score.submit`, `run_access.grant`,
  `quest_progress.save`, `journal.sync`, `journal.clear`, `lifetime.checkout`,
  `lifetime.confirm`, `lifetime.webhook`, `user.delete`.
- Tests: `tests/audit-store.test.js`, `tests/audit.test.js`,
  `tests/audit-call-sites.test.js`, `tests/audit-store.integration.test.js`, and
  a new case in `tests/migration.test.js`.

### Gate

- `npm run check`: _pending_
- `npm run check:full`: _pending_

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
   row is still written and the chain is still valid.
