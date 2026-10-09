/**
 * Funnel Counts. Database triggers count the account, activation and Checkout
 * steps. This store counts the one step no row change marks: a visit. It also
 * reads the counts and the Financial Fact totals for the admin export.
 *
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<{
 *     rows: Record<string, unknown>[]
 *   }>
 * }} pool
 */
export function createFunnelStore(pool) {
  return {
    /** @param {string} campaign An allowlisted Campaign Code, or "". */
    async recordVisit(campaign) {
      await pool.query("SELECT count_adult_offer_visit($1)", [campaign]);
    },

    /**
     * The daily Funnel Counts and the Financial Fact totals of one Billing
     * Mode, for UTC days `from` to `to` inclusive. The three steps before
     * Checkout carry no mode, so both modes return them. A fact counts on the
     * day it was paid, and its status is the status now.
     *
     * @param {{ from: string, to: string, mode: "live" | "test" }} range
     */
    async report({ from, to, mode }) {
      const counts = await pool.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, campaign, count
         FROM funnel_counts
         WHERE day BETWEEN $1::date AND $2::date
           AND mode IN ('', $3)
         ORDER BY day, metric, campaign`,
        [from, to, mode]
      );
      const facts = await pool.query(
        `SELECT COUNT(*) AS gross_purchases,
                COUNT(*) FILTER (WHERE status = 'paid') AS net_purchases,
                COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count,
                COUNT(*) FILTER (WHERE status = 'disputed') AS disputed_count,
                COALESCE(SUM(refunded_cents), 0) AS refunded_cents
         FROM financial_facts
         WHERE billing_mode = $3
           AND (paid_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date`,
        [from, to, mode]
      );
      const totals = facts.rows[0] ?? {};
      return {
        counts: counts.rows.map((row) => ({
          day: String(row.day),
          metric: String(row.metric),
          campaign: String(row.campaign),
          count: Number(row.count)
        })),
        summary: {
          grossPurchases: Number(totals.gross_purchases ?? 0),
          netPurchases: Number(totals.net_purchases ?? 0),
          refundedCount: Number(totals.refunded_count ?? 0),
          disputedCount: Number(totals.disputed_count ?? 0),
          refundedCents: Number(totals.refunded_cents ?? 0)
        }
      };
    }
  };
}
