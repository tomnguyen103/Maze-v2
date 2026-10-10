-- 0035: Financial Fact partial refund cents. A new column keeps the cents of a
-- partial refund on the paid day, even after a later full refund.
--
-- Problem: a partial refund counts its cents on the paid day, because it has
-- no refund time. A later full refund stamps refunded_at and moves all
-- refunded cents, the partial ones too, to the refund day. A closed period
-- then loses refunded cents.
--
-- Fix: partial_refunded_cents holds the cents refunded before the fact became
-- fully refunded. The column freezes when the fact becomes fully refunded. The
-- report counts these cents on the paid day and the remaining cents on the
-- refund day. The report reads refunded_cents for a fact with no refund time,
-- so the column matters only after the full refund. Code from before 0035
-- raises refunded_cents and leaves the column behind until then.
--
-- Backfill: a fact that is not fully refunded takes partial_refunded_cents =
-- refunded_cents. A fact that is already fully refunded keeps 0, so its cents
-- stay on the refund day, as they do now.
--
-- One transaction with a short lock wait. Every statement survives a re-run.
-- The file does not edit 0032.
--
-- Rollback (an agent never runs it): drop the constraint
-- financial_facts_partial_refunded_cents_check, then drop the column
-- partial_refunded_cents. The report from before 0035 reads neither.

BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE financial_facts
  ADD COLUMN IF NOT EXISTS partial_refunded_cents INTEGER NOT NULL DEFAULT 0;

UPDATE financial_facts
SET partial_refunded_cents = refunded_cents
WHERE refunded_at IS NULL
  AND partial_refunded_cents <> refunded_cents;

ALTER TABLE financial_facts
  DROP CONSTRAINT IF EXISTS financial_facts_partial_refunded_cents_check,
  ADD CONSTRAINT financial_facts_partial_refunded_cents_check
    CHECK (partial_refunded_cents BETWEEN 0 AND refunded_cents);

COMMIT;
