import { LIFETIME_AMOUNT, LIFETIME_CURRENCY } from "../shared/lifetime-product.js";
import { transitionLifetimeState } from "./lifetime-state.js";

/**
 * @typedef {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} FactClient
 */

/**
 * Writes the paid Financial Fact for one PaymentIntent. A repeat write keeps
 * one row and only advances its event clock.
 * @param {FactClient} client
 * @param {{ paymentIntentId: string, billingMode: "test" | "live", eventCreated: number, paidAt: Date }} fact
 */
export async function recordPaidFact(client, { paymentIntentId, billingMode, eventCreated, paidAt }) {
  await client.query(
    `INSERT INTO financial_facts (
       payment_intent_id, billing_mode, amount_cents, currency, status, paid_at, provider_event_created
     ) VALUES ($1, $2, $3, $4, 'paid', $5, $6)
     ON CONFLICT (payment_intent_id) DO UPDATE
     SET provider_event_created = GREATEST(
           financial_facts.provider_event_created,
           EXCLUDED.provider_event_created
         )`,
    [paymentIntentId, billingMode, LIFETIME_AMOUNT, LIFETIME_CURRENCY, paidAt, eventCreated]
  );
}

/**
 * Applies a verified refund or dispute event to the Financial Fact. The fact
 * keeps its own event clock, so it stays true after the account is deleted.
 * A partial refund raises `refunded_cents` and keeps the fact `paid`.
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
  if (transition.outcome !== "processed" && refundedCents === currentCents) {
    return /** @type {"duplicate" | "stale" | "ignored"} */ (transition.outcome);
  }
  const status = transition.state === "active" ? "paid" : transition.state;
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
         provider_event_created = $4,
         updated_at = NOW()
     WHERE payment_intent_id = $1`,
    [event.paymentIntentId, status, refundedCents, transition.eventCreated]
  );
  return "processed";
}
