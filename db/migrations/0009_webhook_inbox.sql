-- Store-then-process inbox for provider webhooks.
--
-- Signature verification still happens before anything is written. Once a
-- delivery is stored we answer 200 so the provider stops retrying, and our own
-- retry loop owns recovery from there. A duplicate delivery collides on the
-- primary key and is a no-op, which is what makes replay safe.

CREATE TABLE webhook_inbox (
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'clerk')),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  -- Transient by design. A Clerk user.deleted payload carries the raw Clerk id,
  -- which the deletion tombstone exists specifically to avoid storing. The
  -- payload is only needed until the delivery is processed, so markProcessed
  -- clears it and scripts/prune-webhook-inbox.mjs removes settled rows.
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- Redacted class name only, never a provider error body: a failing payload
  -- may quote the very fields the Journal and audit rules keep out of storage.
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id),
  -- A processed row must record when, and an unprocessed row must not claim to.
  CHECK ((status = 'processed') = (processed_at IS NOT NULL))
);

-- The retry loop reads exactly this: rows still owed work, oldest first.
CREATE INDEX webhook_inbox_retry_idx
  ON webhook_inbox (status, received_at)
  WHERE status IN ('pending', 'failed');

-- The dead-letter view, for scripts/list-dead-webhooks.mjs and the phase 7
-- admin dashboard.
CREATE INDEX webhook_inbox_dead_idx
  ON webhook_inbox (received_at DESC)
  WHERE status = 'dead';

-- Retention: settled rows are pruned on a schedule, so a payload that still
-- holds an identity cannot linger indefinitely.
CREATE INDEX webhook_inbox_settled_idx
  ON webhook_inbox (status, received_at);
