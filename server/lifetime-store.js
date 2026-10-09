import {
  transitionLifetimeState
} from "./lifetime-state.js";
import { recordFact, transitionFact } from "./financial-facts.js";
import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean | Error) => void
 *   }>,
 *   query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 * @param {{ mode: "test" | "live" }} options The Billing Mode this deployment runs.
 */
export function createLifetimeStore(pool, { mode }) {
  if (mode !== "test" && mode !== "live") {
    throw new Error("Lifetime store needs a Billing Mode of test or live.");
  }
  return {
    /**
     * @param {string} userId
     * @param {string} purchaseId
     * @param {string} priceId
     */
    async reservePurchase(userId, purchaseId, priceId) {
      return transact(pool, async (client) => {
        const guard = await client.query(
          `WITH ${activeUserGuardCtes("$2")},
           ensured_access AS (
             INSERT INTO player_access (clerk_user_id)
             SELECT $1
             FROM active_user
             ON CONFLICT (clerk_user_id) DO NOTHING
           )
           SELECT NOT EXISTS (SELECT 1 FROM active_user) AS deleted`,
          [userId, deletedUserHash(userId)]
        );
        if (guard.rows[0]?.deleted === true) throw new DeletedUserError();
        const existing = await client.query(
          `SELECT id, checkout_session_id, status
           FROM lifetime_purchases
           WHERE player_id = $1
             AND billing_mode = $2
             AND status IN ('pending', 'open')
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [userId, mode]
        );
        const access = await client.query(
          `SELECT membership_state, membership_mode, active_purchase_id
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [userId]
        );
        const accessRow = access.rows[0] ?? {};
        // `refunded` is absorbing in `transitionLifetimeState`: once an
        // account reaches it, no later event restores membership. Creating a
        // second Checkout from that state charges a parent again and changes
        // nothing — the child keeps zero Runs while a stranger has three, and
        // deleting the account is the only way out. The refusal is a state a
        // human resolves, not one a payment can.
        const membershipState = projectedAccess(accessRow, mode).state;
        if (membershipState !== "none" && membershipState !== "active") {
          return {
            purchaseId: String(accessRow.active_purchase_id ?? purchaseId),
            sessionId: null,
            state: "membership-blocked"
          };
        }
        if (membershipState === "active") {
          return {
            purchaseId: String(
              accessRow.active_purchase_id ?? purchaseId
            ),
            sessionId: null,
            state: "member"
          };
        }
        if (existing.rows[0]) {
          return reservation(existing.rows[0], "open");
        }
        const inserted = await client.query(
          `INSERT INTO lifetime_purchases (
             id,
             player_id,
             stripe_price_id,
             billing_mode
           )
           VALUES ($1, $2, $3, $4)
           RETURNING id, checkout_session_id, status`,
          [purchaseId, userId, priceId, mode]
        );
        return reservation(inserted.rows[0] ?? { id: purchaseId }, "reserved");
      });
    },

    /** @param {string} purchaseId @param {string} sessionId */
    async attachCheckout(purchaseId, sessionId) {
      const result = await pool.query(
        `UPDATE lifetime_purchases
         SET checkout_session_id = $2,
             status = CASE
               WHEN status IN ('pending', 'open') THEN 'open'
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $1
           AND (
             (
               status IN ('pending', 'open') AND
               checkout_session_id IS NULL
             ) OR
             checkout_session_id = $2
           )
         RETURNING id`,
        [purchaseId, sessionId]
      );
      if (!result.rows[0]) {
        throw new Error("Lifetime purchase reservation is no longer open.");
      }
    },

    /** @param {string} purchaseId @param {string} sessionId */
    async abandonCheckout(purchaseId, sessionId) {
      const result = await pool.query(
        `UPDATE lifetime_purchases
         SET status = 'failed',
             updated_at = NOW()
         WHERE id = $1
           AND checkout_session_id = $2
           AND status IN ('pending', 'open')
         RETURNING id`,
        [purchaseId, sessionId]
      );
      return Boolean(result.rows[0]);
    },

    /** @param {string} sessionId */
    async findPurchaseBySession(sessionId) {
      const result = await pool.query(
        `SELECT
           id,
           player_id,
           checkout_session_id,
           stripe_price_id,
           status
         FROM lifetime_purchases
         WHERE checkout_session_id = $1
           AND billing_mode = $2`,
        [sessionId, mode]
      );
      return result.rows[0] ? purchaseRecord(result.rows[0]) : null;
    },

    /**
     * @param {Record<string, unknown>} checkout
     * @param {null | { eventCreated: number, eventId: string, eventType: string }} event
     */
    async activatePurchase(checkout, event) {
      return transact(pool, async (client) => {
        if (event && !(await beginWebhookEvent(client, event, mode))) {
          return { outcome: "duplicate" };
        }
        const purchaseResult = await client.query(
          `SELECT
             id,
             player_id,
             status,
             provider_event_created
           FROM lifetime_purchases
           WHERE id = $2
             AND player_id = $3
             AND stripe_price_id = $4
             AND (
               checkout_session_id IS NULL OR
               checkout_session_id = $1
             )
             AND (
               payment_intent_id IS NULL OR
               payment_intent_id = $5
             )
             AND billing_mode = $6
           FOR UPDATE`,
          [
            checkout.sessionId,
            checkout.purchaseId,
            checkout.ownerId,
            checkout.priceId,
            checkout.paymentIntentId,
            mode
          ]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          if (event) {
            await finishWebhookEvent(client, event.eventId, "unlinked");
          }
          return { outcome: "unlinked" };
        }
        /** @param {"paid" | "refunded" | "disputed"} status @param {number} eventCreated */
        const writeFact = (status, eventCreated) => recordFact(client, {
          paymentIntentId: String(checkout.paymentIntentId),
          billingMode: mode,
          eventCreated,
          status,
          refundedCents: Number(checkout.refundedCents ?? 0)
        });
        if (event && checkout.paymentState !== "paid") {
          // The charge was taken, so the fact records it without access.
          await writeFact(
            checkout.paymentState === "disputed" ? "disputed" : "refunded",
            event.eventCreated
          );
          await finishWebhookEvent(client, event.eventId, "ignored");
          return { outcome: "ignored" };
        }
        const accessResult = await client.query(
          `SELECT membership_state, membership_mode, lifetime_state_event_created
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [purchase.player_id]
        );
        const access = entitlementBasis(accessResult.rows[0] ?? {}, purchase, mode);
        if (
          !event &&
          (access.state === "refunded" ||
            access.state === "disputed")
        ) {
          return lifetimeResult(access.state, "ignored");
        }
        const transition = event
          ? transitionLifetimeState({
              currentEventCreated: access.eventCreated,
              currentState: access.state,
              eventCreated: event.eventCreated,
              requestedState: "active",
              source: "checkout"
            })
          : {
              eventCreated: access.eventCreated,
              outcome: "processed",
              state: "active"
            };
        if (transition.outcome === "processed") {
          await client.query(
           `UPDATE lifetime_purchases
             SET checkout_session_id = COALESCE(
                   checkout_session_id,
                   $2
                 ),
                 payment_intent_id = $3,
                 status = 'paid',
                 provider_event_created = GREATEST(
                   provider_event_created,
                   $4
                 ),
                 paid_at = COALESCE(paid_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [
              purchase.id,
              checkout.sessionId,
              checkout.paymentIntentId,
              transition.eventCreated
            ]
          );
          await client.query(
            `UPDATE player_access
             SET membership_state = 'active',
                 membership_mode = $4,
                 active_purchase_id = $2,
                 lifetime_activated_at = COALESCE(
                   lifetime_activated_at,
                   NOW()
                 ),
                 lifetime_state_event_created = CASE
                   WHEN membership_mode = $4::text THEN GREATEST(
                     lifetime_state_event_created,
                     $3
                   )
                   ELSE $3
                 END,
                 entitlement_updated_at = NOW(),
                 updated_at = NOW()
             WHERE clerk_user_id = $1
               AND (
                 membership_mode IS NULL OR
                 membership_mode = $4::text OR
                 $4::text = 'live'
               )`,
            [
              purchase.player_id,
              purchase.id,
              transition.eventCreated,
              mode
            ]
          );
        }
        // Stripe reports the charge paid, so the fact exists even when an
        // older access clock makes the entitlement transition stale.
        await writeFact("paid", event ? event.eventCreated : transition.eventCreated);
        if (event) {
          await finishWebhookEvent(
            client,
            event.eventId,
            transition.outcome
          );
          return { outcome: transition.outcome };
        }
        return lifetimeResult(transition.state);
      });
    },

    /** @param {Record<string, unknown>} event */
    async transitionEntitlement(event) {
      return transact(pool, async (client) => {
        if (!(await beginWebhookEvent(client, event, mode))) {
          return { outcome: "duplicate" };
        }
        // The Financial Fact names no account, so it updates even when no
        // purchase row links. It is locked last, after the purchase and
        // access rows, in the same order as `activatePurchase`.
        /** @param {"active" | "refunded" | "disputed" | null} requestedState */
        const applyFact = (requestedState) => transitionFact(client, {
          billingMode: mode,
          eventCreated: Number(event.eventCreated),
          paymentIntentId: String(event.paymentIntentId),
          refundedCents: Number(event.refundedCents ?? 0),
          requestedState
        });
        if (
          event.state !== "active" &&
          event.state !== "refunded" &&
          event.state !== "disputed"
        ) {
          await applyFact(null);
          await finishWebhookEvent(client, String(event.eventId), "ignored");
          return { outcome: "ignored" };
        }
        const requestedState =
          /** @type {"active" | "refunded" | "disputed"} */ (event.state);
        const purchaseResult = await client.query(
          `SELECT
             id,
             player_id,
             status,
             provider_event_created
           FROM lifetime_purchases
           WHERE id = $2
             AND player_id = $3
             AND (
               payment_intent_id IS NULL OR
               payment_intent_id = $1
             )
             AND billing_mode = $4
           FOR UPDATE`,
          [
            event.paymentIntentId,
            event.purchaseId,
            event.ownerId,
            mode
          ]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          await applyFact(requestedState);
          await finishWebhookEvent(client, String(event.eventId), "unlinked");
          return { outcome: "unlinked" };
        }
        const accessResult = await client.query(
          `SELECT membership_state, membership_mode, lifetime_state_event_created
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [purchase.player_id]
        );
        const access = entitlementBasis(
          accessResult.rows[0] ?? {},
          purchase,
          mode
        );
        const transition = transitionLifetimeState({
          currentEventCreated: access.eventCreated,
          currentState: access.state,
          eventCreated: Number(event.eventCreated),
          requestedState,
          source: "provider"
        });
        if (transition.outcome === "processed") {
          await client.query(
            `UPDATE lifetime_purchases
             SET payment_intent_id = COALESCE(payment_intent_id, $2),
                 status = $3,
                 provider_event_created = GREATEST(
                   provider_event_created,
                   $4
                 ),
                 refunded_at = CASE
                   WHEN $3 = 'refunded' THEN NOW()
                   ELSE refunded_at
                 END,
                 disputed_at = CASE
                   WHEN $3 = 'disputed' THEN NOW()
                   ELSE disputed_at
                 END,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              purchase.id,
              event.paymentIntentId,
              purchaseStatus(transition.state),
              transition.eventCreated
            ]
          );
          await client.query(
            `UPDATE player_access
             SET membership_state = $1,
                 membership_mode = $5,
                 active_purchase_id = $2,
                 lifetime_activated_at = CASE
                   WHEN $1 = 'active' THEN COALESCE(
                     lifetime_activated_at,
                     NOW()
                   )
                   ELSE lifetime_activated_at
                 END,
                 lifetime_state_event_created = $3,
                 entitlement_updated_at = NOW(),
                 updated_at = NOW()
             WHERE clerk_user_id = $4
               AND (
                 membership_mode IS NULL OR
                 membership_mode = $5::text OR
                 $5::text = 'live'
               )`,
            [
              transition.state,
              purchase.id,
              transition.eventCreated,
              purchase.player_id,
              mode
            ]
          );
        }
        await applyFact(requestedState);
        await finishWebhookEvent(
          client,
          String(event.eventId),
          transition.outcome
        );
        return {
          outcome: transition.outcome,
          state: lifetimeResult(transition.state).state
        };
      });
    },

    /** @param {Record<string, unknown>} event */
    async closeCheckout(event) {
      return transact(pool, async (client) => {
        if (!(await beginWebhookEvent(client, event, mode))) {
          return { outcome: "duplicate" };
        }
        const purchaseResult = await client.query(
          `SELECT id, status, provider_event_created
           FROM lifetime_purchases
           WHERE checkout_session_id = $1
             AND billing_mode = $2
           FOR UPDATE`,
          [event.sessionId, mode]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          await finishWebhookEvent(client, String(event.eventId), "unlinked");
          return { outcome: "unlinked" };
        }
        const providerCreated = Number(
          purchase.provider_event_created ?? 0
        );
        const immutable = new Set(["paid", "refunded", "disputed"]);
        const outcome = Number(event.eventCreated) < providerCreated
          ? "stale"
          : immutable.has(String(purchase.status))
            ? "ignored"
            : "processed";
        if (outcome === "processed") {
          await client.query(
            `UPDATE lifetime_purchases
             SET status = $2,
                 provider_event_created = $3,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              purchase.id,
              event.eventType === "checkout.session.expired"
                ? "expired"
                : "failed",
              event.eventCreated
            ]
          );
        }
        await finishWebhookEvent(client, String(event.eventId), outcome);
        return { outcome };
      });
    },

    /** Purchases with no Billing Mode. Live readiness waits for zero. */
    async countUnclassifiedPurchases() {
      // A row with no Stripe object and no paid status never moved money, so it needs no mode.
      const result = await pool.query(
        `SELECT COUNT(*) AS count
         FROM lifetime_purchases
         WHERE billing_mode IS NULL
           AND (
             checkout_session_id IS NOT NULL OR
             payment_intent_id IS NOT NULL OR
             status IN ('paid', 'refunded', 'disputed')
           )`
      );
      return Number(result.rows[0]?.count ?? 0);
    }
  };
}

/**
 * @template {Record<string, unknown>} T
 * @param {Parameters<typeof createLifetimeStore>[0]} pool
 * @param {(client: Awaited<ReturnType<Parameters<typeof createLifetimeStore>[0]["connect"]>>) => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function transact(pool, operation) {
  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    let rollbackFailed = false;
    try {
      await client.query("ROLLBACK");
    } catch {
      rollbackFailed = true;
    }
    client.release(rollbackFailed ? true : undefined);
    released = true;
    throw error;
  } finally {
    if (!released) {
      client.release();
    }
  }
}

/** @param {Record<string, unknown>} row @param {string} fallbackState */
function reservation(row, fallbackState) {
  return {
    purchaseId: String(row.id),
    sessionId: row.checkout_session_id
      ? String(row.checkout_session_id)
      : null,
    state: row.status === "pending" ? fallbackState : String(row.status)
  };
}

/** @param {Record<string, unknown>} row */
function purchaseRecord(row) {
  return {
    playerId: String(row.player_id),
    priceId: String(row.stripe_price_id),
    purchaseId: String(row.id),
    sessionId: String(row.checkout_session_id),
    status: String(row.status)
  };
}

/** @param {string} state @param {string} [outcome] */
function lifetimeResult(state, outcome) {
  const active = state === "active";
  return {
    canStartRun: active,
    lifetime: active,
    ...(outcome ? { outcome } : {}),
    state: active
      ? "lifetime_active"
      : state === "refunded"
        ? "lifetime_refunded"
        : state === "disputed"
          ? "lifetime_disputed"
          : "lifetime_purchase_required"
  };
}

/**
 * A projection row counts only in the Billing Mode that wrote it.
 * @param {Record<string, unknown>} row
 * @param {"test" | "live"} mode
 */
function projectedAccess(row, mode) {
  if (row.membership_mode !== mode) {
    return { state: "none", eventCreated: 0 };
  }
  return {
    state: String(row.membership_state ?? "none"),
    eventCreated: Number(row.lifetime_state_event_created ?? 0)
  };
}

/**
 * A projection that belongs to another mode cannot order this mode's events,
 * so the purchase row supplies its own state and event clock.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} purchase
 * @param {"test" | "live"} mode
 */
function entitlementBasis(row, purchase, mode) {
  if (row.membership_mode === mode) {
    return projectedAccess(row, mode);
  }
  const status = String(purchase.status);
  return {
    state: status === "paid" ? "active" : ["refunded", "disputed"].includes(status) ? status : "none",
    eventCreated: Number(purchase.provider_event_created ?? 0)
  };
}

/** @param {string} state */
function purchaseStatus(state) {
  return state === "active" ? "paid" : state;
}

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} client
 * @param {Record<string, unknown>} event
 * @param {"test" | "live"} mode
 */
async function beginWebhookEvent(client, event, mode) {
  const result = await client.query(
    `INSERT INTO stripe_webhook_events (
       event_id,
       event_type,
       stripe_created,
       outcome,
       billing_mode
     )
     VALUES ($1, $2, $3, 'processing', $4)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event.eventId, event.eventType, event.eventCreated, mode]
  );
  return Boolean(result.rows[0]);
}

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<unknown> }} client
 * @param {string} eventId
 * @param {string} outcome
 */
async function finishWebhookEvent(client, eventId, outcome) {
  await client.query(
    `UPDATE stripe_webhook_events
     SET outcome = $2,
         processed_at = NOW()
     WHERE event_id = $1`,
    [eventId, outcome]
  );
}
