import { LIFETIME_AMOUNT, LIFETIME_CURRENCY } from "../shared/lifetime-product.js";
import { transitionLifetimeState } from "./lifetime-state.js";

/**
 * @typedef {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} FactClient
 */

/**
 * Writes the Financial Fact for one verified, linked PaymentIntent. The
 * status is the charge state when the payment is processed, so a payment
 * refunded before its paid event still leaves a fact. A repeat write keeps
 * one row. It merges the larger refunded cents, makes a full refund
 * `refunded`, and advances the event clock. The partial refunded cents
 * freeze when the fact becomes fully refunded. The report reads refunded
 * cents for a fact with no refund time, so the column matters only after the
 * full refund.
 * @param {FactClient} client
 * @param {{
 *   paymentIntentId: string,
 *   billingMode: "test" | "live",
 *   eventCreated: number,
 *   status: "paid" | "refunded" | "disputed",
 *   refundedCents: number
 * }} fact
 */
export async function recordFact(client, { paymentIntentId, billingMode, eventCreated, status, refundedCents }) {
  await client.query(
    `INSERT INTO financial_facts (
       payment_intent_id, billing_mode, amount_cents, currency, status, refunded_cents,
       partial_refunded_cents, paid_at, refunded_at, disputed_at, provider_event_created
     ) VALUES (
       $1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'refunded' THEN 0 ELSE $6 END, NOW(),
       CASE WHEN $5 = 'refunded' THEN NOW() END,
       CASE WHEN $5 = 'disputed' THEN NOW() END,
       $7
     )
     ON CONFLICT (payment_intent_id) DO UPDATE
     SET status = CASE
           WHEN EXCLUDED.refunded_cents >= financial_facts.amount_cents THEN 'refunded'
           ELSE financial_facts.status
         END,
         refunded_at = CASE
           WHEN EXCLUDED.refunded_cents >= financial_facts.amount_cents
             THEN COALESCE(financial_facts.refunded_at, NOW())
           ELSE financial_facts.refunded_at
         END,
         refunded_cents = GREATEST(financial_facts.refunded_cents, EXCLUDED.refunded_cents),
         partial_refunded_cents = CASE
           WHEN financial_facts.refunded_at IS NOT NULL
             THEN financial_facts.partial_refunded_cents
           WHEN EXCLUDED.refunded_cents >= financial_facts.amount_cents
             THEN financial_facts.refunded_cents
           ELSE GREATEST(financial_facts.refunded_cents, EXCLUDED.refunded_cents)
         END,
         provider_event_created = GREATEST(
           financial_facts.provider_event_created,
           EXCLUDED.provider_event_created
         ),
         updated_at = NOW()`,
    [paymentIntentId, billingMode, LIFETIME_AMOUNT, LIFETIME_CURRENCY, status, refundedCents, eventCreated]
  );
}

/**
 * Applies a verified refund or dispute event to the Financial Fact. The fact
 * keeps its own event clock, so it stays true after the account is deleted.
 * A partial refund raises `refunded_cents` and keeps the fact `paid`. A full
 * refund makes the fact `refunded` whatever the event order, because the
 * refunded cents come from the charge as it is now. The partial refunded
 * cents freeze when the fact becomes fully refunded, at the refunded cents
 * from before that refund. The report reads refunded cents for a fact with no
 * refund time, so the column matters only after the full refund.
 * @param {FactClient} client
 * @param {{
 *   paymentIntentId: string,
 *   billingMode: "test" | "live",
 *   eventCreated: number,
 *   requestedState: "active" | "refunded" | "disputed" | null,
 *   refundedCents: number
 * }} event
 * @returns {Promise<"missing" | "processed" | "duplicate" | "stale" | "ignored">}
 */
export async function transitionFact(client, event) {
  const result = await client.query(
    `SELECT status, refunded_cents, provider_event_created
     FROM financial_facts
     WHERE payment_intent_id = $1
       AND billing_mode = $2
     FOR UPDATE`,
    [event.paymentIntentId, event.billingMode]
  );
  const fact = result.rows[0];
  if (!fact) return "missing";
  const currentState = fact.status === "paid" ? "active" : String(fact.status);
  const currentCents = Number(fact.refunded_cents);
  const transition = event.requestedState
    ? transitionLifetimeState({
        currentEventCreated: Number(fact.provider_event_created),
        currentState,
        eventCreated: event.eventCreated,
        requestedState: event.requestedState,
        source: "provider"
      })
    : { eventCreated: Number(fact.provider_event_created), outcome: "ignored", state: currentState };
  // Refunds only accumulate, so a larger amount is never stale.
  const refundedCents = Math.max(currentCents, event.refundedCents);
  const fullyRefunded = refundedCents >= LIFETIME_AMOUNT && fact.status !== "refunded";
  if (!fullyRefunded && transition.outcome !== "processed" && refundedCents === currentCents) {
    return /** @type {"duplicate" | "stale" | "ignored"} */ (transition.outcome);
  }
  const status = fullyRefunded ? "refunded" : transition.state === "active" ? "paid" : transition.state;
  const eventCreated = Math.max(transition.eventCreated, fullyRefunded ? event.eventCreated : 0);
  await client.query(
    `UPDATE financial_facts
     SET refunded_at = CASE
           WHEN $2 = 'refunded' AND status <> 'refunded' THEN NOW()
           ELSE refunded_at
         END,
         disputed_at = CASE
           WHEN $2 = 'disputed' AND status <> 'disputed' THEN NOW()
           ELSE disputed_at
         END,
         status = $2,
         refunded_cents = $3,
         partial_refunded_cents = CASE
           WHEN refunded_at IS NOT NULL THEN partial_refunded_cents
           WHEN $2 = 'refunded' THEN refunded_cents
           ELSE $3
         END,
         provider_event_created = $4,
         updated_at = NOW()
     WHERE payment_intent_id = $1`,
    [event.paymentIntentId, status, refundedCents, eventCreated]
  );
  return "processed";
}
