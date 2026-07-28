/**
 * Database reads used only by the staff workbench. The store returns
 * presentation-safe names and deliberately leaves audit chain hashes behind.
 *
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createAdminStore(pool) {
  return {
    async listUsers() {
      const result = await pool.query(
        `WITH identities AS (
           SELECT clerk_user_id AS user_id FROM players
           UNION
           SELECT user_id FROM user_roles
           UNION
           SELECT clerk_user_id AS user_id FROM player_access
         )
         SELECT i.user_id,
                p.username,
                COALESCE(r.role, 'player') AS role,
                COALESCE(a.membership_state, 'none') AS membership_state,
                COALESCE(p.created_at, a.created_at, r.created_at) AS created_at
         FROM identities i
         LEFT JOIN players p ON p.clerk_user_id = i.user_id
         LEFT JOIN user_roles r ON r.user_id = i.user_id
         LEFT JOIN player_access a ON a.clerk_user_id = i.user_id
         ORDER BY COALESCE(p.username, i.user_id), i.user_id
         LIMIT 500`
      );
      return result.rows.map((row) => ({
        userId: String(row.user_id),
        username: nullableText(row.username),
        role: String(row.role),
        membershipState: String(row.membership_state),
        createdAt: nullableIso(row.created_at)
      }));
    },

    /** @param {string} userId */
    async membershipFor(userId) {
      const result = await pool.query(
        `SELECT a.clerk_user_id AS user_id,
                a.membership_state,
                a.entitlement_updated_at,
                purchase.id AS purchase_id,
                purchase.status AS purchase_status,
                purchase.payment_intent_id,
                purchase.created_at AS purchase_created_at
         FROM player_access a
         LEFT JOIN LATERAL (
           SELECT id, status, payment_intent_id, created_at
           FROM lifetime_purchases
           WHERE player_id = a.clerk_user_id
           ORDER BY created_at DESC
           LIMIT 1
         ) purchase ON TRUE
         WHERE a.clerk_user_id = $1`,
        [userId]
      );
      const row = result.rows[0];
      return row
        ? {
            userId: String(row.user_id),
            membershipState: String(row.membership_state),
            entitlementUpdatedAt: nullableIso(row.entitlement_updated_at),
            purchaseId: nullableText(row.purchase_id),
            purchaseStatus: nullableText(row.purchase_status),
            paymentIntentId: nullableText(row.payment_intent_id),
            purchaseCreatedAt: nullableIso(row.purchase_created_at)
          }
        : null;
    },

    /**
     * @param {{ beforeId: number | null, limit: number }} options
     */
    async listAuditEvents({ beforeId, limit }) {
      const result = await pool.query(
        `SELECT id, actor_id, actor_role, action, resource_type, resource_id,
                before, after, created_at
         FROM audit_events
         WHERE ($1::BIGINT IS NULL OR id < $1)
         ORDER BY id DESC
         LIMIT $2`,
        [beforeId, limit]
      );
      return result.rows.map((row) => ({
        id: Number(row.id),
        actorId: String(row.actor_id),
        actorRole: String(row.actor_role),
        action: String(row.action),
        resourceType: String(row.resource_type),
        resourceId: nullableText(row.resource_id),
        before: row.before ?? null,
        after: row.after ?? null,
        createdAt: nullableIso(row.created_at)
      }));
    },

    async dashboardMetrics() {
      const result = await pool.query(
        `SELECT (
           SELECT COUNT(*) FROM (
             SELECT clerk_user_id AS user_id FROM players
             UNION
             SELECT user_id FROM user_roles
             UNION
             SELECT clerk_user_id AS user_id FROM player_access
           ) identities
         ) AS explorers,
         (SELECT COUNT(DISTINCT player_id) FROM run_access_grants
          WHERE created_at >= date_trunc('day', now())) AS daily_active_explorers,
         (SELECT COUNT(*) FROM run_access_grants
          WHERE created_at >= date_trunc('day', now())) AS runs_started_today,
         (SELECT COUNT(*) FROM lifetime_purchases
          WHERE paid_at IS NOT NULL) AS lifetime_conversions,
         (SELECT COUNT(*) FROM player_access
          WHERE membership_state = 'active') AS active_memberships,
         (SELECT COUNT(*) FROM question_versions
          WHERE status = 'published') AS published_questions,
         (SELECT COUNT(*) FROM webhook_inbox
          WHERE status = 'dead') AS dead_deliveries`
      );
      const row = result.rows[0] ?? {};
      return {
        explorers: Number(row.explorers ?? 0),
        dailyActiveExplorers: Number(row.daily_active_explorers ?? 0),
        runsStartedToday: Number(row.runs_started_today ?? 0),
        lifetimeConversions: Number(row.lifetime_conversions ?? 0),
        activeMemberships: Number(row.active_memberships ?? 0),
        publishedQuestions: Number(row.published_questions ?? 0),
        deadDeliveries: Number(row.dead_deliveries ?? 0)
      };
    }
  };
}

/** @param {unknown} value */
function nullableText(value) {
  return value === null || value === undefined ? null : String(value);
}

/** @param {unknown} value */
function nullableIso(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}
