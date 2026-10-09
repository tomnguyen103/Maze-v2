/**
 * Funnel Counts. Database triggers count the account, activation and Checkout
 * steps. This store counts the one step no row change marks: a visit.
 *
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<unknown>
 * }} pool
 */
export function createFunnelStore(pool) {
  return {
    /** @param {string} campaign An allowlisted Campaign Code, or "". */
    async recordVisit(campaign) {
      await pool.query("SELECT count_adult_offer_visit($1)", [campaign]);
    }
  };
}
