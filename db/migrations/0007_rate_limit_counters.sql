-- Serverless-safe rate limiting.
--
-- One row per (budget, caller) pair holding a fixed-window counter. The limiter
-- increments with a single INSERT ... ON CONFLICT, so concurrent requests in the
-- same window each count exactly once without a transaction or in-memory state.
--
-- Privacy: guest callers are keyed by a daily-rotating address hash, never a raw
-- address, matching the audit log and Lantern Journal posture.

CREATE TABLE rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports pruning: guest keys stop being reachable once their address hash
-- rotates, so old rows are dead weight rather than state.
CREATE INDEX rate_limit_counters_window_idx
  ON rate_limit_counters (window_start);
