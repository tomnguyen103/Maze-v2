import {
  transitionLifetimeState
} from "./lifetime-state.js";

/**
 * @param {{
 *   connect: () => Promise<{
 *     query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean | Error) => void
 *   }>,
 *   query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createLifetimeStore(pool) {
  return {
    /**
     * @param {string} userId
     * @param {string} purchaseId
     * @param {string} priceId
     */
    async reservePurchase(userId, purchaseId, priceId) {
      return transact(pool, async (client) => {
        await client.query(
          `INSERT INTO player_access (clerk_user_id)
           VALUES ($1)
           ON CONFLICT (clerk_user_id) DO NOTHING`,
          [userId]
        );
        const existing = await client.query(
          `SELECT id, checkout_session_id, status
           FROM lifetime_purchases
           WHERE player_id = $1
             AND status IN ('pending', 'open')
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [userId]
        );
        const access = await client.query(
          `SELECT membership_state, active_purchase_id
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [userId]
        );
        const accessRow = access.rows[0] ?? {};
        if (accessRow.membership_state === "active") {
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
             stripe_price_id
           )
           VALUES ($1, $2, $3)
           RETURNING id, checkout_session_id, status`,
          [purchaseId, userId, priceId]
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
         WHERE checkout_session_id = $1`,
        [sessionId]
      );
      return result.rows[0] ? purchaseRecord(result.rows[0]) : null;
    },

    /**
     * @param {Record<string, unknown>} checkout
     * @param {null | { eventCreated: number, eventId: string, eventType: string }} event
     */
    async activatePurchase(checkout, event) {
      return transact(pool, async (client) => {
        if (event && !(await beginWebhookEvent(client, event))) {
          return { outcome: "duplicate" };
        }
        if (event && checkout.paymentState !== "paid") {
          await finishWebhookEvent(client, event.eventId, "ignored");
          return { outcome: "ignored" };
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
           FOR UPDATE`,
          [
            checkout.sessionId,
            checkout.purchaseId,
            checkout.ownerId,
            checkout.priceId,
            checkout.paymentIntentId
          ]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          if (event) {
            await finishWebhookEvent(client, event.eventId, "unlinked");
          }
          return { outcome: "unlinked" };
        }
        const accessResult = await client.query(
          `SELECT membership_state, lifetime_state_event_created
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [purchase.player_id]
        );
        const access = accessResult.rows[0] ?? {};
        if (
          !event &&
          (access.membership_state === "refunded" ||
            access.membership_state === "disputed")
        ) {
          return lifetimeResult(String(access.membership_state), "ignored");
        }
        const transition = event
          ? transitionLifetimeState({
              currentEventCreated: Number(
                access.lifetime_state_event_created ?? 0
              ),
              currentState: String(access.membership_state ?? "none"),
              eventCreated: event.eventCreated,
              requestedState: "active",
              source: "checkout"
            })
          : {
              eventCreated: Number(
                access.lifetime_state_event_created ?? 0
              ),
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
                 active_purchase_id = $2,
                 lifetime_activated_at = COALESCE(
                   lifetime_activated_at,
                   NOW()
                 ),
                 lifetime_state_event_created = GREATEST(
                   lifetime_state_event_created,
                   $3
                 ),
                 entitlement_updated_at = NOW(),
                 updated_at = NOW()
             WHERE clerk_user_id = $1`,
            [
              purchase.player_id,
              purchase.id,
              transition.eventCreated
            ]
          );
        }
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
        if (!(await beginWebhookEvent(client, event))) {
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
             AND (
               payment_intent_id IS NULL OR
               payment_intent_id = $1
             )
           FOR UPDATE`,
          [
            event.paymentIntentId,
            event.purchaseId,
            event.ownerId
          ]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          await finishWebhookEvent(client, String(event.eventId), "unlinked");
          return { outcome: "unlinked" };
        }
        const accessResult = await client.query(
          `SELECT membership_state, lifetime_state_event_created
           FROM player_access
           WHERE clerk_user_id = $1
           FOR UPDATE`,
          [purchase.player_id]
        );
        const access = accessResult.rows[0] ?? {};
        const transition = transitionLifetimeState({
          currentEventCreated: Number(
            access.lifetime_state_event_created ?? 0
          ),
          currentState: String(access.membership_state ?? "none"),
          eventCreated: Number(event.eventCreated),
          requestedState:
            /** @type {"active" | "refunded" | "disputed"} */ (event.state),
          source: "provider"
        });
        if (transition.outcome === "processed") {
          await client.query(
            `UPDATE lifetime_purchases
             SET payment_intent_id = COALESCE(payment_intent_id, $2),
                 status = $3,
                 provider_event_created = $4,
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
             WHERE clerk_user_id = $4`,
            [
              transition.state,
              purchase.id,
              transition.eventCreated,
              purchase.player_id
            ]
          );
        }
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
        if (!(await beginWebhookEvent(client, event))) {
          return { outcome: "duplicate" };
        }
        const purchaseResult = await client.query(
          `SELECT id, status, provider_event_created
           FROM lifetime_purchases
           WHERE checkout_session_id = $1
           FOR UPDATE`,
          [event.sessionId]
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

/** @param {string} state */
function purchaseStatus(state) {
  return state === "active" ? "paid" : state;
}

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} client
 * @param {Record<string, unknown>} event
 */
async function beginWebhookEvent(client, event) {
  const result = await client.query(
    `INSERT INTO stripe_webhook_events (
       event_id,
       event_type,
       stripe_created,
       outcome
     )
     VALUES ($1, $2, $3, 'processing')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event.eventId, event.eventType, event.eventCreated]
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
