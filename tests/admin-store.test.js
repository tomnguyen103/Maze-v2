import { describe, expect, it } from "vitest";
import { createAdminStore } from "../server/admin-store.js";

/** @param {Record<string, unknown>[]} rows */
function poolWith(rows) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const queries = [];
  return {
    queries,
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      queries.push({ sql, values });
      return { rows };
    }
  };
}

describe("admin store", () => {
  it("lists every known Explorer with role and membership state", async () => {
    const pool = poolWith([
      {
        user_id: "user_1",
        username: "Nova",
        role: "moderator",
        membership_state: "active",
        created_at: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    const store = createAdminStore(pool);
    await expect(store.listUsers()).resolves.toEqual({
      users: [
        {
          userId: "user_1",
          username: "Nova",
          role: "moderator",
          membershipState: "active",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      hasMore: false
    });
    expect(pool.queries[0].sql).toContain("UNION");
    expect(pool.queries[0].sql).toContain("user_roles");
    expect(pool.queries[0].sql).toContain("player_access");
    expect(pool.queries[0].sql).toContain("LIMIT 501");
  });

  it("surfaces when the Explorer directory is truncated", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      user_id: `user_${index}`,
      username: null,
      role: "player",
      membership_state: "none",
      created_at: null
    }));
    const store = createAdminStore(poolWith(rows));
    const result = await store.listUsers();
    expect(result.users).toHaveLength(500);
    expect(result.hasMore).toBe(true);
  });

  it("returns the latest purchase used for membership support", async () => {
    const pool = poolWith([
      {
        user_id: "user_1",
        membership_state: "refunded",
        entitlement_updated_at: new Date("2026-02-01T00:00:00.000Z"),
        purchase_id: "purchase_1",
        purchase_status: "refunded",
        payment_intent_id: "pi_1",
        purchase_created_at: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    const store = createAdminStore(pool);
    await expect(store.membershipFor("user_1")).resolves.toMatchObject({
      userId: "user_1",
      membershipState: "refunded",
      purchaseId: "purchase_1",
      purchaseStatus: "refunded",
      paymentIntentId: "pi_1"
    });
    expect(pool.queries[0].values).toEqual(["user_1"]);
    expect(pool.queries[0].sql).toContain("ORDER BY created_at DESC");
  });

  it("reads audit pages newest-first without exposing chain hashes", async () => {
    const pool = poolWith([
      {
        id: "9",
        actor_id: "admin_1",
        actor_role: "admin",
        action: "role.grant",
        resource_type: "user_role",
        resource_id: "user_1",
        before: { role: "player" },
        after: { role: "moderator" },
        created_at: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    const store = createAdminStore(pool);
    await expect(
      store.listAuditEvents({ beforeId: 10, limit: 25 })
    ).resolves.toEqual([
      {
        id: 9,
        actorId: "admin_1",
        actorRole: "admin",
        action: "role.grant",
        resourceType: "user_role",
        resourceId: "user_1",
        before: { role: "player" },
        after: { role: "moderator" },
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(pool.queries[0].values).toEqual([10, 25]);
    expect(pool.queries[0].sql).toContain("ORDER BY id DESC");
    expect(pool.queries[0].sql).not.toContain("row_hash");
  });

  it("returns database-backed workbench counts", async () => {
    const pool = poolWith([
      {
        explorers: "12",
        daily_active_explorers: "4",
        daily_active_explorers_yesterday: "6",
        runs_started_today: "9",
        runs_started_yesterday: "7",
        lifetime_conversions: "3",
        active_memberships: "3",
        published_questions: "8",
        dead_deliveries: "1"
      }
    ]);
    const store = createAdminStore(pool);
    await expect(store.dashboardMetrics()).resolves.toEqual({
      explorers: 12,
      dailyActiveExplorers: 4,
      dailyActiveExplorersYesterday: 6,
      runsStartedToday: 9,
      runsStartedYesterday: 7,
      lifetimeConversions: 3,
      activeMemberships: 3,
      publishedQuestions: 8,
      deadDeliveries: 1
    });
    expect(pool.queries[0].sql).toContain("COUNT");
    // DASH-01: the two period-scoped metrics get a real yesterday
    // comparison; the five running-total metrics do not get a fabricated
    // one.
    expect(pool.queries[0].sql).toContain("daily_active_explorers_yesterday");
    expect(pool.queries[0].sql).toContain("runs_started_yesterday");
  });
});
