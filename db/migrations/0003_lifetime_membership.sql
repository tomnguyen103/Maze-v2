ALTER TABLE player_access
  ADD COLUMN active_purchase_id UUID,
  ADD COLUMN lifetime_activated_at TIMESTAMPTZ,
  ADD COLUMN lifetime_state_event_created BIGINT NOT NULL DEFAULT 0;

CREATE TABLE lifetime_purchases (
  id UUID PRIMARY KEY,
  player_id TEXT NOT NULL
    REFERENCES player_access(clerk_user_id) ON DELETE CASCADE,
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  stripe_price_id TEXT NOT NULL,
  amount SMALLINT NOT NULL DEFAULT 599 CHECK (amount = 599),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'open',
        'paid',
        'refunded',
        'disputed',
        'expired',
        'failed'
      )
    ),
  provider_event_created BIGINT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX lifetime_purchases_one_open_per_player_idx
  ON lifetime_purchases (player_id)
  WHERE status IN ('pending', 'open');

ALTER TABLE player_access
  ADD CONSTRAINT player_access_active_purchase_fk
  FOREIGN KEY (active_purchase_id)
  REFERENCES lifetime_purchases(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE player_access
  VALIDATE CONSTRAINT player_access_active_purchase_fk;

CREATE TABLE stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_created BIGINT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT NOT NULL CHECK (
    outcome IN (
      'processing',
      'processed',
      'ignored',
      'stale',
      'unlinked',
      'duplicate'
    )
  )
);

CREATE INDEX lifetime_purchases_player_created_idx
  ON lifetime_purchases (player_id, created_at DESC);
