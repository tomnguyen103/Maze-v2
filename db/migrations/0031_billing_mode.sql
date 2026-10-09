-- Billing Mode on purchases, webhook events and the Run Access projection.
-- The columns stay NULL for rows that predate the mode: such a purchase grants
-- nothing and is never reused. Every statement survives a re-run.
--
-- Online-safe, alongside 0019 and 0022 (A+ audit DB-03). The three tables are
-- created in applied migrations and hold rows, so each CHECK is added NOT VALID
-- and validated on its own statement, and the index is built CONCURRENTLY.
-- Not one transaction: CREATE INDEX CONCURRENTLY cannot run in one, so do not
-- apply with `psql -1`. A failed index build leaves an INVALID index: drop it
-- with DROP INDEX CONCURRENTLY IF EXISTS, then re-run this file.

SET lock_timeout = '3s';

ALTER TABLE lifetime_purchases
  ADD COLUMN IF NOT EXISTS billing_mode TEXT;
ALTER TABLE stripe_webhook_events
  ADD COLUMN IF NOT EXISTS billing_mode TEXT;
ALTER TABLE player_access
  ADD COLUMN IF NOT EXISTS membership_mode TEXT;

ALTER TABLE lifetime_purchases
  DROP CONSTRAINT IF EXISTS lifetime_purchases_billing_mode_check,
  ADD CONSTRAINT lifetime_purchases_billing_mode_check
    CHECK (billing_mode IN ('test', 'live')) NOT VALID;
ALTER TABLE stripe_webhook_events
  DROP CONSTRAINT IF EXISTS stripe_webhook_events_billing_mode_check,
  ADD CONSTRAINT stripe_webhook_events_billing_mode_check
    CHECK (billing_mode IN ('test', 'live')) NOT VALID;
ALTER TABLE player_access
  DROP CONSTRAINT IF EXISTS player_access_membership_mode_check,
  ADD CONSTRAINT player_access_membership_mode_check
    CHECK (membership_mode IN ('test', 'live')) NOT VALID;

ALTER TABLE lifetime_purchases
  VALIDATE CONSTRAINT lifetime_purchases_billing_mode_check;
ALTER TABLE stripe_webhook_events
  VALIDATE CONSTRAINT stripe_webhook_events_billing_mode_check;
ALTER TABLE player_access
  VALIDATE CONSTRAINT player_access_membership_mode_check;

-- One open purchase per player and mode. Unclassified rows (NULL mode) share
-- the 'unclassified' key, so they never block a purchase of a real mode.
-- The new index exists before the old one goes, so no open purchase is unguarded.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS lifetime_purchases_one_open_per_player_mode_idx
  ON lifetime_purchases (player_id, COALESCE(billing_mode, 'unclassified'))
  WHERE status IN ('pending', 'open');
DROP INDEX CONCURRENTLY IF EXISTS lifetime_purchases_one_open_per_player_idx;

RESET lock_timeout;
