import { describe, expect, it } from "vitest";
import { createFunnelStore } from "../server/funnel-store.js";

/**
 * A pool that answers each query with the next canned result and records the
 * SQL and the values.
 *
 * @param {Record<string, unknown>[][]} results
 */
function fakePool(results) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const calls = [];
  return {
    calls,
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: results[calls.length - 1] ?? [] };
    }
  };
}

describe("Funnel store report", () => {
  it("US-10.1 maps the daily counts and the Financial Fact totals to numbers", async () => {
    const pool = fakePool([
      [
        { day: "2026-10-01", metric: "adult_offer_visit", campaign: "youtube", count: "40" },
        { day: "2026-10-01", metric: "checkout_created", campaign: "", count: "3" }
      ],
      [
        {
          gross_purchases: "3",
          net_purchases: "1",
          refunded_count: "1",
          disputed_count: "1",
          refunded_cents: "599"
        }
      ]
    ]);

    const report = await createFunnelStore(pool).report({
      from: "2026-10-01",
      to: "2026-10-07",
      mode: "live"
    });

    expect(report).toEqual({
      counts: [
        { day: "2026-10-01", metric: "adult_offer_visit", campaign: "youtube", count: 40 },
        { day: "2026-10-01", metric: "checkout_created", campaign: "", count: 3 }
      ],
      summary: {
        grossPurchases: 3,
        netPurchases: 1,
        refundedCount: 1,
        disputedCount: 1,
        refundedCents: 599
      }
    });
  });

  it("US-10.2 binds the range and the Billing Mode to both reads", async () => {
    const pool = fakePool([[], []]);

    await createFunnelStore(pool).report({
      from: "2026-10-01",
      to: "2026-10-07",
      mode: "test"
    });

    expect(pool.calls).toHaveLength(2);
    for (const call of pool.calls) {
      expect(call.values).toEqual(["2026-10-01", "2026-10-07", "test"]);
    }
    expect(pool.calls[0]?.sql).toContain("mode IN ('', $3)");
    expect(pool.calls[1]?.sql).toContain("billing_mode = $3");
  });

  it("US-10.1 sums the shards of each day, step and Campaign Code", async () => {
    const pool = fakePool([[], []]);

    await createFunnelStore(pool).report({
      from: "2026-10-01",
      to: "2026-10-07",
      mode: "live"
    });

    const sql = pool.calls[0]?.sql ?? "";
    expect(sql).toContain("SUM(count) AS count");
    expect(sql).toContain("GROUP BY day, metric, campaign");
    expect(sql).toContain("ORDER BY day, metric, campaign");
  });

  it("US-10.1 reports zero totals for a range with no facts", async () => {
    const pool = fakePool([[], [{}]]);

    const report = await createFunnelStore(pool).report({
      from: "2026-10-01",
      to: "2026-10-01",
      mode: "live"
    });

    expect(report).toEqual({
      counts: [],
      summary: {
        grossPurchases: 0,
        netPurchases: 0,
        refundedCount: 0,
        disputedCount: 0,
        refundedCents: 0
      }
    });
  });
});
