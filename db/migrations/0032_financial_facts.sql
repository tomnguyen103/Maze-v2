-- 0032: account-free Financial Facts. One row per paid PaymentIntent.
-- The table holds no account, contact, Checkout Session or name column.
-- payment_intent_id is the Stripe reconciliation key. Stripe keeps its own
-- payer record under that id as an accounting record outside this database.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS financial_facts (
  payment_intent_id TEXT PRIMARY KEY,
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('test', 'live')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents = 599),
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents BETWEEN 0 AND amount_cents),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  provider_event_created BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

RESET lock_timeout;
